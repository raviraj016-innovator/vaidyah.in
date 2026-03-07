"""AWS Bedrock client for invoking Claude models with structured prompts.

Supports synchronous and streaming invocations, token counting,
and retry with exponential backoff.
"""

from __future__ import annotations

import json
import time
from typing import Any, Iterator, Optional

import boto3
import structlog
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings

logger = structlog.get_logger(__name__)


class BedrockClientError(Exception):
    """Raised when Bedrock invocation fails after retries."""


class BedrockClient:
    """Wrapper around the AWS Bedrock Runtime client for Claude invocations."""

    def __init__(self) -> None:
        settings = get_settings()
        boto_config = BotoConfig(
            region_name=settings.aws_region,
            retries={"max_attempts": 0, "mode": "standard"},
            read_timeout=120,
            connect_timeout=10,
        )

        session_kwargs: dict[str, Any] = {}
        if settings.aws_access_key_id:
            session_kwargs["aws_access_key_id"] = settings.aws_access_key_id
        if settings.aws_secret_access_key:
            session_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        session = boto3.Session(**session_kwargs)
        self._client = session.client(
            "bedrock-runtime",
            config=boto_config,
        )
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens
        self._temperature = settings.bedrock_temperature
        self._top_p = settings.bedrock_top_p
        self._retry_max_attempts = settings.bedrock_retry_max_attempts
        self._retry_base_delay = settings.bedrock_retry_base_delay

        logger.info(
            "bedrock_client_initialized",
            model_id=self._model_id,
            region=settings.aws_region,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((ClientError, ConnectionError)),
    )
    def invoke(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        stop_sequences: list[str] | None = None,
    ) -> dict[str, Any]:
        """Invoke Claude via Bedrock and return the parsed response.

        Parameters
        ----------
        system_prompt : str
            The system-level instruction for Claude.
        user_message : str
            The user message / prompt.
        max_tokens : int, optional
            Override default max tokens.
        temperature : float, optional
            Override default temperature.
        top_p : float, optional
            Override default top_p.
        stop_sequences : list[str], optional
            Sequences that cause the model to stop generating.

        Returns
        -------
        dict
            Parsed response containing ``content``, ``usage``, ``stop_reason``.
        """
        start_time = time.monotonic()

        body = self._build_request_body(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens or self._max_tokens,
            temperature=temperature if temperature is not None else self._temperature,
            top_p=top_p if top_p is not None else self._top_p,
            stop_sequences=stop_sequences,
        )

        try:
            response = self._client.invoke_model(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )

            body_stream = response.get("body")
            if body_stream is None:
                raise BedrockClientError("Bedrock response missing 'body' field")
            try:
                response_body = json.loads(body_stream.read())
            finally:
                body_stream.close()
            elapsed_ms = (time.monotonic() - start_time) * 1000

            content_text = self._extract_text(response_body)
            usage = response_body.get("usage", {})

            logger.info(
                "bedrock_invoke_success",
                model=self._model_id,
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                elapsed_ms=round(elapsed_ms, 1),
            )

            return {
                "content": content_text,
                "usage": usage,
                "stop_reason": response_body.get("stop_reason", ""),
                "elapsed_ms": round(elapsed_ms, 1),
            }

        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "Unknown")
            logger.error(
                "bedrock_invoke_error",
                error_code=error_code,
                error_message=str(exc),
            )
            if error_code == "ThrottlingException":
                raise  # tenacity will retry
            if error_code == "ModelTimeoutException":
                raise  # tenacity will retry
            raise BedrockClientError(
                f"Bedrock invocation failed: {error_code}"
            ) from exc

    def invoke_and_parse_json(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> Any:
        """Invoke Claude and parse the response as JSON.

        Falls back to extracting JSON from markdown code fences if needed.
        """
        result = self.invoke(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        raw = result["content"]
        parsed = self._parse_json_response(raw)
        return {
            "data": parsed,
            "usage": result["usage"],
            "elapsed_ms": result["elapsed_ms"],
        }

    def invoke_stream(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> Iterator[str]:
        """Invoke Claude with streaming and yield text chunks.

        Returns an iterator over text delta strings.
        """
        body = self._build_request_body(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens or self._max_tokens,
            temperature=temperature if temperature is not None else self._temperature,
            top_p=self._top_p,
        )

        stream = None
        try:
            response = self._client.invoke_model_with_response_stream(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            stream = response.get("body")
            if stream:
                for event in stream:
                    chunk = event.get("chunk")
                    if chunk:
                        try:
                            chunk_data = json.loads(chunk.get("bytes", b"{}"))
                        except json.JSONDecodeError:
                            logger.warning("bedrock_stream_invalid_json_chunk")
                            continue
                        if chunk_data.get("type") == "content_block_delta":
                            delta = chunk_data.get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                yield text

        except ClientError as exc:
            logger.error("bedrock_stream_error", error=str(exc))
            raise BedrockClientError(
                f"Bedrock streaming failed: {exc}"
            ) from exc
        finally:
            if stream and hasattr(stream, "close"):
                try:
                    stream.close()
                except Exception:
                    pass

    def count_tokens(self, text: str) -> int:
        """Estimate token count for a string.

        Uses a rough heuristic of ~4 characters per token for English text
        and ~2 characters per token for Devanagari / other Indic scripts.
        This is an approximation; for exact counts, use the Bedrock
        count-tokens API when available.
        """
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        non_ascii_chars = len(text) - ascii_chars
        return int(ascii_chars / 4 + non_ascii_chars / 2)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_request_body(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
        temperature: float,
        top_p: float = 0.95,
        stop_sequences: list[str] | None = None,
    ) -> dict[str, Any]:
        """Build the Bedrock Claude Messages API request body."""
        body: dict[str, Any] = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_message,
                }
            ],
        }
        if stop_sequences:
            body["stop_sequences"] = stop_sequences
        return body

    @staticmethod
    def _extract_text(response_body: dict[str, Any]) -> str:
        """Extract text content from Claude's response body."""
        content = response_body.get("content", [])
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(parts)

    @staticmethod
    def _parse_json_response(raw: str) -> Any:
        """Parse JSON from Claude's response, handling code fences."""
        text = raw.strip()

        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code fence
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end == -1:
                # Unterminated fence -- take everything after the opening
                return json.loads(text[start:].strip())
            return json.loads(text[start:end].strip())

        if "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            if end == -1:
                # Unterminated fence -- take everything after the opening
                return json.loads(text[start:].strip())
            return json.loads(text[start:end].strip())

        # Try finding first { or [
        for i, ch in enumerate(text):
            if ch in "{[":
                # Find matching end
                depth = 0
                target_end = "]" if ch == "[" else "}"
                for j in range(i, len(text)):
                    if text[j] == ch:
                        depth += 1
                    elif text[j] == target_end:
                        depth -= 1
                        if depth == 0:
                            return json.loads(text[i : j + 1])
                break

        raise ValueError(f"Could not parse JSON from Claude response: {text[:200]}")


# Module-level singleton (lazily initialized)
_bedrock_client: Optional[BedrockClient] = None


def get_bedrock_client() -> BedrockClient:
    """Get or create the singleton BedrockClient instance."""
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = BedrockClient()
    return _bedrock_client
