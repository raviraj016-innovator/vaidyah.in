#!/usr/bin/env bash
# Ingest a clinical trials CSV into the trial service (run on EC2).
#
# Usage:
#   bash scripts/ingest-trials.sh /path/to/trials.csv
#
# The trial service runs on port 8003 inside Docker but the port is NOT
# mapped to the host.  This script copies the CSV into the container and
# uses `docker exec` + curl to hit the service from inside.

set -euo pipefail

CONTAINER="vaidyah-trial-service"
CSV_FILE="${1:?Usage: $0 <csv-file>}"

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: File not found: $CSV_FILE"
  exit 1
fi

SIZE=$(stat -c%s "$CSV_FILE" 2>/dev/null || stat -f%z "$CSV_FILE" 2>/dev/null)
echo "Uploading $CSV_FILE ($(( SIZE / 1024 )) KB) into $CONTAINER ..."

# Copy CSV into the container
docker cp "$CSV_FILE" "$CONTAINER":/tmp/ingest.csv

# Upload via curl inside the container
RESPONSE=$(docker exec "$CONTAINER" \
  curl -s -w "\n%{http_code}" \
  -X POST \
  -F "file=@/tmp/ingest.csv" \
  -H "X-Internal-Service: true" \
  "http://localhost:8003/api/v1/ingest/csv/upload")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Upload accepted (HTTP $HTTP_CODE):"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  echo ""
  echo "Polling import status..."
  while true; do
    sleep 3
    STATUS=$(docker exec "$CONTAINER" \
      curl -s -H "X-Internal-Service: true" \
      "http://localhost:8003/api/v1/ingest/csv/status")
    STATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','unknown'))" 2>/dev/null || echo "unknown")
    PROCESSED=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('processed',0)}/{d.get('total_rows',0)} rows, {d.get('indexed',0)} indexed, {d.get('failed',0)} failed\")" 2>/dev/null || echo "")
    echo "  [$STATE] $PROCESSED"
    if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ] || [ "$STATE" = "idle" ]; then
      break
    fi
  done

  # Cleanup
  docker exec "$CONTAINER" rm -f /tmp/ingest.csv
  echo "Done."
else
  echo "Upload failed (HTTP $HTTP_CODE):"
  echo "$BODY"
  docker exec "$CONTAINER" rm -f /tmp/ingest.csv
  exit 1
fi
