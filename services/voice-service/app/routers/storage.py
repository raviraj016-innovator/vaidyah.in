"""
Voice recording storage router.

POST   /recordings/upload              - Upload consultation audio recording to S3
GET    /recordings/{consultation_id}   - Get presigned download URL for a recording
GET    /recordings/{consultation_id}/list - List all recordings for a session
DELETE /recordings/{consultation_id}/{filename} - Delete a recording
"""

from __future__ import annotations

import time
import uuid
from typing import Optional

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from app.config import Settings, get_settings
from app.models import ErrorResponse

logger = structlog.get_logger("voice.storage")
router = APIRouter()


# ---------------------------------------------------------------------------
# S3 Client Accessor
# ---------------------------------------------------------------------------

def _get_s3_client(settings: Settings = Depends(get_settings)):
    """Get the shared boto3 S3 client from application state."""
    from app.main import get_shared_state
    state = get_shared_state()
    client = state.get("s3_client")
    if not client:
        # Dev fallback: create a local client
        try:
            import boto3
            client = boto3.client(
                "s3",
                region_name=settings.aws_region,
                endpoint_url=settings.s3_endpoint_url if hasattr(settings, "s3_endpoint_url") else None,
            )
        except Exception:
            return None
    return client


# ---------------------------------------------------------------------------
# POST /recordings/upload
# ---------------------------------------------------------------------------

@router.post(
    "/recordings/upload",
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
    summary="Upload a voice recording to S3",
)
async def upload_recording(
    file: UploadFile = File(..., description="Audio recording file"),
    consultation_id: str = Form(..., description="Consultation/session ID"),
    speaker: Optional[str] = Form(default="mixed", description="Speaker label"),
    settings: Settings = Depends(get_settings),
    s3_client=Depends(_get_s3_client),
):
    request_id = str(uuid.uuid4())
    log = logger.bind(request_id=request_id, consultation_id=consultation_id)

    # Read file with size limit
    chunks = []
    total = 0
    max_size = settings.max_audio_file_size_bytes
    while chunk := await file.read(8192):
        total += len(chunk)
        if total > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum size of {settings.max_audio_file_size_mb} MB",
            )
        chunks.append(chunk)

    contents = b"".join(chunks)
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    # Determine S3 key
    file_ext = (file.filename or "recording.wav").rsplit(".", 1)[-1].lower()
    timestamp = int(time.time())
    s3_key = f"consultations/{consultation_id}/{speaker}_{timestamp}.{file_ext}"
    bucket = settings.s3_audio_bucket

    log.info("storage.upload_started", size=len(contents), key=s3_key)

    if not s3_client:
        # Dev fallback: return mock response
        log.warning("storage.s3_not_available", mode="dev_fallback")
        return {
            "success": True,
            "data": {
                "bucket": bucket,
                "key": s3_key,
                "size_bytes": len(contents),
                "content_type": file.content_type or "audio/wav",
                "etag": f'"dev-{request_id[:8]}"',
                "location": f"s3://{bucket}/{s3_key}",
                "mode": "dev_fallback",
            },
        }

    try:
        result = s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=contents,
            ContentType=file.content_type or "audio/wav",
            ServerSideEncryption="aws:kms",
            SSEKMSKeyId=settings.s3_kms_key_id or "",
            Metadata={
                "consultation-id": consultation_id,
                "speaker": speaker or "mixed",
                "original-filename": file.filename or "unknown",
            },
        )
        log.info("storage.upload_completed", etag=result.get("ETag"))

        return {
            "success": True,
            "data": {
                "bucket": bucket,
                "key": s3_key,
                "size_bytes": len(contents),
                "content_type": file.content_type or "audio/wav",
                "etag": result.get("ETag"),
                "version_id": result.get("VersionId"),
                "location": f"s3://{bucket}/{s3_key}",
            },
        }
    except Exception as exc:
        log.error("storage.upload_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload recording to storage",
        )


# ---------------------------------------------------------------------------
# GET /recordings/{consultation_id}
# ---------------------------------------------------------------------------

@router.get(
    "/recordings/{consultation_id}",
    summary="Get presigned download URL for the latest recording",
)
async def get_recording_url(
    consultation_id: str,
    settings: Settings = Depends(get_settings),
    s3_client=Depends(_get_s3_client),
):
    bucket = settings.s3_audio_bucket
    prefix = f"consultations/{consultation_id}/"

    if not s3_client:
        return {
            "success": True,
            "data": {
                "url": f"http://localhost:8001/dev/recordings/{consultation_id}/latest.wav",
                "expires_in_seconds": settings.s3_presigned_url_expiry,
                "mode": "dev_fallback",
            },
        }

    try:
        # List objects to find the latest recording
        response = s3_client.list_objects_v2(
            Bucket=bucket, Prefix=prefix, MaxKeys=100
        )
        contents = response.get("Contents", [])

        if not contents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No recordings found for consultation {consultation_id}",
            )

        # Get the most recent recording
        latest = sorted(contents, key=lambda x: x["LastModified"], reverse=True)[0]

        # Generate presigned URL
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": latest["Key"]},
            ExpiresIn=settings.s3_presigned_url_expiry,
        )

        return {
            "success": True,
            "data": {
                "url": url,
                "key": latest["Key"],
                "size_bytes": latest["Size"],
                "last_modified": latest["LastModified"].isoformat(),
                "expires_in_seconds": settings.s3_presigned_url_expiry,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("storage.get_url_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate download URL",
        )


# ---------------------------------------------------------------------------
# GET /recordings/{consultation_id}/list
# ---------------------------------------------------------------------------

@router.get(
    "/recordings/{consultation_id}/list",
    summary="List all recordings for a consultation",
)
async def list_recordings(
    consultation_id: str,
    settings: Settings = Depends(get_settings),
    s3_client=Depends(_get_s3_client),
):
    bucket = settings.s3_audio_bucket
    prefix = f"consultations/{consultation_id}/"

    if not s3_client:
        return {
            "success": True,
            "data": {
                "consultation_id": consultation_id,
                "recordings": [],
                "total": 0,
                "mode": "dev_fallback",
            },
        }

    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket, Prefix=prefix, MaxKeys=100
        )
        contents = response.get("Contents", [])

        recordings = []
        for obj in sorted(contents, key=lambda x: x["LastModified"], reverse=True):
            # Generate presigned URL for each recording
            url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": obj["Key"]},
                ExpiresIn=settings.s3_presigned_url_expiry,
            )
            recordings.append({
                "key": obj["Key"],
                "filename": obj["Key"].split("/")[-1],
                "size_bytes": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
                "download_url": url,
            })

        return {
            "success": True,
            "data": {
                "consultation_id": consultation_id,
                "recordings": recordings,
                "total": len(recordings),
            },
        }
    except Exception as exc:
        logger.error("storage.list_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list recordings",
        )


# ---------------------------------------------------------------------------
# DELETE /recordings/{consultation_id}/{filename}
# ---------------------------------------------------------------------------

@router.delete(
    "/recordings/{consultation_id}/{filename}",
    summary="Delete a specific recording",
)
async def delete_recording(
    consultation_id: str,
    filename: str,
    settings: Settings = Depends(get_settings),
    s3_client=Depends(_get_s3_client),
):
    bucket = settings.s3_audio_bucket
    s3_key = f"consultations/{consultation_id}/{filename}"

    if not s3_client:
        return {"success": True, "message": f"Deleted {s3_key} (dev fallback)"}

    try:
        s3_client.delete_object(Bucket=bucket, Key=s3_key)
        logger.info("storage.deleted", key=s3_key)
        return {"success": True, "message": f"Deleted {s3_key}"}
    except Exception as exc:
        logger.error("storage.delete_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete recording",
        )
