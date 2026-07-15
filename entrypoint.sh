#!/bin/bash

# ลองเขียน credentials จาก env var (ถ้ามี)
if [ -n "$GOOGLE_CREDENTIALS_JSON_B64" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON_B64" | base64 -d > /app/credentials.json
    echo "✅ credentials จาก env var"
fi

# ถ้ามี credentials → รัน forecast ทันที
if [ -f "/app/credentials.json" ] && [ -s "/app/credentials.json" ]; then
    echo "✅ credentials พร้อมแล้ว — เริ่ม forecast"
    python /app/forecast.py || echo "⚠️ forecast error แต่ container จะไม่หยุด"
else
    echo ""
    echo "================================================"
    echo " ❌ ไม่พบ credentials.json"
    echo " เปิด Docker Terminal แล้วรัน:"
    echo ""
    echo " cat > /app/credentials.json << 'EOF'"
    echo " {วาง JSON ทั้งก้อนตรงนี้}"
    echo " EOF"
    echo ""
    echo " python /app/forecast.py"
    echo "================================================"
    echo ""
fi

# ค้าง container ไว้ ไม่ปิด
exec cron -f
