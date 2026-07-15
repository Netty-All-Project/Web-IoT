#!/bin/bash
set -e

# ลองเขียน credentials จาก env var ก่อน (ถ้ามี)
if [ -n "$GOOGLE_CREDENTIALS_JSON_B64" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON_B64" | base64 -d > /app/credentials.json
    echo "✅ credentials จาก env var"
elif [ -f "/app/credentials.json" ]; then
    echo "✅ credentials จาก mount"
else
    echo "❌ ไม่พบ credentials"
    exit 1
fi

python /app/forecast.py
exec cron -f
