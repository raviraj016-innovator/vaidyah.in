"""
Medical term normalization utilities for the NLU service.

Provides:
- Standardization of medical terminology (synonyms, abbreviations, typos).
- Hindi-to-English symptom mapping for code-mixed patient conversations.
- ICD-10 code lookup for common symptoms and conditions.
- Transliteration helpers for Comprehend Medical (English-only API).
"""

from __future__ import annotations

import re
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Hindi / Hinglish symptom -> English medical term mapping
# ---------------------------------------------------------------------------
_HINDI_SYMPTOM_MAP: dict[str, str] = {
    # Common Hindi symptoms (Devanagari)
    "\u092c\u0941\u0916\u093e\u0930": "fever",
    "\u0938\u093f\u0930\u0926\u0930\u094d\u0926": "headache",
    "\u0916\u093e\u0902\u0938\u0940": "cough",
    "\u091c\u0941\u0915\u093e\u092e": "cold",
    "\u092a\u0947\u091f \u0926\u0930\u094d\u0926": "abdominal pain",
    "\u0909\u0932\u094d\u091f\u0940": "vomiting",
    "\u0926\u0938\u094d\u0924": "diarrhea",
    "\u0915\u092e\u091c\u094b\u0930\u0940": "weakness",
    "\u0925\u0915\u093e\u0928": "fatigue",
    "\u091a\u0915\u094d\u0915\u0930 \u0906\u0928\u093e": "dizziness",
    "\u0938\u093e\u0902\u0938 \u0932\u0947\u0928\u0947 \u092e\u0947\u0902 \u0924\u0915\u0932\u0940\u092b": "difficulty breathing",
    "\u091b\u093e\u0924\u0940 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "chest pain",
    "\u0915\u092e\u0930 \u0926\u0930\u094d\u0926": "back pain",
    "\u091c\u094b\u0921\u094b\u0902 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "joint pain",
    "\u0917\u0932\u0947 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "sore throat",
    "\u0928\u0940\u0902\u0926 \u0928\u0939\u0940\u0902 \u0906\u0924\u0940": "insomnia",
    "\u092d\u0942\u0916 \u0928\u0939\u0940\u0902 \u0932\u0917\u0924\u0940": "loss of appetite",
    "\u0916\u0941\u091c\u0932\u0940": "itching",
    "\u0938\u0942\u091c\u0928": "swelling",
    "\u092c\u0926\u0928 \u0926\u0930\u094d\u0926": "body ache",
    "\u0906\u0902\u0916\u094b\u0902 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "eye pain",
    "\u0915\u093e\u0928 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "earache",
    "\u092a\u0948\u0930\u094b\u0902 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926": "foot pain",

    # Hinglish / romanized Hindi
    "bukhar": "fever",
    "bukhaar": "fever",
    "sir dard": "headache",
    "sar dard": "headache",
    "sirdard": "headache",
    "khansi": "cough",
    "khaansi": "cough",
    "jukam": "cold",
    "zukam": "cold",
    "pet dard": "abdominal pain",
    "pet mein dard": "abdominal pain",
    "ulti": "vomiting",
    "dast": "diarrhea",
    "kamzori": "weakness",
    "kamjori": "weakness",
    "thakan": "fatigue",
    "chakkar": "dizziness",
    "chakkar aana": "dizziness",
    "saans lene mein taklif": "difficulty breathing",
    "saans phoolna": "difficulty breathing",
    "seene mein dard": "chest pain",
    "chhati mein dard": "chest pain",
    "kamar dard": "back pain",
    "jodo mein dard": "joint pain",
    "gale mein dard": "sore throat",
    "neend nahi aati": "insomnia",
    "bhook nahi lagti": "loss of appetite",
    "khujli": "itching",
    "sujan": "swelling",
    "badan dard": "body ache",
    "aankh dard": "eye pain",
    "kaan dard": "earache",
    "pair dard": "foot pain",
    "peshab mein jalan": "burning urination",
    "sugar": "diabetes",
    "bp": "hypertension",
    "blood pressure": "blood_pressure_concern",
    "high bp": "hypertension",
    "low bp": "hypotension",
    "motapa": "obesity",
    "gas": "flatulence",
    "acidity": "acid reflux",
    "kabz": "constipation",
}

# ---------------------------------------------------------------------------
# Medical synonym / abbreviation normalization
# ---------------------------------------------------------------------------
_SYNONYM_MAP: dict[str, str] = {
    # Common abbreviations
    "htn": "hypertension",
    "dm": "diabetes mellitus",
    "dm2": "type 2 diabetes mellitus",
    "dm1": "type 1 diabetes mellitus",
    "t2dm": "type 2 diabetes mellitus",
    "t1dm": "type 1 diabetes mellitus",
    "mi": "myocardial infarction",
    "cva": "cerebrovascular accident",
    "copd": "chronic obstructive pulmonary disease",
    "ckd": "chronic kidney disease",
    "uti": "urinary tract infection",
    "urti": "upper respiratory tract infection",
    "lrti": "lower respiratory tract infection",
    "sob": "shortness of breath",
    "nausea/vomiting": "nausea and vomiting",
    "n/v": "nausea and vomiting",
    "ha": "headache",
    "abd pain": "abdominal pain",
    "cp": "chest pain",
    "loc": "loss of consciousness",
    "lbp": "low back pain",

    # Common synonyms and colloquial terms
    "tummy ache": "abdominal pain",
    "stomach ache": "abdominal pain",
    "stomach pain": "abdominal pain",
    "belly pain": "abdominal pain",
    "throwing up": "vomiting",
    "puking": "vomiting",
    "loose motions": "diarrhea",
    "loose stools": "diarrhea",
    "running nose": "rhinorrhea",
    "runny nose": "rhinorrhea",
    "stuffy nose": "nasal congestion",
    "blocked nose": "nasal congestion",
    "breathlessness": "dyspnea",
    "shortness of breath": "dyspnea",
    "difficulty breathing": "dyspnea",
    "can't breathe": "dyspnea",
    "hard to breathe": "dyspnea",
    "giddiness": "dizziness",
    "light headed": "dizziness",
    "lightheaded": "dizziness",
    "feeling faint": "dizziness",
    "fits": "seizures",
    "convulsions": "seizures",
    "heart attack": "myocardial infarction",
    "stroke": "cerebrovascular accident",
    "high sugar": "hyperglycemia",
    "low sugar": "hypoglycemia",
    "high blood pressure": "hypertension",
    "low blood pressure": "hypotension",
    "sugar disease": "diabetes mellitus",
    "piles": "hemorrhoids",
    "stones": "calculi",
    "kidney stones": "renal calculi",
    "gall stones": "cholelithiasis",
    "gallstones": "cholelithiasis",
    "water retention": "edema",
    "swelling": "edema",
    "rash": "dermatitis",
    "skin rash": "dermatitis",
    "burning sensation": "burning pain",
    "pins and needles": "paresthesia",
    "tingling": "paresthesia",
    "numbness": "hypoesthesia",
    "weight loss": "unintentional weight loss",
    "night sweats": "nocturnal hyperhidrosis",
}

# ---------------------------------------------------------------------------
# ICD-10 code lookup (common symptoms and conditions)
# ---------------------------------------------------------------------------
_ICD10_MAP: dict[str, str] = {
    "fever": "R50.9",
    "headache": "R51",
    "cough": "R05",
    "cold": "J00",
    "abdominal pain": "R10.9",
    "vomiting": "R11.10",
    "nausea": "R11.0",
    "nausea and vomiting": "R11.2",
    "diarrhea": "R19.7",
    "weakness": "R53.1",
    "fatigue": "R53.83",
    "dizziness": "R42",
    "dyspnea": "R06.00",
    "chest pain": "R07.9",
    "back pain": "M54.9",
    "low back pain": "M54.5",
    "joint pain": "M25.50",
    "sore throat": "J02.9",
    "insomnia": "G47.00",
    "loss of appetite": "R63.0",
    "itching": "L29.9",
    "edema": "R60.9",
    "body ache": "M79.1",
    "eye pain": "H57.10",
    "earache": "H92.09",
    "constipation": "K59.00",
    "rhinorrhea": "R09.89",
    "nasal congestion": "R09.81",
    "hypertension": "I10",
    "hypotension": "I95.9",
    "diabetes mellitus": "E11.9",
    "type 2 diabetes mellitus": "E11.9",
    "type 1 diabetes mellitus": "E10.9",
    "hyperglycemia": "R73.9",
    "hypoglycemia": "E16.2",
    "myocardial infarction": "I21.9",
    "cerebrovascular accident": "I63.9",
    "chronic obstructive pulmonary disease": "J44.1",
    "chronic kidney disease": "N18.9",
    "urinary tract infection": "N39.0",
    "upper respiratory tract infection": "J06.9",
    "lower respiratory tract infection": "J22",
    "seizures": "R56.9",
    "dermatitis": "L30.9",
    "hemorrhoids": "K64.9",
    "renal calculi": "N20.0",
    "cholelithiasis": "K80.20",
    "acid reflux": "K21.0",
    "flatulence": "R14.3",
    "obesity": "E66.9",
    "paresthesia": "R20.2",
    "hypoesthesia": "R20.1",
    "unintentional weight loss": "R63.4",
    "nocturnal hyperhidrosis": "R61",
    "burning urination": "R30.0",
    "pneumonia": "J18.9",
    "asthma": "J45.909",
    "tuberculosis": "A15.9",
    "malaria": "B54",
    "dengue": "A90",
    "typhoid": "A01.00",
    "anemia": "D64.9",
    "anxiety": "F41.9",
    "depression": "F32.9",
    "foot pain": "M79.671",
    "burning pain": "R52",
}


class MedicalNormalizer:
    """Normalizes medical terminology for the NLU pipeline.

    Responsibilities:
    - Map colloquial / Hindi symptom names to standardized English terms.
    - Resolve abbreviations and common synonyms.
    - Look up ICD-10 codes for normalized terms.
    - Transliterate Hindi text to English for AWS Comprehend Medical.
    """

    def __init__(self) -> None:
        # Build combined lookup (lowercase keys)
        self._synonym_map: dict[str, str] = {
            k.lower(): v for k, v in _SYNONYM_MAP.items()
        }
        self._hindi_map: dict[str, str] = {
            k.lower(): v for k, v in _HINDI_SYMPTOM_MAP.items()
        }
        self._icd10_map: dict[str, str] = {
            k.lower(): v for k, v in _ICD10_MAP.items()
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def normalize_term(self, term: str) -> str:
        """Normalize a medical term to its standardized English form.

        Checks Hindi mapping first, then synonym/abbreviation map.
        Returns the original term (title-cased) if no mapping is found.

        Parameters
        ----------
        term : str
            Raw medical term as extracted from patient speech.

        Returns
        -------
        str
            Normalized medical term.
        """
        if not term:
            return term

        key = term.strip().lower()

        # Check Hindi / Hinglish map
        if key in self._hindi_map:
            normalized = self._hindi_map[key]
            logger.debug(
                "medical_normalizer.hindi_mapped",
                original=term,
                normalized=normalized,
            )
            return normalized

        # Check synonym / abbreviation map
        if key in self._synonym_map:
            normalized = self._synonym_map[key]
            logger.debug(
                "medical_normalizer.synonym_mapped",
                original=term,
                normalized=normalized,
            )
            return normalized

        # No mapping found; return cleaned version
        return term.strip()

    def get_icd10_code(self, term: str) -> Optional[str]:
        """Look up the ICD-10 code for a normalized medical term.

        Parameters
        ----------
        term : str
            Normalized medical term.

        Returns
        -------
        str or None
            ICD-10 code if found, otherwise ``None``.
        """
        if not term:
            return None

        key = term.strip().lower()

        # Direct lookup
        code = self._icd10_map.get(key)
        if code:
            return code

        # Try normalizing first then looking up
        normalized = self.normalize_term(term).lower()
        return self._icd10_map.get(normalized)

    def map_hindi_to_english(self, hindi_text: str) -> str:
        """Map Hindi symptom descriptions to English.

        Processes text word-by-word and phrase-by-phrase, replacing known
        Hindi medical terms with their English equivalents.

        Parameters
        ----------
        hindi_text : str
            Text potentially containing Hindi medical terms.

        Returns
        -------
        str
            Text with Hindi medical terms replaced by English equivalents.
        """
        if not hindi_text:
            return hindi_text

        result = hindi_text

        # Try phrase-level matching first (longer phrases first)
        sorted_phrases = sorted(
            self._hindi_map.keys(), key=len, reverse=True
        )
        for phrase in sorted_phrases:
            if phrase in result.lower():
                # Case-insensitive replacement
                pattern = re.compile(re.escape(phrase), re.IGNORECASE)
                result = pattern.sub(self._hindi_map[phrase], result)

        return result

    def transliterate_to_english(
        self, text: str, language: Any = None
    ) -> str:
        """Transliterate / translate text to English for Comprehend Medical.

        For Hindi text, maps known medical terms to English. Non-Hindi text
        is returned as-is. This is a best-effort transliteration designed
        for improving Comprehend Medical's entity extraction accuracy.

        Parameters
        ----------
        text : str
            Input text (potentially in Hindi or code-mixed).
        language : SupportedLanguage, optional
            Source language hint.

        Returns
        -------
        str
            English or transliterated text.
        """
        if not text:
            return text

        # Check if text contains Devanagari characters
        has_devanagari = any(
            "\u0900" <= char <= "\u097F" for char in text
        )

        if has_devanagari:
            return self.map_hindi_to_english(text)

        # For romanized Hindi (Hinglish), try n-gram matching
        words = text.split()
        mapped_words: list[str] = []
        i = 0
        while i < len(words):
            matched = False
            for n in range(min(5, len(words) - i), 0, -1):
                phrase = " ".join(words[i:i+n]).lower()
                if phrase in self._hindi_map:
                    mapped_words.append(self._hindi_map[phrase])
                    i += n
                    matched = True
                    break
            if not matched:
                mapped_words.append(words[i])
                i += 1
        return " ".join(mapped_words)

    def enrich_with_icd10(
        self, symptoms: list[dict],
    ) -> list[dict]:
        """Add ICD-10 codes to a list of symptom dictionaries.

        Parameters
        ----------
        symptoms : list[dict]
            Symptom dicts with at least a ``name`` key.

        Returns
        -------
        list[dict]
            The same list with ``icd10_code`` added where available.
        """
        for symptom in symptoms:
            name = symptom.get("name", "")
            if not symptom.get("icd10_code"):
                code = self.get_icd10_code(name)
                if code:
                    symptom["icd10_code"] = code
        return symptoms
