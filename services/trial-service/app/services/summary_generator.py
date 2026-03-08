"""
Bedrock-powered plain-language summary generator for clinical trials.

Generates patient-friendly summaries of clinical trials using AWS Bedrock
(Claude), including Hindi translations, key bullet points, and risk/benefit
explanations.  Falls back to deterministic mock data when Bedrock is not
configured or unavailable.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


# --------------------------------------------------------------------------- #
#  Bedrock client singleton
# --------------------------------------------------------------------------- #

_bedrock_client: Any = None


def _get_bedrock_client() -> Any:
    """Return a lazily-initialised ``bedrock-runtime`` boto3 client.

    Returns ``None`` when credentials / region are not available (local dev).
    """
    global _bedrock_client
    if _bedrock_client is not None:
        return _bedrock_client

    try:
        import boto3

        _bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
        )
        logger.info(
            "bedrock_client_created",
            region=settings.bedrock_region,
            model=settings.bedrock_model_id,
        )
        return _bedrock_client
    except Exception as exc:
        logger.warning("bedrock_client_init_failed", error=str(exc))
        return None


# --------------------------------------------------------------------------- #
#  Prompt construction
# --------------------------------------------------------------------------- #

_SYSTEM_PROMPT = (
    "You are a medical information assistant for Vaidyah, an Indian healthcare "
    "platform. Your task is to make clinical trial information understandable "
    "for ordinary patients (8th grade reading level). Avoid medical jargon. "
    "When translating to Hindi, use simple everyday Hindi (Devanagari script) "
    "that a common person would understand."
)


def _build_summary_prompt(trial_data: dict) -> str:
    """Build the user prompt from trial data fields."""
    title = trial_data.get("title", "N/A")
    brief_summary = trial_data.get("brief_summary", "N/A")
    conditions = trial_data.get("conditions", [])
    interventions = trial_data.get("interventions", [])
    eligibility = trial_data.get("eligibility", {})

    conditions_str = ", ".join(conditions) if conditions else "Not specified"

    # Interventions may be dicts or strings
    if interventions and isinstance(interventions[0], dict):
        interventions_str = ", ".join(
            i.get("name", "") or i.get("intervention_type", "")
            for i in interventions
        )
    elif interventions:
        interventions_str = ", ".join(str(i) for i in interventions)
    else:
        interventions_str = "Not specified"

    eligibility_str = ""
    if isinstance(eligibility, dict):
        parts = []
        if eligibility.get("criteria_text"):
            parts.append(eligibility["criteria_text"][:1000])
        if eligibility.get("age_min") is not None:
            parts.append(f"Minimum age: {eligibility['age_min']} years")
        elif eligibility.get("minimum_age_years") is not None:
            parts.append(f"Minimum age: {eligibility['minimum_age_years']} years")
        if eligibility.get("age_max") is not None:
            parts.append(f"Maximum age: {eligibility['age_max']} years")
        elif eligibility.get("maximum_age_years") is not None:
            parts.append(f"Maximum age: {eligibility['maximum_age_years']} years")
        if eligibility.get("gender"):
            parts.append(f"Gender: {eligibility['gender']}")
        eligibility_str = "; ".join(parts) if parts else "Not specified"
    elif isinstance(eligibility, str):
        eligibility_str = eligibility[:1000]
    else:
        eligibility_str = "Not specified"

    return (
        "Please generate a plain-language summary for the following clinical trial.\n\n"
        f"Trial Title: {title}\n\n"
        f"Brief Summary: {brief_summary}\n\n"
        f"Conditions: {conditions_str}\n\n"
        f"Interventions: {interventions_str}\n\n"
        f"Eligibility: {eligibility_str}\n\n"
        "Respond with ONLY a valid JSON object (no markdown, no code fences) with these keys:\n"
        '- "plain_summary": A jargon-free explanation of this trial in 3-5 sentences, '
        "written at an 8th grade reading level. Explain what the study is about, who it "
        "is for, and what participants would do.\n"
        '- "plain_summary_hi": Hindi translation of the plain_summary in Devanagari script, '
        "using simple everyday Hindi.\n"
        '- "key_points": A JSON array of 3-5 short bullet points (strings) highlighting '
        "the most important things a patient should know.\n"
        '- "risk_benefit": A 2-3 sentence explanation of the potential risks and benefits '
        "of participating, written simply."
    )


# --------------------------------------------------------------------------- #
#  Bedrock invocation
# --------------------------------------------------------------------------- #


async def _invoke_bedrock(prompt: str) -> Optional[dict]:
    """Call Bedrock Claude and parse the JSON response.

    Returns ``None`` on any failure so the caller can fall back to mock data.
    """
    client = _get_bedrock_client()
    if client is None:
        logger.debug("bedrock_not_available_using_fallback")
        return None

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": settings.bedrock_max_tokens,
        "temperature": settings.bedrock_temperature,
        "system": _SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": prompt},
        ],
    })

    try:
        response = await asyncio.to_thread(
            client.invoke_model,
            modelId=settings.bedrock_model_id,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        response_body = json.loads(response["body"].read())
        content_text = response_body.get("content", [{}])[0].get("text", "")

        # Strip potential markdown code fences
        cleaned = content_text.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        parsed = json.loads(cleaned)

        # Validate expected keys
        required_keys = {"plain_summary", "plain_summary_hi", "key_points", "risk_benefit"}
        if not required_keys.issubset(parsed.keys()):
            missing = required_keys - set(parsed.keys())
            logger.warning("bedrock_response_missing_keys", missing=list(missing))
            return None

        logger.info(
            "bedrock_summary_generated",
            summary_len=len(parsed.get("plain_summary", "")),
            key_points_count=len(parsed.get("key_points", [])),
        )
        return parsed

    except json.JSONDecodeError as exc:
        logger.warning("bedrock_response_parse_failed", error=str(exc))
        return None
    except Exception as exc:
        logger.warning("bedrock_invocation_failed", error=str(exc), exc_info=True)
        return None


# --------------------------------------------------------------------------- #
#  Dev / fallback mock data
# --------------------------------------------------------------------------- #


def _generate_mock_summary(trial_data: dict) -> dict:
    """Return a deterministic mock summary when Bedrock is unavailable.

    Uses trial fields to produce a plausible (but clearly synthetic) summary
    so that front-end development can proceed without AWS credentials.
    """
    title = trial_data.get("title", "this clinical trial")
    conditions = trial_data.get("conditions", [])
    conditions_str = ", ".join(conditions) if conditions else "certain health conditions"

    plain_summary = (
        f'This study, titled "{title}", is looking at new ways to help people '
        f"with {conditions_str}. Researchers want to find out if a treatment "
        f"can improve health outcomes for patients. If you join, you may receive "
        f"the treatment being tested or a standard treatment, and doctors will "
        f"monitor your health throughout the study."
    )

    plain_summary_hi = (
        f'\u092f\u0939 \u0905\u0927\u094d\u092f\u092f\u0928, \u091c\u093f\u0938\u0915\u093e \u0936\u0940\u0930\u094d\u0937\u0915 "{title}" \u0939\u0948, {conditions_str} \u0938\u0947 \u092a\u0940\u0921\u093c\u093f\u0924 '
        "\u0932\u094b\u0917\u094b\u0902 \u0915\u0940 \u092e\u0926\u0926 \u0915\u0947 \u0928\u090f \u0924\u0930\u0940\u0915\u094b\u0902 \u092a\u0930 \u0936\u094b\u0927 \u0915\u0930 \u0930\u0939\u093e \u0939\u0948\u0964 "
        "\u0936\u094b\u0927\u0915\u0930\u094d\u0924\u093e \u092f\u0939 \u091c\u093e\u0928\u0928\u093e \u091a\u093e\u0939\u0924\u0947 "
        "\u0939\u0948\u0902 \u0915\u093f \u0915\u094d\u092f\u093e \u0915\u094b\u0908 \u0909\u092a\u091a\u093e\u0930 \u092e\u0930\u0940\u091c\u094b\u0902 \u0915\u0947 \u0938\u094d\u0935\u093e\u0938\u094d\u0925\u094d\u092f "
        "\u092a\u0930\u093f\u0923\u093e\u092e\u094b\u0902 \u092e\u0947\u0902 \u0938\u0941\u0927\u093e\u0930 \u0915\u0930 \u0938\u0915\u0924\u093e "
        "\u0939\u0948\u0964 \u092f\u0926\u093f \u0906\u092a \u0907\u0938\u092e\u0947\u0902 \u0936\u093e\u092e\u093f\u0932 \u0939\u094b\u0924\u0947 \u0939\u0948\u0902, \u0924\u094b \u0906\u092a\u0915\u094b "
        "\u092a\u0930\u0940\u0915\u094d\u0937\u0923 \u0915\u093f\u092f\u093e \u091c\u093e \u0930\u0939\u093e \u0909\u092a\u091a\u093e\u0930 \u092f\u093e "
        "\u092e\u093e\u0928\u0915 \u0909\u092a\u091a\u093e\u0930 \u092e\u093f\u0932 \u0938\u0915\u0924\u093e \u0939\u0948, \u0914\u0930 \u0921\u0949\u0915\u094d\u091f\u0930 "
        "\u092a\u0942\u0930\u0947 \u0905\u0927\u094d\u092f\u092f\u0928 \u0915\u0947 \u0926\u094c\u0930\u093e\u0928 \u0906\u092a\u0915\u0947 \u0938\u094d\u0935\u093e\u0938\u094d\u0925\u094d\u092f "
        "\u0915\u0940 \u0928\u093f\u0917\u0930\u093e\u0928\u0940 \u0915\u0930\u0947\u0902\u0917\u0947\u0964"
    )

    key_points = [
        f"This study focuses on {conditions_str}.",
        "Participation is voluntary and you can leave at any time.",
        "You will be monitored by medical professionals throughout the study.",
        "The study aims to find better treatments for patients.",
    ]

    risk_benefit = (
        "Possible benefits include access to new treatments and close medical "
        "monitoring. Risks may include side effects from the treatment being "
        "tested. Your doctor will explain all risks and benefits before you "
        "decide to participate."
    )

    return {
        "plain_summary": plain_summary,
        "plain_summary_hi": plain_summary_hi,
        "key_points": key_points,
        "risk_benefit": risk_benefit,
    }


# --------------------------------------------------------------------------- #
#  Public API
# --------------------------------------------------------------------------- #


async def generate_plain_summary(trial_data: dict) -> dict:
    """Generate a plain-language summary for a clinical trial.

    Attempts to use AWS Bedrock Claude for generation.  Falls back to
    deterministic mock data when Bedrock is not configured or returns an error.

    Parameters
    ----------
    trial_data : dict
        Trial information with keys: ``title``, ``brief_summary``,
        ``conditions`` (list[str]), ``interventions`` (list), and
        ``eligibility`` (dict or str).

    Returns
    -------
    dict
        A dictionary with keys:
        - ``plain_summary`` : str -- jargon-free English explanation
        - ``plain_summary_hi`` : str -- Hindi translation
        - ``key_points`` : list[str] -- 3-5 bullet points
        - ``risk_benefit`` : str -- simple risk/benefit explanation
        - ``source`` : str -- ``"bedrock"`` or ``"fallback"``
    """
    nct_id = trial_data.get("nct_id", "unknown")

    logger.info("generate_plain_summary.start", nct_id=nct_id)

    prompt = _build_summary_prompt(trial_data)
    result = await _invoke_bedrock(prompt)

    if result is not None:
        result["source"] = "bedrock"
        logger.info("generate_plain_summary.completed", nct_id=nct_id, source="bedrock")
        return result

    # Fallback to mock
    result = _generate_mock_summary(trial_data)
    result["source"] = "fallback"
    logger.info("generate_plain_summary.completed", nct_id=nct_id, source="fallback")
    return result


async def generate_plain_summaries_batch(
    trials: list[dict],
    concurrency: int = 5,
) -> list[dict]:
    """Generate plain-language summaries for multiple trials concurrently.

    Parameters
    ----------
    trials : list[dict]
        List of trial data dicts (same shape as ``generate_plain_summary`` input).
    concurrency : int
        Maximum number of concurrent Bedrock calls.

    Returns
    -------
    list[dict]
        One summary dict per input trial, in the same order.
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def _generate_one(trial_data: dict) -> dict:
        async with semaphore:
            return await generate_plain_summary(trial_data)

    tasks = [_generate_one(t) for t in trials]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output: list[dict] = []
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            nct_id = trials[i].get("nct_id", "unknown")
            logger.warning(
                "batch_summary_failed",
                nct_id=nct_id,
                error=str(res),
            )
            # Return fallback for failed items
            fallback = _generate_mock_summary(trials[i])
            fallback["source"] = "fallback"
            fallback["error"] = str(res)
            output.append(fallback)
        else:
            output.append(res)

    return output
