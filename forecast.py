"""
forecast.py — PM2.5 + Water Quality Prophet Pipeline
อ่านข้อมูลจาก Google Sheets → เทรน → พยากรณ์ 24h → เขียนกลับ Sheet

ติดตั้งก่อน:
    pip install prophet gspread pandas numpy

การ Auth กับ Google Sheets:
    1. ไปที่ console.cloud.google.com → สร้าง Service Account
    2. ดาวน์โหลด JSON key → บันทึกเป็น credentials.json ในโฟลเดอร์นี้
    3. เปิด Google Sheet → Share → ใส่ email ของ Service Account

รัน: python forecast.py
"""

import os
import json
import tempfile
import pandas as pd
import numpy as np
import gspread
import warnings
from prophet import Prophet
from datetime import datetime

warnings.filterwarnings('ignore')

# ============================================================
# ⚙️  CONFIG
# ============================================================
SHEET_ID       = '1JAAqAMiy0lHOf4Myhi764OZwEM77hrFWCdEmqKNwYLQ'
CREDENTIALS_FILE = 'credentials.json'
FORECAST_HOURS = 24
# ============================================================


def connect_sheets():
    """เชื่อมต่อ Google Sheets รองรับทั้ง env var (Docker) และ credentials.json (local)"""
    import base64
    # รองรับ base64 encoded (แก้ปัญหา JSON quote บิดเบี้ยวใน Dokploy)
    creds_b64 = os.environ.get('GOOGLE_CREDENTIALS_JSON_B64')
    creds_json = os.environ.get('GOOGLE_CREDENTIALS_JSON')

    if creds_b64:
        creds_json = base64.b64decode(creds_b64).decode('utf-8')

    if creds_json:
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        tmp.write(creds_json)
        tmp.close()
        gc = gspread.service_account(filename=tmp.name)
        os.unlink(tmp.name)
    else:
        gc = gspread.service_account(filename=CREDENTIALS_FILE)
    return gc


def read_sheet(gc, sheet_name, timestamp_col='Timestamp'):
    """อ่านข้อมูลจาก Sheet → DataFrame"""
    ws   = gc.open_by_key(SHEET_ID).worksheet(sheet_name)
    rows = ws.get_all_values()
    if len(rows) < 2:
        return pd.DataFrame()
    headers = rows[0]
    data = rows[1:]
    df = pd.DataFrame(data, columns=headers)
    # ลบ column ที่ header ว่าง
    df = df.loc[:, df.columns != '']
    df[timestamp_col] = pd.to_datetime(df[timestamp_col], format='mixed', dayfirst=False)
    return df


def write_forecast(gc, sheet_name, forecast_df):
    """เขียน DataFrame ลง Sheet (เคลียร์เก่าก่อน)"""
    ws = gc.open_by_key(SHEET_ID).worksheet(sheet_name)
    ws.clear()
    rows = [forecast_df.columns.tolist()] + forecast_df.values.tolist()
    ws.update(rows)
    print(f"  ✅ เขียน {len(forecast_df)} แถว → Sheet '{sheet_name}'")


def make_future(last_ts, hours, freq='5min'):
    """สร้าง future DataFrame สำหรับ Prophet"""
    periods = hours * (60 // int(freq.replace('min', '')))
    return pd.DataFrame({
        'ds': pd.date_range(start=last_ts, periods=periods + 1, freq=freq)[1:]
    })


def prophet_forecast(df_p, future):
    """เทรน Prophet แล้วพยากรณ์"""
    m = Prophet(
        yearly_seasonality=False,
        weekly_seasonality=True,
        daily_seasonality=True,
        changepoint_prior_scale=0.05,
    )
    m.fit(df_p)
    return m.predict(future)


# ============================================================
# PM2.5 PIPELINE
# ============================================================
def run_pm25(gc):
    print("\n[PM2.5] เริ่ม pipeline...")

    df = read_sheet(gc, 'PM2.5', timestamp_col='Time')
    print(f"  โหลด {len(df)} แถว ({df['Time'].min()} ถึง {df['Time'].max()})")

    df_p = df.rename(columns={'Time': 'ds', 'PM2.5': 'y'})
    df_p['pm1']  = df['PM1.0']
    df_p['pm10'] = df['PM10']
    df_p['temp'] = df['Temp']
    df_p['hum']  = df['Humidity']

    model = Prophet(
        yearly_seasonality=False,
        weekly_seasonality=True,
        daily_seasonality=True,
        changepoint_prior_scale=0.05,
    )
    for col in ['pm1', 'pm10', 'temp', 'hum']:
        model.add_regressor(col)

    print("  กำลังเทรนโมเดล...")
    model.fit(df_p)

    last288 = df_p.tail(288)
    periods = FORECAST_HOURS * 12
    future  = pd.DataFrame({
        'ds':   pd.date_range(start=df_p['ds'].iloc[-1], periods=periods + 1, freq='5min')[1:],
        'pm1':  [last288['pm1'].mean()]  * periods,
        'pm10': [last288['pm10'].mean()] * periods,
        'temp': [last288['temp'].mean()] * periods,
        'hum':  [last288['hum'].mean()]  * periods,
    })

    forecast = model.predict(future)

    out = pd.DataFrame({
        'Timestamp':  forecast['ds'].dt.strftime('%Y-%m-%dT%H:%M:%S'),
        'PM2.5':      forecast['yhat'].clip(lower=0).round(1),
        'yhat_lower': forecast['yhat_lower'].clip(lower=0).round(1),
        'yhat_upper': forecast['yhat_upper'].clip(lower=0).round(1),
    })

    write_forecast(gc, 'Forecast', out)


# ============================================================
# WATER QUALITY PIPELINE
# ============================================================
def run_water(gc):
    print("\n[Water] เริ่ม pipeline...")

    df = read_sheet(gc, 'Water', timestamp_col='Timestamp')
    print(f"  โหลด {len(df)} แถว ({df['Timestamp'].min()} ถึง {df['Timestamp'].max()})")

    future = make_future(df['Timestamp'].iloc[-1], FORECAST_HOURS, freq='5min')
    results = {'Timestamp': future['ds'].dt.strftime('%Y-%m-%dT%H:%M:%S')}

    # พยากรณ์แต่ละ parameter แยกกัน
    for col in ['Temperature', 'pH', 'TDS', 'Turbidity']:
        print(f"  เทรน {col}...")
        df_p = df[['Timestamp', col]].rename(columns={'Timestamp': 'ds', col: 'y'}).copy()
        df_p['y'] = pd.to_numeric(df_p['y'], errors='coerce').fillna(0)
        fc = prophet_forecast(df_p, future.copy())
        results[col] = fc['yhat'].clip(lower=0).round(2).values

    write_forecast(gc, 'Water_Forecast', pd.DataFrame(results))


# ============================================================
# MAIN
# ============================================================
def run():
    print(f"[{datetime.now():%Y-%m-%d %H:%M}] เชื่อมต่อ Google Sheets...")
    gc = connect_sheets()

    run_pm25(gc)
    run_water(gc)

    print(f"\n✅ Pipeline ทั้งหมดเสร็จสมบูรณ์")


if __name__ == '__main__':
    run()
