"""
Audio processing utilities for the Voice Processing service.

Provides helpers for format conversion, duration calculation, sample rate
conversion, and audio chunking using librosa, soundfile, and numpy.
"""

from __future__ import annotations

import io
import struct
import wave
from typing import Optional

import numpy as np
import soundfile as sf
import structlog

logger = structlog.get_logger("voice.utils.audio")

# Supported source formats that can be read by soundfile / librosa
_SOUNDFILE_FORMATS = {"wav", "flac", "ogg"}
_FFMPEG_FORMATS = {"mp3", "webm", "m4a"}


class AudioUtils:
    """Static utility class for audio processing operations."""

    @staticmethod
    def normalize_audio(
        audio_bytes: bytes,
        source_format: str = "wav",
        target_sample_rate: int = 16000,
        target_channels: int = 1,
    ) -> tuple[bytes, int, float, int]:
        """Normalize audio to PCM WAV at the target sample rate.

        Parameters
        ----------
        audio_bytes : bytes
            Raw audio file content.
        source_format : str
            File extension / format of the source audio (e.g. "wav", "mp3").
        target_sample_rate : int
            Desired sample rate in Hz (default 16 000).
        target_channels : int
            Desired number of channels (default 1 = mono).

        Returns
        -------
        tuple[bytes, int, float, int]
            ``(pcm_wav_bytes, sample_rate, duration_seconds, channels)``
        """
        source_format = source_format.lower().strip(".")

        try:
            audio_array, original_sr = AudioUtils._read_audio(
                audio_bytes, source_format
            )
        except Exception as exc:
            logger.error(
                "audio.read_failed",
                format=source_format,
                size=len(audio_bytes),
                error=str(exc),
            )
            raise ValueError(
                f"Failed to read audio in '{source_format}' format: {exc}"
            ) from exc

        # Convert to mono if needed
        if audio_array.ndim > 1:
            audio_array = np.mean(audio_array, axis=1)

        channels = target_channels

        # Resample if needed
        if original_sr != target_sample_rate:
            audio_array = AudioUtils._resample(
                audio_array, original_sr, target_sample_rate
            )
            sample_rate = target_sample_rate
        else:
            sample_rate = original_sr

        duration = len(audio_array) / sample_rate

        # Convert to 16-bit PCM WAV bytes
        pcm_bytes = AudioUtils._to_pcm_wav(audio_array, sample_rate, channels)

        logger.debug(
            "audio.normalized",
            original_sr=original_sr,
            target_sr=sample_rate,
            duration=round(duration, 3),
            channels=channels,
            output_size=len(pcm_bytes),
        )

        return pcm_bytes, sample_rate, duration, channels

    @staticmethod
    def get_duration(audio_bytes: bytes, source_format: str = "wav") -> float:
        """Return the duration in seconds of an audio buffer.

        Parameters
        ----------
        audio_bytes : bytes
            Raw audio content.
        source_format : str
            Format of the audio file.

        Returns
        -------
        float
            Duration in seconds.
        """
        audio_array, sr = AudioUtils._read_audio(audio_bytes, source_format)
        if audio_array.ndim > 1:
            audio_array = audio_array[:, 0]
        return len(audio_array) / sr

    @staticmethod
    def get_sample_rate(audio_bytes: bytes, source_format: str = "wav") -> int:
        """Return the sample rate of an audio buffer.

        Parameters
        ----------
        audio_bytes : bytes
            Raw audio content.
        source_format : str
            Format of the audio file.

        Returns
        -------
        int
            Sample rate in Hz.
        """
        _, sr = AudioUtils._read_audio(audio_bytes, source_format)
        return sr

    @staticmethod
    def chunk_audio(
        audio_bytes: bytes,
        chunk_duration_seconds: float = 5.0,
        sample_rate: int = 16000,
    ) -> list[bytes]:
        """Split PCM audio bytes into fixed-duration chunks.

        Expects 16-bit mono PCM audio (as produced by ``normalize_audio``).

        Parameters
        ----------
        audio_bytes : bytes
            16-bit PCM audio bytes.
        chunk_duration_seconds : float
            Duration of each chunk in seconds.
        sample_rate : int
            Sample rate of the input audio.

        Returns
        -------
        list[bytes]
            List of audio byte chunks.
        """
        bytes_per_sample = 2  # 16-bit
        chunk_size = int(chunk_duration_seconds * sample_rate * bytes_per_sample)

        if chunk_size <= 0:
            return [audio_bytes]

        chunks: list[bytes] = []
        for offset in range(0, len(audio_bytes), chunk_size):
            chunk = audio_bytes[offset : offset + chunk_size]
            if len(chunk) > 0:
                chunks.append(chunk)

        logger.debug(
            "audio.chunked",
            total_bytes=len(audio_bytes),
            chunk_count=len(chunks),
            chunk_duration=chunk_duration_seconds,
        )

        return chunks

    @staticmethod
    def convert_format(
        audio_bytes: bytes,
        source_format: str,
        target_format: str,
        target_sample_rate: Optional[int] = None,
    ) -> bytes:
        """Convert audio from one format to another.

        Parameters
        ----------
        audio_bytes : bytes
            Source audio content.
        source_format : str
            Source format extension (e.g. "mp3").
        target_format : str
            Target format extension (e.g. "wav", "flac", "ogg").
        target_sample_rate : int, optional
            Resample to this rate if provided.

        Returns
        -------
        bytes
            Audio content in the target format.
        """
        audio_array, sr = AudioUtils._read_audio(audio_bytes, source_format)

        if audio_array.ndim > 1:
            audio_array = np.mean(audio_array, axis=1)

        if target_sample_rate and sr != target_sample_rate:
            audio_array = AudioUtils._resample(audio_array, sr, target_sample_rate)
            sr = target_sample_rate

        buf = io.BytesIO()
        sf.write(buf, audio_array, sr, format=target_format.upper())
        buf.seek(0)
        return buf.read()

    @staticmethod
    def compute_rms_energy(audio_bytes: bytes, sample_rate: int = 16000) -> float:
        """Compute the RMS energy of 16-bit PCM audio in dB.

        Parameters
        ----------
        audio_bytes : bytes
            16-bit PCM audio bytes.
        sample_rate : int
            Sample rate (unused but kept for API consistency).

        Returns
        -------
        float
            RMS energy in decibels.
        """
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_array = audio_array / 32768.0

        if len(audio_array) == 0:
            return -float("inf")

        rms = float(np.sqrt(np.mean(audio_array ** 2)))
        if rms < 1e-10:
            return -100.0
        return float(20.0 * np.log10(rms))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _read_audio(
        audio_bytes: bytes, source_format: str
    ) -> tuple[np.ndarray, int]:
        """Read audio bytes into a numpy array and sample rate.

        Uses soundfile for WAV/FLAC/OGG. Falls back to librosa for formats
        that require ffmpeg (MP3, WEBM, M4A).
        """
        source_format = source_format.lower().strip(".")
        buf = io.BytesIO(audio_bytes)

        if source_format in _SOUNDFILE_FORMATS:
            data, sr = sf.read(buf, dtype="float32")
            return data, sr

        # For MP3, WEBM, M4A -- use librosa which delegates to ffmpeg
        try:
            import librosa

            buf.seek(0)
            data, sr = librosa.load(buf, sr=None, mono=False)
            # librosa returns (samples,) for mono or (channels, samples) for stereo
            if data.ndim > 1:
                data = data.T  # transpose to (samples, channels) to match soundfile
            return data, sr
        except Exception as exc:
            raise ValueError(
                f"Cannot decode audio format '{source_format}'. "
                f"Ensure ffmpeg is installed for non-WAV formats. Error: {exc}"
            ) from exc

    @staticmethod
    def _resample(
        audio_array: np.ndarray, original_sr: int, target_sr: int
    ) -> np.ndarray:
        """Resample a 1-D audio array to the target sample rate."""
        try:
            import librosa

            return librosa.resample(
                audio_array, orig_sr=original_sr, target_sr=target_sr
            )
        except ImportError:
            # Fallback: simple linear interpolation (lower quality)
            ratio = target_sr / original_sr
            target_length = int(len(audio_array) * ratio)
            indices = np.linspace(0, len(audio_array) - 1, target_length)
            return np.interp(indices, np.arange(len(audio_array)), audio_array).astype(
                np.float32
            )

    @staticmethod
    def _to_pcm_wav(
        audio_array: np.ndarray, sample_rate: int, channels: int = 1
    ) -> bytes:
        """Convert a float32 numpy array to 16-bit PCM WAV bytes."""
        # Clip and scale to int16 range
        audio_clipped = np.clip(audio_array, -1.0, 1.0)
        pcm_data = (audio_clipped * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_data.tobytes())

        buf.seek(0)
        return buf.read()
