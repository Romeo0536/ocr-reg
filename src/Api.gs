/**
 * Api.gs
 * -------------------------------------------------------------------------
 * JSON API สำหรับให้ "หน้าเว็บภายนอก" (standalone frontend) เรียกใช้งาน
 *
 * การยืนยันตัวตน:
 *   1) API_TOKEN  — โทเคนลับ (บังคับทุก request)
 *   2) Gmail login (ไม่บังคับ) — ถ้าตั้ง ALLOWED_EMAILS ไว้ การกระทำที่แก้ไข
 *      ข้อมูล (บันทึก/ประมวลผล) จะต้องแนบ Google ID token ที่อีเมลอยู่ในรายการ
 *
 * CORS: Apps Script ตั้ง header เองไม่ได้ แต่ response ของ Web App จะถูกเสิร์ฟ
 *   ผ่าน googleusercontent ที่มี Access-Control-Allow-Origin: * ให้อยู่แล้ว
 *   >> frontend ต้องส่งแบบ "simple request" (Content-Type: text/plain) เพื่อ
 *      เลี่ยง preflight OPTIONS ที่ Apps Script ตอบไม่ได้
 * ------------------------------------------------------------------------- */

/** POST endpoint หลักของ API */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return apiJson_({ ok: false, error: 'รูปแบบ JSON ไม่ถูกต้อง' });
  }
  return apiJson_(handleApi_(body.action || '', body));
}

/** GET แบบง่ายสำหรับทดสอบ/อ่านข้อมูล เช่น ?action=ping&token=xxx */
function apiGet_(e) {
  var p = (e && e.parameter) || {};
  return apiJson_(handleApi_(p.action, { action: p.action, apiToken: p.token, idToken: p.idToken }));
}

/** คืน response เป็น JSON */
function apiJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ตัวจัดการ action ทั้งหมดของ API
 * @return {Object} ผลลัพธ์ (มี ok: true/false เสมอ)
 */
function handleApi_(action, body) {
  body = body || {};
  var cfg = getConfig();

  // ---- ยืนยัน token ----
  if (!cfg.API_TOKEN) {
    return { ok: false, error: 'ระบบยังไม่ได้ตั้งค่า API Token (ตั้งในหน้าตั้งค่าของแอป)' };
  }
  if (!body.apiToken || body.apiToken !== cfg.API_TOKEN) {
    return { ok: false, error: 'API token ไม่ถูกต้องหรือไม่ได้แนบมา', code: 401 };
  }

  // ---- ตรวจ Gmail (เฉพาะ action ที่แก้ไขข้อมูล ถ้าตั้ง ALLOWED_EMAILS ไว้) ----
  var WRITE_ACTIONS = { saveConfig: 1, processImages: 1, processSources: 1, saveApiSettings: 1 };
  var email = body.idToken ? verifyGoogleIdToken_(body.idToken) : null;
  if (WRITE_ACTIONS[action] && (cfg.ALLOWED_EMAILS || '').trim() !== '') {
    if (!email) return { ok: false, error: 'ต้องเข้าสู่ระบบด้วย Gmail ก่อน', code: 401 };
    if (!emailAllowed_(email, cfg)) return { ok: false, error: 'อีเมลนี้ไม่ได้รับอนุญาต: ' + email, code: 403 };
  }

  // ---- แจกงานตาม action ----
  try {
    switch (action) {
      case 'ping':
        return { ok: true, email: getActiveEmail_(), time: new Date().toISOString() };
      case 'bootstrap':
        return { ok: true, data: getBootstrap() };
      case 'autoStatus':
        return { ok: true, data: getAutoStatus() };
      case 'sheetUrl':
        return { ok: true, url: getSpreadsheetUrl() };
      case 'testSource':
        return { ok: true, data: testSource() };
      case 'saveConfig':
        return { ok: true, data: saveConfig(body.patch || {}) };
      case 'processImages':
        return { ok: true, data: processUploadedFiles(body.files || []) };
      case 'processSources':
        return { ok: true, data: processAllSources() };
      default:
        return { ok: false, error: 'ไม่รู้จัก action: ' + action };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** ตรวจสอบ Google ID token → คืนอีเมล (หรือ null ถ้าไม่ผ่าน) */
function verifyGoogleIdToken_(idToken) {
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    var cfg = getConfig();
    if (cfg.GOOGLE_CLIENT_ID && info.aud !== cfg.GOOGLE_CLIENT_ID) return null; // ตรวจ audience
    if (info.email_verified !== 'true' && info.email_verified !== true) return null;
    return info.email || null;
  } catch (e) {
    return null;
  }
}

/** อีเมลอยู่ในรายการที่อนุญาตหรือไม่ (เว้นว่าง = อนุญาตทุกคน) */
function emailAllowed_(email, cfg) {
  cfg = cfg || getConfig();
  var list = (cfg.ALLOWED_EMAILS || '').split(',').map(function (s) {
    return s.trim().toLowerCase();
  }).filter(Boolean);
  if (!list.length) return true;
  return list.indexOf((email || '').toLowerCase()) !== -1;
}

/* =========================================================================
 *  ฟังก์ชันจัดการ API token / การเชื่อมต่อ (เรียกจากหน้าตั้งค่าในตัวแอป)
 * ========================================================================= */

/** ข้อมูลการเชื่อมต่อสำหรับตั้งค่า frontend (เฉพาะเจ้าของแอปเรียกผ่าน UI ในตัว) */
function getApiInfo() {
  var cfg = getConfig();
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  return {
    apiToken: cfg.API_TOKEN,
    allowedEmails: cfg.ALLOWED_EMAILS,
    googleClientId: cfg.GOOGLE_CLIENT_ID,
    webAppUrl: url
  };
}

/** สร้าง API token ใหม่ */
function generateApiToken() {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  return { apiToken: token };
}

/** บันทึกค่าการเชื่อมต่อ (allowed emails / client id) */
function saveApiSettings(patch) {
  var clean = {};
  if (patch && patch.ALLOWED_EMAILS !== undefined) clean.ALLOWED_EMAILS = patch.ALLOWED_EMAILS;
  if (patch && patch.GOOGLE_CLIENT_ID !== undefined) clean.GOOGLE_CLIENT_ID = patch.GOOGLE_CLIENT_ID;
  return saveConfig(clean);
}
