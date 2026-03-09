#!/usr/bin/env bash
# Ingest a clinical trials CSV into the trial service (run on EC2).
#
# Usage:
#   ./scripts/ingest-trials.sh /path/to/trials.csv
#   ./scripts/ingest-trials.sh /path/to/trials.csv http://localhost:8003
#
# The trial service runs on port 8003 inside Docker Compose.
# This bypasses the API gateway auth since it hits the service directly.

set -euo pipefail

CSV_FILE="${1:?Usage: $0 <csv-file> [trial-service-url]}"
TRIAL_URL="${2:-http://localhost:8003}"

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: File not found: $CSV_FILE"
  exit 1
fi

SIZE=$(stat -c%s "$CSV_FILE" 2>/dev/null || stat -f%z "$CSV_FILE" 2>/dev/null)
echo "Uploading $CSV_FILE ($(( SIZE / 1024 )) KB) to $TRIAL_URL ..."

# The /ingest/csv/upload endpoint requires admin auth when called via the
# API gateway, but when hitting the trial service directly on localhost the
# auth middleware sees no token and we need to bypass it.  We pass a simple
# internal header that the middleware can trust for local-only calls.
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -F "file=@${CSV_FILE}" \
  -H "X-Internal-Service: true" \
  "${TRIAL_URL}/ingest/csv/upload")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Upload accepted (HTTP $HTTP_CODE):"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  echo ""
  echo "Polling import status..."
  while true; do
    sleep 2
    STATUS=$(curl -s -H "X-Internal-Service: true" "${TRIAL_URL}/ingest/csv/status")
    STATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','unknown'))" 2>/dev/null || echo "unknown")
    echo "  $STATUS"
    if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ] || [ "$STATE" = "idle" ]; then
      break
    fi
  done
  echo "Done."
else
  echo "Upload failed (HTTP $HTTP_CODE):"
  echo "$BODY"
  exit 1
fi
