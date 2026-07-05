/**
 * Config.gs
 * -------------------------------------------------------------------------
 * เก็บ / อ่านค่าตั้งค่าทั้งหมดของระบบ (System configuration)
 *
 * ค่าตั้งค่าถูกเก็บใน Script Properties เพื่อไม่ให้ค่าลับ (เช่น Gemini API key)
 * ปรากฏในโค้ด และเพื่อให้แก้ไขผ่านหน้าเว็บได้
 *
 * แนวคิด "เปิด/ปิดว่าจะดึงจากไหน เก็บที่ไหน":
 *   SOURCE_MODE  = แหล่งดึงข้อมูล  (manual | drive | gmail)
 *   SPREADSHEET_ID = ปลายทางที่จะบันทึก (Google Sheet ใด)
 *   AUTO_ENABLED = เปิด/ปิด การทำงานอัตโนมัติ (time-driven trigger)
 * ------------------------------------------------------------------------- */

/** ค่าเริ่มต้นของทุกการตั้งค่า */
var DEFAULT_CONFIG = {
  // --- Gemini ---
  GEMINI_API_KEY: '',
  // ผู้ใช้สามารถเปลี่ยนเป็นรุ่นที่ต้องการได้ เช่น 'gemini-3.1-flash', 'gemini-2.0-flash'
  GEMINI_MODEL: 'gemini-2.0-flash',

  // --- แหล่งข้อมูล (Source) ---
  // manual = อัปโหลดผ่านหน้าเว็บ, drive = โฟลเดอร์ใน Google Drive, gmail = อีเมลตามเงื่อนไข
  SOURCE_MODE: 'manual',
  DRIVE_SOURCE_FOLDER_ID: '',     // โฟลเดอร์ต้นทางใน Drive
  DRIVE_DONE_FOLDER_ID: '',       // โฟลเดอร์ที่จะย้ายไฟล์ไปเมื่อประมวลผลเสร็จ (เว้นว่าง = ไม่ย้าย)
  GMAIL_QUERY: 'has:attachment (invoice OR receipt OR ใบเสร็จ OR ใบกำกับ) newer_than:30d',
  GMAIL_PROCESSED_LABEL: 'OCR-Processed',

  // --- ปลายทาง (Destination) ---
  SPREADSHEET_ID: '',             // เว้นว่าง = ระบบจะสร้างชีตใหม่ให้อัตโนมัติ

  // --- อัตโนมัติ (Automation) ---
  AUTO_ENABLED: 'false',          // 'true' = เปิด time trigger
  AUTO_INTERVAL_MIN: '30',        // ทุกกี่นาที (จะปัดเป็น 1/5/10/15/30/60)

  // --- อื่น ๆ ---
  DEDUPE: 'true',                 // ข้ามเอกสารซ้ำ (อ้างอิงจากเลขที่เอกสาร + ผู้ขาย)
  DEFAULT_VAT_RATE: '7'           // อัตราภาษีมูลค่าเพิ่มเริ่มต้น (%) ใช้ตอนตรวจสอบ
};

/** อ่านค่าตั้งค่าทั้งหมด (รวมค่า default) */
function getConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var cfg = {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    cfg[k] = (props[k] !== undefined && props[k] !== '') ? props[k] : DEFAULT_CONFIG[k];
  });
  return cfg;
}

/** อ่านค่าตั้งค่าแบบซ่อนข้อมูลลับ (สำหรับส่งไปแสดงบนหน้าเว็บ) */
function getConfigSafe() {
  var cfg = getConfig();
  cfg.GEMINI_API_KEY_SET = !!cfg.GEMINI_API_KEY;   // บอกแค่ว่าตั้งค่าแล้วหรือยัง
  cfg.GEMINI_API_KEY = '';                          // ไม่ส่ง key จริงกลับไป
  cfg.USER_EMAIL = getActiveEmail_();
  return cfg;
}

/**
 * บันทึกค่าตั้งค่า (เฉพาะคีย์ที่ส่งมา)
 * @param {Object} patch  คู่ค่า key/value ที่ต้องการอัปเดต
 */
function saveConfig(patch) {
  var props = PropertiesService.getScriptProperties();
  Object.keys(patch || {}).forEach(function (k) {
    if (!DEFAULT_CONFIG.hasOwnProperty(k)) return;      // กันคีย์แปลกปลอม
    var v = patch[k];
    // ถ้าเป็น API key และส่งค่าว่างมา = ไม่แก้ (คงค่าเดิม)
    if (k === 'GEMINI_API_KEY' && (v === '' || v === null || v === undefined)) return;
    props.setProperty(k, String(v));
  });
  // ปรับ trigger อัตโนมัติให้ตรงกับค่า AUTO_ENABLED
  syncAutoTrigger_();
  return getConfigSafe();
}

/** อีเมลของผู้ใช้ที่ล็อกอินอยู่ (ใช้สำหรับ "Login ด้วย Gmail") */
function getActiveEmail_() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}
