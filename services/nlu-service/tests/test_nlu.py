"""Tests for the NLU router endpoints."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestExtractSymptoms:
    """POST /api/v1/nlu/extract-symptoms"""

    def test_symptom_extraction_success(
        self, test_client, auth_headers, mock_bedrock_client
    ):
        """Successful symptom extraction returns structured symptoms."""
        # Configure the symptom extractor mock
        test_client.app.state.symptom_extractor.extract = AsyncMock(
            return_value={
                "symptoms": [
                    MagicMock(
                        name="headache",
                        original_text="sir dard",
                        severity=MagicMock(value="moderate"),
                        duration="2 days",
                        onset=None,
                        body_system=MagicMock(value="neurological"),
                        icd10_code="R51.9",
                        confidence=0.92,
                        negated=False,
                        qualifiers=[],
                    )
                ],
                "medical_entities": [],
                "processing_time_ms": 450.0,
            }
        )

        response = test_client.post(
            "/api/v1/nlu/extract-symptoms",
            json={
                "text": "Doctor sahab, mujhe do din se sir mein dard ho raha hai",
                "language": "hi",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "symptoms" in body
        assert len(body["symptoms"]) >= 1
        assert body["symptoms"][0]["name"] == "headache"
        assert body["raw_text"] is not None

    def test_symptom_extraction_empty_text_rejected(self, test_client, auth_headers):
        """Empty text is rejected with 422 (Pydantic min_length=1)."""
        response = test_client.post(
            "/api/v1/nlu/extract-symptoms",
            json={"text": ""},
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_symptom_extraction_missing_auth(self, test_client):
        """Missing auth token returns 401."""
        response = test_client.post(
            "/api/v1/nlu/extract-symptoms",
            json={"text": "I have a headache"},
        )

        assert response.status_code == 401


class TestContradictionDetection:
    """POST /api/v1/nlu/contradictions"""

    def test_contradiction_detection(self, test_client, auth_headers, mock_bedrock_client):
        """Contradiction check returns parsed contradictions from Bedrock response."""
        mock_bedrock_client.invoke_and_parse_json.return_value = {
            "data": {
                "contradictions": [
                    {
                        "description": "Patient denies fever but temperature is elevated",
                        "statement_a": "No fever reported",
                        "statement_b": "Temperature 38.8 C",
                        "severity": "high",
                        "category": "vital_symptom_mismatch",
                        "confidence": 0.92,
                        "suggested_questions": [
                            "Have you felt warm or had chills recently?"
                        ],
                    }
                ],
                "summary": "One high-severity contradiction detected.",
            },
            "usage": {"input_tokens": 300, "output_tokens": 200},
            "elapsed_ms": 600.0,
        }

        response = test_client.post(
            "/api/v1/nlu/contradictions",
            json={
                "current_symptoms": [
                    {
                        "name": "headache",
                        "original_text": "sir dard",
                        "severity": "moderate",
                    }
                ],
                "vital_signs": {"temperature_celsius": 38.8},
                "conversation_history": [
                    {"role": "patient", "text": "Mujhe bukhar nahi hai"},
                ],
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert len(body["contradictions"]) == 1
        c = body["contradictions"][0]
        assert c["severity"] == "high"
        assert c["category"] == "vital_symptom_mismatch"
        assert c["confidence"] == 0.92
        assert len(c["suggested_questions"]) >= 1
        assert body["has_critical"] is True

    def test_contradiction_no_symptoms(self, test_client, auth_headers, mock_bedrock_client):
        """With no symptoms, an empty contradictions list is expected."""
        mock_bedrock_client.invoke_and_parse_json.return_value = {
            "data": {"contradictions": [], "summary": "No contradictions found."},
            "usage": {},
            "elapsed_ms": 100.0,
        }

        response = test_client.post(
            "/api/v1/nlu/contradictions",
            json={"current_symptoms": []},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert len(body["contradictions"]) == 0
        assert body["has_critical"] is False


class TestSOAPGeneration:
    """POST /api/v1/nlu/soap-generate"""

    def test_generate_soap_prompt(self, test_client, auth_headers, mock_bedrock_client):
        """SOAP generation returns all four sections."""
        mock_bedrock_client.invoke_and_parse_json.return_value = {
            "data": {
                "subjective": "Patient reports headache for 2 days with fever.",
                "objective": "Temperature 38.5 C, HR 88, BP 120/80.",
                "assessment": "Likely viral upper respiratory infection.",
                "plan": "Paracetamol 500mg TID, review in 3 days.",
            },
            "usage": {},
            "elapsed_ms": 500.0,
        }

        response = test_client.post(
            "/api/v1/nlu/soap-generate",
            json={
                "transcript": "Doctor: Kya taklif hai? Patient: Do din se sir dard aur bukhar.",
                "symptoms": [
                    {"name": "headache", "original_text": "sir dard", "severity": "moderate"},
                    {"name": "fever", "original_text": "bukhar", "severity": "moderate"},
                ],
                "vitals": {"temperature_celsius": 38.5, "heart_rate_bpm": 88},
                "triage_level": "routine",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        soap = body["soap"]
        assert soap["subjective"] != ""
        assert soap["objective"] != ""
        assert soap["assessment"] != ""
        assert soap["plan"] != ""
        assert body["processing_time_ms"] > 0


class TestMedicalEntityExtraction:
    """POST /api/v1/nlu/medical-entities"""

    def test_medical_entity_extraction(
        self, test_client, auth_headers, mock_comprehend_medical
    ):
        """Medical entity extraction returns entities from Comprehend Medical."""
        response = test_client.post(
            "/api/v1/nlu/medical-entities",
            json={"text": "Patient has diabetes and is taking metformin 500mg twice daily."},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "entities" in body
        assert body["processing_time_ms"] >= 0

    def test_medical_entity_empty_text_rejected(self, test_client, auth_headers):
        """Empty text is rejected with 422."""
        response = test_client.post(
            "/api/v1/nlu/medical-entities",
            json={"text": ""},
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestSummarize:
    """POST /api/v1/nlu/summarize"""

    def test_summarize_success(self, test_client, auth_headers, mock_bedrock_client):
        """Summarization returns a summary and key findings."""
        mock_bedrock_client.invoke_and_parse_json.return_value = {
            "data": {
                "summary": "35-year-old male with 2-day history of headache and fever.",
                "key_findings": ["Headache - moderate severity", "Fever - 38.5 C"],
            },
            "usage": {},
            "elapsed_ms": 300.0,
        }

        response = test_client.post(
            "/api/v1/nlu/summarize",
            json={
                "transcript": "Doctor: Tell me what is wrong. Patient: I have had a headache for 2 days and fever.",
                "language": "en",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "summary" in body
        assert len(body["key_findings"]) >= 1
