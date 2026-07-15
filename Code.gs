// ============================================================
// Google Apps Script — PM2.5 + Water Gateway
// รองรับทั้ง
//   PM2.5
//   Water Quality
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ============================================================
// MAIN
// ============================================================
function doGet(e) {

  const p = (e && e.parameter) ? e.parameter : {};

  // ---------- WRITE PM2.5 ----------
  if (p.pm25 !== undefined) {
    return savePM(p);
  }

  // ---------- WRITE Water ----------
  if (p.ph !== undefined || p.tds !== undefined || p.turbidity !== undefined) {
    return saveWater(p);
  }

  // ---------- READ ----------
  const type = (p.type || "pm").toLowerCase();

  switch (p.action) {

    case "data":
      return (type == "water") ? getWaterHistory() : getPMHistory();

    case "forecast":
      return (type == "water") ? getWaterForecast() : getPMForecast();

    default:
      return (type == "water") ? getLatestWater() : getLatestPM();
  }
}

// ============================================================
// WRITE PM2.5
// ============================================================
function savePM(p) {

  const sheet = SS.getSheetByName("PM2.5");

  const now = new Date();

  sheet.appendRow([
    now,
    parseFloat(p.pm1)  || 0,
    parseFloat(p.pm25) || 0,
    parseFloat(p.pm10) || 0,
    parseFloat(p.temp) || 0,
    parseFloat(p.hum)  || 0
  ]);

  return ok({
    type: "pm",
    timestamp: Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss")
  });

}

// ============================================================
// WRITE WATER
// ============================================================
function saveWater(p) {

  const sheet = SS.getSheetByName("Water");

  const now = new Date();

  sheet.appendRow([
    now,
    parseFloat(p.temp)      || 0,
    parseFloat(p.ph)        || 0,
    parseFloat(p.tds)       || 0,
    parseFloat(p.turbidity) || 0
  ]);

  return ok({
    type: "water",
    timestamp: Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss")
  });

}

// ============================================================
// PM History
// ============================================================
function getPMHistory() {

  const sheet = SS.getSheetByName("PM2.5");

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];
  const rows    = all.slice(Math.max(1, all.length - 288));

  return ok({
    type: "pm",
    data: rows.map(r => rowToObj(headers, r))
  });

}

// ============================================================
// Water History
// ============================================================
function getWaterHistory() {

  const sheet = SS.getSheetByName("Water");

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];
  const rows    = all.slice(Math.max(1, all.length - 288));

  return ok({
    type: "water",
    data: rows.map(r => rowToObj(headers, r))
  });

}

// ============================================================
// PM Forecast
// ============================================================
function getPMForecast() {

  const sheet = SS.getSheetByName("Forecast");

  if (!sheet) return ok({ data: [] });

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];

  return ok({
    type: "pm",
    data: all.slice(1).map(r => rowToObj(headers, r))
  });

}

// ============================================================
// Water Forecast
// ============================================================
function getWaterForecast() {

  const sheet = SS.getSheetByName("Water_Forecast");

  if (!sheet) return ok({ data: [] });

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({ data: [] });

  const headers = all[0];

  return ok({
    type: "water",
    data: all.slice(1).map(r => rowToObj(headers, r))
  });

}

// ============================================================
// Latest PM
// ============================================================
function getLatestPM() {

  const sheet = SS.getSheetByName("PM2.5");

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({});

  return ok(rowToObj(all[0], all[all.length - 1]));

}

// ============================================================
// Latest Water
// ============================================================
function getLatestWater() {

  const sheet = SS.getSheetByName("Water");

  const all = sheet.getDataRange().getValues();

  if (all.length < 2) return ok({});

  return ok(rowToObj(all[0], all[all.length - 1]));

}

// ============================================================
// Helpers
// ============================================================
function rowToObj(headers, row) {

  const obj = {};

  headers.forEach(function(h, i) {
    obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i];
  });

  return obj;

}

function ok(data) {

  return ContentService
    .createTextOutput(JSON.stringify({ status: "success", ...data }))
    .setMimeType(ContentService.MimeType.JSON);

}
