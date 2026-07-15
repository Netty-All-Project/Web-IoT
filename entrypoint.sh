#!/bin/bash
set -e

# เขียน credentials.json จาก env var ตอน container start
if [ -n "$GOOGLE_CREDENTIALS_JSON_B64" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON_B64" | base64 -d > /app/credentials.json
    echo "✅ credentials.json พร้อมแล้ว"
else
    echo "❌ ไม่พบ GOOGLE_CREDENTIALS_JSON_B64"
    exit 1
fi

python /app/forecast.py
exec cron -f
