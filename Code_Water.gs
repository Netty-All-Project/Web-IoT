// ============================================================
// Google Apps Script — Water Quality Gateway (แม่น้ำกก)
// ทำงาน 2 โหมด:
//   WRITE: ESP32 ส่ง ?temp=&ph=&tds=&turbidity=  → บันทึกลง Sheet
//   READ:  Dashboard ส่ง ?action=data|forecast    → คืน JSON
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ============================================================
function doGet(e) {
  const p = e.parameter;

  // — โหมด WRITE: ESP32 ส่งข้อมูลมา —
  if (p.temp !== undefined) {
    return saveReading(p);
  }

  // — โหมด READ: Dashboard ขอข้อมูล —
  switch (p.action) {
    case 'data':     return getHistory();
    case 'forecast': return getForecast();
    default:         return getLatest();
  }
}

// ============================================================
// WRITE — บันทึกค่าจาก ESP32
// ESP32 ส่ง: ?temp=25.1&ph=7.2&tds=150&turbidity=12.3
// ============================================================
function saveReading(p) {
  const sheet = SS.getSheetByName('Water_Data');
  const now   = new Date();

  sheet.appendRow([
    now,
    parseFloat(p.temp)      || 0,
    parseFloat(p.ph)        || 0,
    parseFloat(p.tds)       || 0,
    parseFloat(p.turbidity) || 0,
  ]);

  return ok({
    timestamp: Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss'),
    temp: p.temp, ph: p.ph, tds: p.tds, turbidity: p.turbidity
  });
}

// ============================================================
// READ — ประวัติ 24 ชั่วโมงล่าสุด (288 แถว × 5 นาที)
// ============================================================
function getHistory() {
  const sheet = SS.getSheetByName('Water_Data');
  const all   = sheet.getDataRange().getValues();
  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];
  const rows    = all.slice(Math.max(1, all.length - 288));
  return ok({ data: rows.map(r => rowToObj(headers, r)) });
}

// ============================================================
// READ — พยากรณ์จาก Colab/Prophet (Sheet ชื่อ Water_Forecast)
// ============================================================
function getForecast() {
  const sheet = SS.getSheetByName('Water_Forecast');
  if (!sheet) return ok({ data: [] });

  const all = sheet.getDataRange().getValues();
  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];
  return ok({ data: all.slice(1).map(r => rowToObj(headers, r)) });
}

// ============================================================
// READ — แถวล่าสุดแถวเดียว
// ============================================================
function getLatest() {
  const sheet = SS.getSheetByName('Water_Data');
  const all   = sheet.getDataRange().getValues();
  if (all.length < 2) return ok({});
  return ok(rowToObj(all[0], all[all.length - 1]));
}

// ============================================================
// HELPERS
// ============================================================
function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i];
  });
  return obj;
}

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success', ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}
