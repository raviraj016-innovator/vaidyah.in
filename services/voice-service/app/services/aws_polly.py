"""
Amazon Polly integration for text-to-speech synthesis.

Provides neural voice synthesis for 6 Indian languages with
in-memory LRU caching and SSML generation utilities.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
from typing import Any, AsyncIterator, Optional

import boto3
import structlog
from cachetools import LRUCache

from app.config import Settings
from app.models import SupportedLanguage

logger = structlog.get_logger("voice.services.polly")

# ---------------------------------------------------------------------------
# Voice mapping: language -> (VoiceId, Engine)
# Amazon Polly neural voices for Indian languages
# ---------------------------------------------------------------------------
VOICE_MAP: dict[str, dict[str, str]] = {
    "en-IN": {"voice_id": "Kajal", "engine": "neural", "gender": "Female"},
    "hi-IN": {"voice_id": "Kajal", "engine": "neural", "gender": "Female"},
    "bn-IN": {"voice_id": "Aditi", "engine": "standard", "gender": "Female"},
    "ta-IN": {"voice_id": "Aditi", "engine": "standard", "gender": "Female"},
    "te-IN": {"voice_id": "Aditi", "engine": "standard", "gender": "Female"},
    "mr-IN": {"voice_id": "Aditi", "engine": "standard", "gender": "Female"},
}

# Content type mapping
CONTENT_TYPE_MAP: dict[str, str] = {
    "mp3": "audio/mpeg",
    "ogg_vorbis": "audio/ogg",
    "pcm": "audio/pcm",
    "json": "application/x-json-stream",
}


class AWSPollyService:
    """Amazon Polly TTS service with caching and SSML support."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Optional[Any] = None
        self._cache: LRUCache = LRUCache(maxsize=settings.polly_cache_max_size)

    def _get_client(self) -> Any:
        if self._client is None:
            kwargs: dict[str, Any] = {"region_name": self._settings.aws_region}
            if self._settings.aws_access_key_id:
                kwargs["aws_access_key_id"] = self._settings.aws_access_key_id
                kwargs["aws_secret_access_key"] = self._settings.aws_secret_access_key
            if self._settings.aws_session_token:
                kwargs["aws_session_token"] = self._settings.aws_session_token
            self._client = boto3.client("polly", **kwargs)
        return self._client

    # ------------------------------------------------------------------
    # Voice lookup
    # ------------------------------------------------------------------

    def get_voice_for_language(self, language: SupportedLanguage) -> Optional[str]:
        """Return the Polly VoiceId for the given language."""
        entry = VOICE_MAP.get(language.value)
        return entry["voice_id"] if entry else None

    def _get_engine_for_language(self, language: SupportedLanguage) -> str:
        """Return the Polly engine (neural/standard) for the given language."""
        entry = VOICE_MAP.get(language.value)
        return entry["engine"] if entry else "standard"

    # ------------------------------------------------------------------
    # SSML helpers
    # ------------------------------------------------------------------

    @staticmethod
    def wrap_ssml(
        text: str,
        speed: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
    ) -> str:
        """
        Wrap plain text in SSML with prosody adjustments.

        speed: 0.5 - 2.0 (maps to Polly rate %)
        pitch: 0.5 - 2.0 (maps to Polly pitch %)
        volume: 0.1 - 3.0 (maps to Polly volume dB)
        """
        rate_pct = f"{int(speed * 100)}%"
        # Pitch: 1.0 = +0%, 1.5 = +50%, 0.5 = -50%
        pitch_pct = f"{int((pitch - 1.0) * 100):+d}%"
        # Volume: 1.0 = +0dB, 2.0 = +6dB, 0.5 = -6dB
        import math

        volume_db = f"{int(math.log2(max(volume, 0.1)) * 6):+d}dB"

        ssml = (
            f'<speak>'
            f'<prosody rate="{rate_pct}" pitch="{pitch_pct}" volume="{volume_db}">'
            f'{_escape_ssml(text)}'
            f'</prosody>'
            f'</speak>'
        )
        return ssml

    @staticmethod
    def build_emphasis_ssml(text: str, words: dict[str, str]) -> str:
        """
        Build SSML with emphasis on specific words.

        words: mapping of word -> emphasis level ("strong", "moderate", "reduced")
        """
        result = text
        for word, level in words.items():
            result = result.replace(
                word, f'<emphasis level="{level}">{word}</emphasis>'
            )
        return f"<speak>{result}</speak>"

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------

    def _cache_key(self, text: str, voice_id: str, output_format: str) -> str:
        content = f"{text}|{voice_id}|{output_format}"
        return hashlib.sha256(content.encode()).hexdigest()

    async def get_cached(
        self, text: str, voice_id: str, output_format: str
    ) -> Optional[dict[str, Any]]:
        """Return cached synthesis result if available."""
        if not self._settings.polly_cache_enabled:
            return None
        key = self._cache_key(text, voice_id, output_format)
        return self._cache.get(key)

    async def cache_result(
        self,
        text: str,
        voice_id: str,
        output_format: str,
        result: dict[str, Any],
    ) -> None:
        """Store a synthesis result in the LRU cache."""
        if not self._settings.polly_cache_enabled:
            return
        key = self._cache_key(text, voice_id, output_format)
        self._cache[key] = result

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    async def synthesize(
        self,
        text: str,
        text_type: str,
        voice_id: str,
        output_format: str,
        sample_rate: str,
        language_code: str,
    ) -> dict[str, Any]:
        """
        Synthesize speech via Amazon Polly and return base64-encoded audio.
        """
        client = self._get_client()
        loop = asyncio.get_running_loop()

        lang_enum = SupportedLanguage(language_code)
        engine = self._get_engine_for_language(lang_enum)

        params: dict[str, Any] = {
            "Text": text,
            "TextType": text_type,
            "VoiceId": voice_id,
            "OutputFormat": output_format,
            "SampleRate": sample_rate,
            "Engine": engine,
        }

        # Add LanguageCode for voices that support multiple languages
        if voice_id == "Kajal":
            params["LanguageCode"] = language_code

        logger.info(
            "polly.synthesize_request",
            voice=voice_id,
            engine=engine,
            format=output_format,
            text_len=len(text),
        )

        try:
            response = await loop.run_in_executor(
                None, lambda: client.synthesize_speech(**params)
            )
        except client.exceptions.TextLengthExceededException:
            raise ValueError("Text exceeds Polly maximum length of 3000 characters")
        except Exception as exc:
            logger.error("polly.synthesize_failed", error=str(exc), exc_info=True)
            raise

        audio_stream = response["AudioStream"]
        audio_bytes = await loop.run_in_executor(None, audio_stream.read)

        content_type = CONTENT_TYPE_MAP.get(output_format, "audio/mpeg")
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        # Estimate duration from audio size
        duration_seconds: Optional[float] = None
        if output_format == "mp3":
            # Rough estimate: MP3 at 48kbps -> ~6000 bytes/sec
            duration_seconds = round(len(audio_bytes) / 6000, 2)
        elif output_format == "pcm":
            # PCM 16-bit mono at given sample rate
            sr = int(sample_rate)
            duration_seconds = round(len(audio_bytes) / (sr * 2), 2)

        return {
            "audio_base64": audio_b64,
            "audio_bytes": audio_bytes,
            "content_type": content_type,
            "duration_seconds": duration_seconds,
        }

    async def synthesize_stream(
        self,
        text: str,
        text_type: str,
        voice_id: str,
        output_format: str,
        sample_rate: str,
        language_code: str,
    ) -> AsyncIterator[bytes]:
        """
        Synthesize speech and yield audio chunks for streaming responses.
        """
        client = self._get_client()
        loop = asyncio.get_running_loop()

        lang_enum = SupportedLanguage(language_code)
        engine = self._get_engine_for_language(lang_enum)

        params: dict[str, Any] = {
            "Text": text,
            "TextType": text_type,
            "VoiceId": voice_id,
            "OutputFormat": output_format,
            "SampleRate": sample_rate,
            "Engine": engine,
        }

        if voice_id == "Kajal":
            params["LanguageCode"] = language_code

        response = await loop.run_in_executor(
            None, lambda: client.synthesize_speech(**params)
        )

        audio_stream = response["AudioStream"]
        chunk_size = 4096

        while True:
            chunk = await loop.run_in_executor(
                None, lambda: audio_stream.read(chunk_size)
            )
            if not chunk:
                break
            yield chunk


def _escape_ssml(text: str) -> str:
    """Escape special XML characters for SSML."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
