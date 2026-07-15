#!/bin/bash

# เขียน credentials.json จาก env var (ถ้ามี)
if [ -n "$GOOGLE_CREDENTIALS_JSON_B64" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON_B64" | base64 -d > /app/credentials.json
    echo "✅ credentials จาก B64 env var"
elif [ -n "$GOOGLE_CREDENTIALS_JSON" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON" > /app/credentials.json
    echo "✅ credentials จาก JSON env var"
fi

# ส่ง env vars ทั้งหมดให้ cron เห็นด้วย
printenv | grep -v "no_proxy" >> /etc/environment

# สร้าง cron job ที่ source env ก่อนรัน
cat > /etc/cron.d/forecast << 'CRON'
SHELL=/bin/bash
0 */6 * * * root . /etc/environment; cd /app && python forecast.py >> /var/log/forecast.log 2>&1
CRON
chmod 0644 /etc/cron.d/forecast
crontab /etc/cron.d/forecast

# ถ้ามี credentials → รัน forecast ทันที
if [ -f "/app/credentials.json" ] && [ -s "/app/credentials.json" ]; then
    echo "✅ credentials พร้อมแล้ว — เริ่ม forecast"
    python /app/forecast.py || echo "⚠️ forecast error แต่ container จะไม่หยุด"
else
    echo "❌ ไม่พบ credentials — ใส่ GOOGLE_CREDENTIALS_JSON_B64 ใน Dokploy Environment"
fi

# ค้าง container ไว้ ไม่ปิด
exec cron -f
