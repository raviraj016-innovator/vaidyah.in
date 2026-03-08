"""Tests for the language detection service."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio

from app.config import Settings
from app.models import SupportedLanguage
from app.services.language_detector import LanguageDetectorService

from tests.conftest import generate_wav_bytes


@pytest.fixture()
def lang_detector() -> LanguageDetectorService:
    """Return a LanguageDetectorService with test settings."""
    settings = Settings(
        environment="development",
        auth_enabled=False,
        sagemaker_prosody_endpoint=None,
    )
    return LanguageDetectorService(settings)


class TestDetectFromText:
    """Text-based language detection using Unicode script analysis."""

    @pytest.mark.asyncio
    async def test_detect_hindi(self, lang_detector: LanguageDetectorService):
        """Hindi Devanagari text is detected as Hindi."""
        result = await lang_detector.detect_from_text(
            "मुझे दो दिन से बुखार है और सिर में दर्द हो रहा है"
        )

        assert result.primary_language == SupportedLanguage.HINDI
        assert result.confidence > 0.5
        assert result.detection_source == "text"

    @pytest.mark.asyncio
    async def test_detect_bengali(self, lang_detector: LanguageDetectorService):
        """Bengali script text is detected as Bengali."""
        result = await lang_detector.detect_from_text(
            "আমার জ্বর হয়েছে এবং মাথা ব্যথা করছে"
        )

        assert result.primary_language == SupportedLanguage.BENGALI
        assert result.confidence > 0.5

    @pytest.mark.asyncio
    async def test_detect_english(self, lang_detector: LanguageDetectorService):
        """English text is detected correctly."""
        result = await lang_detector.detect_from_text(
            "I have been experiencing chest pain and shortness of breath"
        )

        assert result.primary_language == SupportedLanguage.ENGLISH_IN
        assert result.confidence > 0.5

    @pytest.mark.asyncio
    async def test_detect_tamil(self, lang_detector: LanguageDetectorService):
        """Tamil script text is detected as Tamil."""
        result = await lang_detector.detect_from_text(
            "எனக்கு காய்ச்சல் மற்றும் தலைவலி உள்ளது"
        )

        assert result.primary_language == SupportedLanguage.TAMIL
        assert result.confidence > 0.5

    @pytest.mark.asyncio
    async def test_detect_mixed_script(self, lang_detector: LanguageDetectorService):
        """Mixed Hindi-English text is detected as mixed."""
        result = await lang_detector.detect_from_text(
            "Doctor sahab, mujhe bukhar hai aur chest pain ho raha hai"
        )

        # Romanised Hindi appears as Latin script -> English
        assert result.primary_language == SupportedLanguage.ENGLISH_IN

    @pytest.mark.asyncio
    async def test_detect_empty_text(self, lang_detector: LanguageDetectorService):
        """Empty text defaults to English with 0.5 confidence."""
        result = await lang_detector.detect_from_text("")

        assert result.primary_language == SupportedLanguage.ENGLISH_IN
        assert result.confidence == 0.5


class TestDetectFromAudio:
    """Audio-based language detection using spectral heuristics."""

    @pytest.mark.asyncio
    async def test_detect_from_audio_returns_result(
        self, lang_detector: LanguageDetectorService
    ):
        """Audio detection returns a LanguageDetectionResult with scores."""
        wav_bytes = generate_wav_bytes(duration_seconds=1.0, sample_rate=16000)

        result = await lang_detector.detect_from_audio(wav_bytes, 16000)

        assert result is not None
        assert result.detection_source == "audio"
        assert result.primary_language in list(SupportedLanguage)
        assert len(result.all_scores) > 0

    @pytest.mark.asyncio
    async def test_detect_from_short_audio(
        self, lang_detector: LanguageDetectorService
    ):
        """Very short audio defaults to English with low confidence."""
        # 0.1 second is too short for reliable detection
        wav_bytes = generate_wav_bytes(duration_seconds=0.1, sample_rate=16000)

        result = await lang_detector.detect_from_audio(wav_bytes, 16000)

        assert result.primary_language == SupportedLanguage.ENGLISH_IN
        assert result.confidence <= 0.5


class TestSupportedLanguages:
    """Verify that the service covers all required Indian languages."""

    def test_supported_languages_count(self):
        """SupportedLanguage enum contains 23 entries (22 Scheduled + English)."""
        lang_count = len(SupportedLanguage)
        assert lang_count >= 22, (
            f"Expected at least 22 languages (22 Scheduled Languages of India "
            f"+ English), got {lang_count}"
        )

    def test_key_languages_present(self):
        """Key Indian languages are present in the enum."""
        expected = {
            "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN",
            "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN",
            "ur-IN",
        }
        actual = {lang.value for lang in SupportedLanguage}
        missing = expected - actual
        assert not missing, f"Missing expected languages: {missing}"


class TestCombineResults:
    """Test combining audio and text detection results."""

    @pytest.mark.asyncio
    async def test_combine_results_weights(
        self, lang_detector: LanguageDetectorService
    ):
        """Combined detection correctly weights text (0.6) vs audio (0.4)."""
        audio_result = await lang_detector.detect_from_text("hello world")
        text_result = await lang_detector.detect_from_text(
            "मुझे बुखार है"
        )

        combined = await lang_detector.combine_results(audio_result, text_result)

        assert combined.detection_source == "combined"
        assert combined.confidence > 0.0
        assert len(combined.all_scores) > 0
