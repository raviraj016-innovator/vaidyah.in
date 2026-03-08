"""
Dialect and language variant classifier for Indian languages.

Identifies regional dialects within a base language (e.g., Bhojpuri vs.
standard Hindi, Madurai Tamil vs. Kongu Tamil) using lexical markers and
optional phonetic/audio features.  This enables the platform to adapt
vocabulary, TTS voice selection, and NLU prompts to the patient's actual
spoken variant rather than treating all speakers of a language as
homogeneous.

Supported language families and their dialects are defined in
``DIALECT_MAP``.  Classification is performed via rule-based lexical
matching against curated marker word lists in ``DIALECT_MARKERS``, with
an optional ML-based path when a SageMaker endpoint is configured.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

import structlog

from app.config import Settings

logger = structlog.get_logger("voice.services.dialect_classifier")


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class DialectInfo:
    """Result of dialect classification for a text or audio sample.

    Attributes:
        base_language: The parent language code (e.g. ``"hi-IN"``).
        dialect_name: Identified dialect/variant name, or ``"standard"``
            when no specific dialect markers are detected.
        region: Geographic region typically associated with the dialect.
        confidence: Classification confidence in the range ``[0.0, 1.0]``.
        linguistic_features: Dictionary of detected linguistic signals
            that contributed to the classification decision (e.g. matched
            lexical markers, phonetic patterns).
    """

    base_language: str
    dialect_name: str
    region: str
    confidence: float
    linguistic_features: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Dialect map — comprehensive inventory of Indian language dialects
# ---------------------------------------------------------------------------

DIALECT_MAP: dict[str, list[dict[str, str]]] = {
    "hi-IN": [
        {"name": "Bhojpuri", "region": "Eastern UP / Bihar / Jharkhand"},
        {"name": "Braj", "region": "Western UP (Mathura, Agra, Aligarh)"},
        {"name": "Awadhi", "region": "Central UP (Lucknow, Faizabad)"},
        {"name": "Bundeli", "region": "Bundelkhand (MP / UP border)"},
        {"name": "Chhattisgarhi", "region": "Chhattisgarh"},
        {"name": "Marwari", "region": "Western Rajasthan (Jodhpur, Jaisalmer)"},
        {"name": "Rajasthani", "region": "Rajasthan (general)"},
        {"name": "Maithili", "region": "Northern Bihar / Mithila"},
        {"name": "Angika", "region": "Eastern Bihar (Bhagalpur, Munger)"},
        {"name": "Bajjika", "region": "Northern Bihar (Muzaffarpur, Vaishali)"},
    ],
    "bn-IN": [
        {"name": "Sylheti", "region": "Sylhet (Bangladesh) / Barak Valley (Assam)"},
        {"name": "Chittagonian", "region": "Chittagong (Bangladesh) / Tripura"},
        {"name": "Rangpuri", "region": "Rangpur (Bangladesh) / North Bengal"},
    ],
    "ta-IN": [
        {"name": "Madurai Tamil", "region": "Madurai / Southern Tamil Nadu"},
        {"name": "Kongu Tamil", "region": "Coimbatore / Western Tamil Nadu"},
        {"name": "Nellai Tamil", "region": "Tirunelveli / Southernmost Tamil Nadu"},
    ],
    "te-IN": [
        {"name": "Telangana Telugu", "region": "Telangana (Hyderabad, Warangal)"},
        {"name": "Rayalaseema Telugu", "region": "Rayalaseema (Kurnool, Anantapur)"},
        {"name": "Coastal Andhra", "region": "Coastal AP (Visakhapatnam, Vijayawada)"},
    ],
    "mr-IN": [
        {"name": "Varhadi", "region": "Vidarbha (Nagpur, Amravati)"},
        {"name": "Konkani Marathi", "region": "Konkan coast (Ratnagiri, Sindhudurg)"},
        {"name": "Deccani", "region": "Marathwada / Deccan plateau"},
    ],
    "gu-IN": [
        {"name": "Kathiawadi", "region": "Saurashtra / Kathiawar peninsula"},
        {"name": "Surti", "region": "South Gujarat (Surat, Navsari)"},
        {"name": "Charotari", "region": "Central Gujarat (Anand, Kheda)"},
    ],
    "kn-IN": [
        {"name": "Dharwad", "region": "North Karnataka (Dharwad, Belgaum)"},
        {"name": "Mangalore", "region": "Coastal Karnataka (Dakshina Kannada)"},
        {"name": "Havyaka", "region": "Uttara Kannada / Malnad"},
    ],
    "ml-IN": [
        {"name": "Malabar", "region": "North Kerala (Kozhikode, Kannur)"},
        {"name": "Travancore", "region": "South Kerala (Thiruvananthapuram, Kollam)"},
    ],
}


# ---------------------------------------------------------------------------
# Dialect lexical markers
#
# Each dialect has a list of marker tuples: (native_script, romanized).
# These are common words, postpositions, verb endings, or expressions
# that are distinctive to the dialect and unlikely to appear in the
# standard / literary register.
# ---------------------------------------------------------------------------

DIALECT_MARKERS: dict[str, list[tuple[str, str]]] = {
    # ---- Hindi dialects ----------------------------------------------------
    "Bhojpuri": [
        ("बाड़े", "baade"),       # copula "are" (Bhojpuri)
        ("रहल", "rahal"),        # past tense marker
        ("होखे", "hokhe"),       # subjunctive "to be"
        ("बतावs", "batavas"),    # imperative "tell"
        ("ओकर", "okar"),         # possessive "his/her"
        ("काहे", "kaahe"),       # interrogative "why"
        ("बानी", "baani"),       # first-person copula
        ("हवे", "hawe"),         # auxiliary verb
    ],
    "Braj": [
        ("बात", "baat"),         # used distinctively in Braj
        ("मोसों", "moson"),      # "with me" postposition
        ("ताते", "taate"),       # "therefore"
        ("कहाँ", "kahan"),       # "where" with Braj intonation marker
        ("वाको", "vaako"),       # "to him/her"
        ("हमारो", "hamaaro"),    # "our/mine" (Braj possessive)
        ("बृज", "brij"),         # self-referential region name
    ],
    "Awadhi": [
        ("हमार", "hamaar"),      # possessive "my/our"
        ("तोहार", "tohaar"),     # possessive "your"
        ("केहि", "kehi"),        # interrogative pronoun
        ("अवधी", "awadhi"),      # self-referential
        ("रहा", "rahaa"),        # progressive auxiliary (Awadhi form)
        ("मोरा", "moraa"),       # "mine"
        ("काहे", "kaahe"),       # "why" (shared with Bhojpuri)
    ],
    "Bundeli": [
        ("बुंदेली", "bundeli"),   # self-referential
        ("तुमार", "tumaar"),     # "your"
        ("हमार", "hamaar"),      # "our" (shared)
        ("खों", "khon"),         # postposition "to/from"
        ("मोर", "mor"),          # "my"
        ("बेटवा", "betwa"),      # diminutive for "son"
    ],
    "Chhattisgarhi": [
        ("छत्तीसगढ़ी", "chhattisgarhi"),  # self-referential
        ("मन", "man"),           # plural marker (unique usage)
        ("हवे", "hawe"),         # auxiliary "is"
        ("बर", "bar"),           # postposition "for"
        ("संगी", "sangi"),       # "friend"
        ("गोठ", "goth"),         # "conversation/village"
        ("डहर", "dahar"),        # "road/path"
    ],
    "Marwari": [
        ("मारवाड़ी", "marwari"),  # self-referential
        ("म्हारो", "mhaaro"),    # "mine/our"
        ("थारो", "thaaro"),      # "yours"
        ("छोरा", "chhoraa"),     # "boy"
        ("छोरी", "chhori"),      # "girl"
        ("बात", "baat"),         # "thing" (Marwari vowel shift)
        ("कांई", "kaai"),        # "what"
    ],
    "Rajasthani": [
        ("राजस्थानी", "rajasthani"),  # self-referential
        ("म्हारा", "mhaaraa"),   # "ours"
        ("थांका", "thaankaa"),   # "yours"
        ("छोरा", "chhoraa"),     # "boy" (shared with Marwari)
        ("बणो", "bano"),         # "good/nice"
        ("पधारो", "padhaaro"),   # "welcome/come"
    ],
    "Maithili": [
        ("मैथिली", "maithili"),  # self-referential
        ("अछि", "achhi"),        # copula "is"
        ("छी", "chhi"),          # feminine copula
        ("हमर", "hamar"),        # "my"
        ("अहाँ", "ahaan"),       # "you" (honorific)
        ("गेलहुँ", "gelahun"),   # past tense "went"
        ("छल", "chhal"),         # past copula "was"
    ],
    "Angika": [
        ("अंगिका", "angikaa"),   # self-referential
        ("हमर", "hamar"),        # "my" (shared with Maithili)
        ("तोहर", "tohar"),       # "your"
        ("छियो", "chhiyo"),      # copula variant
        ("गेलो", "gelo"),        # past tense "went"
        ("करतो", "karato"),      # progressive "doing"
    ],
    "Bajjika": [
        ("बज्जिका", "bajjikaa"),  # self-referential
        ("हमनी", "hamni"),       # "we" (inclusive)
        ("रउआ", "rauaa"),        # "you" (honorific)
        ("हईं", "hain"),         # copula variant
        ("गइल", "gail"),         # past tense "went"
        ("कइल", "kail"),         # past tense "did"
    ],

    # ---- Bengali dialects --------------------------------------------------
    "Sylheti": [
        ("ছিলটি", "sylheti"),    # self-referential
        ("ফাইন", "fain"),        # "fine/good"
        ("হুন", "hun"),          # "is" (Sylheti copula)
        ("তাইন", "tain"),        # "he/she" (distal pronoun)
        ("খাইছি", "khaichhi"),   # "have eaten"
        ("নিছি", "nichhi"),      # "have taken"
    ],
    "Chittagonian": [
        ("চাটগাঁইয়া", "chatgaiya"),  # self-referential
        ("ফুয়াইন", "fuain"),    # "from where"
        ("অর", "or"),            # "and" (Chittagonian)
        ("গরি", "gori"),         # "doing" (progressive)
        ("হোই", "hoi"),          # "is/becomes"
        ("দেহি", "dehi"),        # "seeing"
    ],
    "Rangpuri": [
        ("রংপুরী", "rangpuri"),  # self-referential
        ("মোর", "mor"),          # "my"
        ("তোর", "tor"),          # "your"
        ("করিছং", "korichhong"),  # "am doing"
        ("মানুষ", "manush"),     # "person" (with Rangpuri phonology)
        ("কেনে", "kene"),        # "why"
    ],

    # ---- Tamil dialects ----------------------------------------------------
    "Madurai Tamil": [
        ("மதுரை", "madurai"),     # regional name
        ("ல", "la"),             # sentence-final particle
        ("டா", "daa"),           # informal address marker (male)
        ("டி", "di"),            # informal address marker (female)
        ("போடா", "podaa"),       # emphatic "go"
        ("வாடா", "vaadaa"),      # emphatic "come" (male)
    ],
    "Kongu Tamil": [
        ("கொங்கு", "kongu"),     # self-referential
        ("போறேன்", "pooren"),     # "I'm going" (Kongu variant)
        ("சாப்டேன்", "saapden"),  # "I ate" (Kongu variant)
        ("என்னாச்சு", "ennaachchu"),  # "what happened"
        ("ங்க", "nga"),          # honorific suffix (Kongu variant)
        ("கெட்டிக்காரன்", "kettikkaaran"),  # "smart person"
    ],
    "Nellai Tamil": [
        ("நெல்லை", "nellai"),    # regional name
        ("போறன்", "poran"),       # "going" (Nellai variant)
        ("வாறன்", "vaaran"),     # "coming" (Nellai variant)
        ("சாப்ட்டன்", "saapttan"),  # "ate" (Nellai variant)
        ("என்னடா", "ennadaa"),   # "what" (emphatic)
        ("பாக்குறன்", "paakkuran"),  # "seeing" (Nellai variant)
    ],

    # ---- Telugu dialects ---------------------------------------------------
    "Telangana Telugu": [
        ("తెలంగాణ", "telangana"),  # regional name
        ("గావాలె", "gaavaale"),   # "want" (Telangana variant)
        ("నడుస్తాండు", "nadustaandu"),  # "walking" (progressive)
        ("ఏందిరా", "endiraa"),   # "what is it"
        ("గిట్ల", "gitla"),      # "like this"
        ("అట్ల", "atla"),        # "like that"
        ("మస్తు", "mastu"),      # "very/a lot"
    ],
    "Rayalaseema Telugu": [
        ("రాయలసీమ", "rayalaseema"),  # regional name
        ("ఏందయ్యా", "endayyaa"),  # "what, sir"
        ("బాగుందా", "baagundaa"),  # "is it good"
        ("పోతానా", "potaanaa"),   # "shall I go"
        ("రారా", "raaraa"),       # "come" (informal)
        ("గుంట", "gunta"),       # "pit/plot" (local measure)
    ],
    "Coastal Andhra": [
        ("కోస్తా ఆంధ్ర", "costa andhra"),  # regional name
        ("అవునా", "avunaa"),      # "is it so?"
        ("ఏంటి", "enti"),         # "what" (Coastal variant)
        ("బావుంది", "baavundi"),  # "it's good"
        ("మంచిది", "manchidi"),   # "it's nice"
        ("చెప్పు", "cheppu"),     # "tell" (imperative)
    ],

    # ---- Marathi dialects --------------------------------------------------
    "Varhadi": [
        ("वऱ्हाडी", "varhadi"),    # self-referential
        ("लेकरू", "lekroo"),      # "child"
        ("काऊन", "kaaun"),        # "why"
        ("बोलतंय", "boltany"),    # "is speaking" (Varhadi progressive)
        ("पोरगा", "porgaa"),      # "boy"
        ("पोरगी", "porgi"),       # "girl"
    ],
    "Konkani Marathi": [
        ("कोंकणी", "konkani"),    # self-referential
        ("रे", "re"),             # interjection particle
        ("कसो", "kaso"),          # "how" (Konkani variant)
        ("केन्ना", "kennaa"),     # "when"
        ("कित्याक", "kityaak"),   # "why"
        ("गेलो", "gelo"),         # "went" (masculine)
    ],
    "Deccani": [
        ("दक्कनी", "dakkani"),    # self-referential
        ("नक्को", "nakko"),       # "don't" (Deccani negation)
        ("बोलतो", "bolto"),       # "speaks" (Deccani form)
        ("कायको", "kaayko"),      # "why"
        ("मेरेकू", "mereku"),     # "to me"
        ("तेरेकू", "tereku"),     # "to you"
    ],

    # ---- Gujarati dialects -------------------------------------------------
    "Kathiawadi": [
        ("કાઠિયાવાડી", "kathiawadi"),  # self-referential
        ("હાલો", "haalo"),       # "let's go"
        ("મારા ભાઈ", "maaraa bhai"),  # "my brother" (emphatic address)
        ("હમજ્યા", "hamajyaa"),  # "understood" (Kathiawadi form)
        ("કેમ છો", "kem chho"),  # "how are you" (Kathiawadi intonation)
        ("ધીંગું", "dhingum"),   # "stubborn"
    ],
    "Surti": [
        ("સુરતી", "surti"),      # self-referential
        ("ચ્યમ", "chyam"),       # "why" (Surti variant)
        ("કરીએ", "kariye"),      # "let's do" (Surti form)
        ("આયા", "aayaa"),        # "came" (Surti past tense)
        ("શેઠ", "sheth"),        # "boss/merchant" (common Surti address)
        ("ફાવે", "faave"),       # "like/prefer"
    ],
    "Charotari": [
        ("ચરોતરી", "charotari"),  # self-referential
        ("ભ'ઈ", "bhai"),         # "brother" (shortened address)
        ("ગ્યો", "gyo"),         # "went" (Charotari past tense)
        ("આવ્યો", "aavyo"),     # "came" (Charotari form)
        ("કેમનું", "kemnun"),    # "how" (Charotari variant)
        ("બરોબર", "barobar"),    # "correct/right"
    ],

    # ---- Kannada dialects --------------------------------------------------
    "Dharwad": [
        ("ಧಾರವಾಡ", "dharwad"),    # regional name
        ("ರೀ", "ri"),             # address particle
        ("ಏನ್ರೀ", "enri"),        # "what?" (Dharwad)
        ("ಹೋಗ್ರಿ", "hogri"),     # "go" (imperative, Dharwad)
        ("ಬರ್ರಿ", "barri"),      # "come" (imperative, Dharwad)
        ("ಮಾಡ್ರಿ", "maadri"),    # "do" (imperative, Dharwad)
    ],
    "Mangalore": [
        ("ಮಂಗಳೂರು", "mangaluru"),  # regional name
        ("ಎಂಚ", "encha"),        # "what" (Tulu-influenced)
        ("ಪೋಲ", "pola"),         # "like/as"
        ("ಉಂಡು", "undu"),        # "is/exists" (Mangalore variant)
        ("ತೂಲ", "toola"),        # "from/at"
        ("ಪಂಡ್", "pand"),        # "previously/before"
    ],
    "Havyaka": [
        ("ಹವ್ಯಕ", "havyaka"),    # self-referential
        ("ಅಪ್ಪೋ", "appo"),       # "then/so"
        ("ಹ್ಯಾಂಗ", "hyaanga"),   # "how" (Havyaka variant)
        ("ಬಪ್ಪ", "bappa"),       # "father" (Havyaka)
        ("ಅಮ್ಮ", "amma"),        # "mother" (Havyaka emphasis)
        ("ಮಾಡೋಣ", "maadona"),    # "let's do" (Havyaka variant)
    ],

    # ---- Malayalam dialects ------------------------------------------------
    "Malabar": [
        ("മലബാർ", "malabar"),     # regional name
        ("ഇങ്ങനെ", "ingane"),    # "like this" (Malabar pronunciation)
        ("എന്താ", "enthaa"),      # "what" (Malabar variant)
        ("പോയിക്കോ", "poyikko"),  # "go" (Malabar imperative)
        ("വേണ്ടാ", "vendaa"),    # "don't want" (Malabar form)
        ("ഒന്നും", "onnum"),     # "nothing" (Malabar pronunciation)
    ],
    "Travancore": [
        ("തിരുവിതാംകൂർ", "thiruvithamkoor"),  # regional name
        ("ചെയ്യാം", "cheyyaam"),  # "will do" (Travancore variant)
        ("എന്തേ", "enthe"),       # "what" (Travancore variant)
        ("ശരി", "shari"),         # "okay" (Travancore pronunciation)
        ("പറ", "para"),           # "tell" (informal, Travancore)
        ("അതെ", "athe"),          # "yes" (Travancore form)
    ],
}


# ---------------------------------------------------------------------------
# DialectClassifier
# ---------------------------------------------------------------------------

class DialectClassifier:
    """Classifies text (and optionally audio features) into regional
    dialect variants of Indian languages.

    The classifier uses a two-stage approach:

    1. **Lexical marker matching** — Scans the input text for
       dialect-specific vocabulary, postpositions, verb forms, and
       expressions defined in ``DIALECT_MARKERS``.
    2. **Audio feature analysis** (optional) — When ``audio_features``
       are supplied (e.g., from prosody analysis), phonetic patterns
       such as vowel formant ratios and pitch contour characteristics
       can boost or penalise specific dialect hypotheses.

    If no dialect markers are found, the classifier returns
    ``"standard"`` for the base language with moderate confidence.
    """

    def __init__(self, settings: Settings) -> None:
        """Initialise the dialect classifier.

        Args:
            settings: Application settings instance.  Used to read
                configuration such as the SageMaker endpoint for
                ML-based classification when available.
        """
        self._settings = settings
        # Pre-compile marker patterns for efficient matching.
        # Each entry maps dialect_name -> list of compiled regex patterns.
        self._compiled_markers: dict[str, list[re.Pattern[str]]] = {}
        for dialect_name, markers in DIALECT_MARKERS.items():
            patterns: list[re.Pattern[str]] = []
            for native, romanized in markers:
                # Match the native-script marker as a whole word
                patterns.append(
                    re.compile(re.escape(native), re.IGNORECASE | re.UNICODE)
                )
                # Match the romanized form as a whole word (word boundaries)
                patterns.append(
                    re.compile(
                        r"\b" + re.escape(romanized) + r"\b",
                        re.IGNORECASE,
                    )
                )
            self._compiled_markers[dialect_name] = patterns

    def classify_dialect(
        self,
        text: str,
        base_language: str,
        audio_features: dict[str, Any] | None = None,
    ) -> DialectInfo:
        """Classify the dialect of the given text within a base language.

        Args:
            text: Input text to analyse for dialect markers.  May be in
                native script, romanized (transliterated), or a mix.
            base_language: BCP-47-style language code for the parent
                language (e.g. ``"hi-IN"``, ``"ta-IN"``).
            audio_features: Optional dictionary of audio/prosody features
                that can supplement lexical analysis.  Expected keys
                include ``pitch_mean_hz``, ``pitch_std_hz``,
                ``speaking_rate``, ``formant_ratios``, etc.

        Returns:
            A ``DialectInfo`` instance with the identified dialect,
            confidence, region, and supporting linguistic features.
        """
        if not text or not text.strip():
            return DialectInfo(
                base_language=base_language,
                dialect_name="standard",
                region="unknown",
                confidence=0.5,
                linguistic_features={"reason": "empty_input"},
            )

        # Retrieve the set of dialects applicable to this base language.
        dialect_entries = DIALECT_MAP.get(base_language, [])
        if not dialect_entries:
            logger.debug(
                "dialect_classifier.no_dialects_registered",
                base_language=base_language,
            )
            return DialectInfo(
                base_language=base_language,
                dialect_name="standard",
                region="unknown",
                confidence=0.6,
                linguistic_features={
                    "reason": "no_dialect_map_for_language",
                },
            )

        # -- Stage 1: Lexical marker scoring ---------------------------------
        dialect_scores: dict[str, dict[str, Any]] = {}

        for entry in dialect_entries:
            dialect_name = entry["name"]
            markers = self._compiled_markers.get(dialect_name, [])
            matched_markers: list[str] = []

            for pattern in markers:
                match = pattern.search(text)
                if match:
                    matched_markers.append(match.group())

            if matched_markers:
                # Unique matches only (a single word may match both native
                # and romanized patterns).
                unique_matches = list(dict.fromkeys(matched_markers))
                # Total number of marker pairs for this dialect
                total_marker_pairs = len(
                    DIALECT_MARKERS.get(dialect_name, [])
                )
                # Confidence is proportional to the fraction of markers
                # found, with diminishing returns to avoid over-confidence
                # from a handful of matches.
                raw_ratio = len(unique_matches) / max(total_marker_pairs, 1)
                lexical_confidence = min(0.95, 0.3 + 0.65 * raw_ratio)

                dialect_scores[dialect_name] = {
                    "lexical_confidence": lexical_confidence,
                    "matched_markers": unique_matches,
                    "marker_count": len(unique_matches),
                    "total_markers": total_marker_pairs,
                    "region": entry["region"],
                }

        # -- Stage 2: Audio feature adjustment (optional) --------------------
        if audio_features and dialect_scores:
            dialect_scores = self._apply_audio_features(
                dialect_scores, audio_features, base_language
            )

        # -- Decision: pick the best dialect or fall back to "standard" ------
        if not dialect_scores:
            return DialectInfo(
                base_language=base_language,
                dialect_name="standard",
                region=self._default_region(base_language),
                confidence=0.5,
                linguistic_features={
                    "reason": "no_lexical_markers_matched",
                    "dialects_checked": [e["name"] for e in dialect_entries],
                },
            )

        # Sort by lexical confidence (after audio adjustment)
        best_dialect = max(
            dialect_scores.items(),
            key=lambda item: item[1].get("lexical_confidence", 0.0),
        )
        dialect_name = best_dialect[0]
        info = best_dialect[1]

        # Build runner-up list for transparency
        runner_ups = {
            name: round(data.get("lexical_confidence", 0.0), 4)
            for name, data in dialect_scores.items()
            if name != dialect_name
        }

        return DialectInfo(
            base_language=base_language,
            dialect_name=dialect_name,
            region=info["region"],
            confidence=round(info["lexical_confidence"], 4),
            linguistic_features={
                "matched_markers": info["matched_markers"],
                "marker_count": info["marker_count"],
                "total_markers": info["total_markers"],
                "audio_features_used": audio_features is not None,
                "runner_ups": runner_ups,
            },
        )

    # ------------------------------------------------------------------
    # Audio feature adjustment
    # ------------------------------------------------------------------

    def _apply_audio_features(
        self,
        dialect_scores: dict[str, dict[str, Any]],
        audio_features: dict[str, Any],
        base_language: str,
    ) -> dict[str, dict[str, Any]]:
        """Adjust lexical confidence scores using audio/prosody features.

        This method applies heuristic adjustments based on known phonetic
        characteristics of different dialects.  For example, Bhojpuri
        speakers tend to have lower average pitch and slower speaking
        rate compared to standard Hindi speakers.

        Args:
            dialect_scores: Current dialect score map from lexical analysis.
            audio_features: Dictionary of audio features (e.g. from
                prosody analysis).
            base_language: The base language code.

        Returns:
            Updated dialect_scores dict with adjusted confidence values.
        """
        pitch_mean = audio_features.get("pitch_mean_hz", 0.0)
        speaking_rate = audio_features.get("speaking_rate", 0.0)

        # Phonetic adjustment profiles per dialect.
        # Keys: (pitch_bias, rate_bias) — positive means the dialect
        # is associated with higher-than-average values.
        _phonetic_profiles: dict[str, dict[str, float]] = {
            # Hindi family — relative to standard Hindi (~180 Hz mean pitch)
            "Bhojpuri": {"pitch_bias": -15.0, "rate_bias": -0.3},
            "Maithili": {"pitch_bias": 5.0, "rate_bias": 0.1},
            "Marwari": {"pitch_bias": -10.0, "rate_bias": -0.2},
            "Chhattisgarhi": {"pitch_bias": -5.0, "rate_bias": -0.1},
            "Rajasthani": {"pitch_bias": -8.0, "rate_bias": -0.15},
            # Telugu family
            "Telangana Telugu": {"pitch_bias": 10.0, "rate_bias": -0.2},
            # Tamil family
            "Madurai Tamil": {"pitch_bias": 5.0, "rate_bias": 0.1},
            "Kongu Tamil": {"pitch_bias": -5.0, "rate_bias": -0.1},
        }

        for dialect_name, scores in dialect_scores.items():
            profile = _phonetic_profiles.get(dialect_name)
            if not profile:
                continue

            adjustment = 0.0

            # Pitch-based adjustment
            if pitch_mean > 0:
                expected_pitch = 180.0 + profile["pitch_bias"]
                pitch_diff = abs(pitch_mean - expected_pitch)
                # Closer to expected pitch = positive adjustment (up to +0.1)
                if pitch_diff < 30:
                    adjustment += 0.05 * (1 - pitch_diff / 30)
                elif pitch_diff > 60:
                    adjustment -= 0.03

            # Speaking-rate adjustment
            if speaking_rate > 0:
                expected_rate = 4.0 + profile["rate_bias"]
                rate_diff = abs(speaking_rate - expected_rate)
                if rate_diff < 1.0:
                    adjustment += 0.03 * (1 - rate_diff)
                elif rate_diff > 2.0:
                    adjustment -= 0.02

            # Apply adjustment, clamped to [0.1, 0.98]
            current = scores.get("lexical_confidence", 0.5)
            scores["lexical_confidence"] = max(
                0.1, min(0.98, current + adjustment)
            )

        return dialect_scores

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _default_region(base_language: str) -> str:
        """Return the default/general region name for a base language."""
        _region_map: dict[str, str] = {
            "hi-IN": "Hindi-speaking belt (North India)",
            "bn-IN": "West Bengal / Bangladesh",
            "ta-IN": "Tamil Nadu",
            "te-IN": "Andhra Pradesh / Telangana",
            "mr-IN": "Maharashtra",
            "gu-IN": "Gujarat",
            "kn-IN": "Karnataka",
            "ml-IN": "Kerala",
            "pa-IN": "Punjab",
            "or-IN": "Odisha",
            "as-IN": "Assam",
            "ur-IN": "Uttar Pradesh / Telangana / Kashmir",
        }
        return _region_map.get(base_language, "India")
