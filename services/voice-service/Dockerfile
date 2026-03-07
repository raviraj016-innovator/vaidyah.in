FROM python:3.11.11-slim AS base

LABEL maintainer="Vaidyah Platform Team"
LABEL service="voice-service"
LABEL description="Voice processing service for speech-to-text, text-to-speech, and prosody analysis"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libffi-dev \
    ffmpeg \
    libavcodec-extra \
    libsox-dev \
    sox \
    libopus-dev \
    libopusfile-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2", "--loop", "uvloop", "--limit-concurrency", "100"]
