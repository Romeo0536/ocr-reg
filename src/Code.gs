/**
 * Code.gs — จุดเริ่มต้นของระบบ (Web App entry + orchestration)
 * -------------------------------------------------------------------------
 * ระบบอ่านบิล/ใบเสร็จ/ภาษีซื้อ/ภาษีขาย ด้วย Gemini แล้วบันทึกลง Google Sheet
 *   - Login ด้วย Gmail (executeAs USER + access MYSELF)
 *   - เลือกแหล่งดึงข้อมูล + ปลายทางได้
 *   - ทำงานอัตโนมัติผ่าน time-driven trigger
 *   - แยกรายการสินค้าหลายรายการต่อเอกสารได้
 * ------------------------------------------------------------------------- */

/** ให้บริการหน้าเว็บ (Web App) */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ระบบอ่านบิล & ภาษี (OCR → Google Sheet)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ให้ include ไฟล์ html ย่อย (CSS/JS) เข้าไปในหน้าเดียว */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* =========================================================================
 *  การประมวลผลหลัก
 * ========================================================================= */

/**
 * ประมวลผลไฟล์ 1 ไฟล์: อ่าน → ตรวจสอบ → บันทึก
 * @return {Object} ผลลัพธ์ต่อไฟล์
 */
function processOneFile_(blob, fileName, source) {
  try {
    var extracted = geminiExtract(blob);
    var validation = validateDoc(extracted);
    var stored = storeDocument(extracted, validation, { source: source, fileName: fileName });
    return {
      ok: true,
      fileName: fileName,
      source: source,
      docId: stored.docId,
      duplicate: !!stored.duplicate,
      written: stored.written,
      sheet: stored.sheet,
      doc: extracted,
      validation: validation
    };
  } catch (e) {
    try {
      var ss = getSpreadsheet_();
      writeLog_(ss, source, fileName, '', 'ผิดพลาด', e.message);
    } catch (e2) {}
    return { ok: false, fileName: fileName, source: source, error: e.message };
  }
}

/**
 * เรียกจากหน้าเว็บ: ประมวลผลไฟล์ที่ผู้ใช้อัปโหลด (โหมด manual)
 * @param {Array} files  [{ name, mimeType, dataB64 }]
 */
function processUploadedFiles(files) {
  if (!files || !files.length) return { results: [], summary: emptySummary_() };
  var results = files.map(function (f) {
    var bytes = Utilities.base64Decode(f.dataB64);
    var blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name);
    return processOneFile_(blob, f.name, 'อัปโหลด');
  });
  return { results: results, summary: summarize_(results) };
}

/**
 * เรียกจากหน้าเว็บ หรือจาก trigger: ประมวลผลไฟล์จากแหล่งอัตโนมัติ (drive/gmail)
 */
function processAllSources() {
  var pending = collectPendingFiles_();
  var results = [];
  pending.forEach(function (item) {
    var r = processOneFile_(item.blob, item.fileName, item.source);
    results.push(r);
    if (r.ok && item.onDone) {
      try { item.onDone(); } catch (e) { /* ย้าย/ติด label ล้มเหลว ไม่หยุดทั้งชุด */ }
    }
  });
  return { results: results, summary: summarize_(results) };
}

/** เรียกโดย time-driven trigger */
function autoRun() {
  var cfg = getConfig();
  if (cfg.AUTO_ENABLED !== 'true') return;
  processAllSources();
}

function emptySummary_() { return { total: 0, saved: 0, duplicate: 0, failed: 0, needReview: 0 }; }

function summarize_(results) {
  var s = emptySummary_();
  results.forEach(function (r) {
    s.total++;
    if (!r.ok) { s.failed++; return; }
    if (r.duplicate) { s.duplicate++; return; }
    if (r.written) s.saved++;
    if (r.validation && r.validation.level !== 'ok') s.needReview++;
  });
  return s;
}

/* =========================================================================
 *  Trigger อัตโนมัติ
 * ========================================================================= */

/** ปรับ trigger ให้ตรงกับค่า AUTO_ENABLED / AUTO_INTERVAL_MIN */
function syncAutoTrigger_() {
  var cfg = getConfig();
  // ลบ trigger เดิมของ autoRun ทั้งหมด
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoRun') ScriptApp.deleteTrigger(t);
  });
  if (cfg.AUTO_ENABLED !== 'true') return;
  if (cfg.SOURCE_MODE === 'manual') return; // manual ไม่ต้องมี trigger

  var minutes = parseInt(cfg.AUTO_INTERVAL_MIN, 10) || 30;
  if (minutes >= 45) {
    ScriptApp.newTrigger('autoRun').timeBased().everyHours(1).create();
  } else {
    ScriptApp.newTrigger('autoRun').timeBased().everyMinutes(nearestInterval_(minutes)).create();
  }
}

/** ปัดเป็นค่าที่ everyMinutes รองรับ: 1,5,10,15,30 */
function nearestInterval_(m) {
  var allowed = [1, 5, 10, 15, 30];
  var best = allowed[0], diff = Infinity;
  allowed.forEach(function (a) { var d = Math.abs(a - m); if (d < diff) { diff = d; best = a; } });
  return best;
}

/** สถานะ trigger ปัจจุบัน (สำหรับแสดงบนหน้าเว็บ) */
function getAutoStatus() {
  var cfg = getConfig();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'autoRun'; });
  return { enabled: cfg.AUTO_ENABLED === 'true', triggerActive: has, intervalMin: cfg.AUTO_INTERVAL_MIN, sourceMode: cfg.SOURCE_MODE };
}

/* =========================================================================
 *  Bootstrap / เมนูใน Spreadsheet (ถ้าเปิดจากไฟล์ชีต)
 * ========================================================================= */

/** เรียกครั้งเดียวเพื่อเตรียมชีตปลายทาง + ให้สิทธิ์ */
function setup() {
  var ss = getSpreadsheet_();
  ensureAllSheets_(ss);
  return { spreadsheetUrl: ss.getUrl(), spreadsheetId: ss.getId() };
}

/** ส่งข้อมูลตั้งต้นให้หน้าเว็บ (config + สถานะ + url ชีต) */
function getBootstrap() {
  return {
    config: getConfigSafe(),
    auto: getAutoStatus(),
    spreadsheetUrl: getSpreadsheetUrl(),
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-3.1-flash']
  };
}
