/**
 * SheetStore.gs
 * -------------------------------------------------------------------------
 * จัดการ Google Sheet ปลายทาง: สร้างชีต, เขียนข้อมูล, กันข้อมูลซ้ำ
 *
 * โครงสร้างชีต:
 *   ภาษีซื้อ      : 1 แถว = 1 เอกสาร (รายงานภาษีซื้อ)
 *   ภาษีขาย      : 1 แถว = 1 เอกสาร (รายงานภาษีขาย)
 *   รายการสินค้า  : 1 แถว = 1 บรรทัดสินค้า (แยกหลายรายการ) เชื่อมด้วย DocID
 *   Log          : บันทึกการทำงานของระบบ
 * ------------------------------------------------------------------------- */

var SHEET_PURCHASE = 'ภาษีซื้อ';
var SHEET_SALES    = 'ภาษีขาย';
var SHEET_ITEMS    = 'รายการสินค้า';
var SHEET_LOG      = 'Log';

var DOC_HEADERS = [
  'DocID', 'วันที่เอกสาร', 'ประเภท', 'เลขที่เอกสาร',
  'ชื่อผู้ขาย', 'เลขภาษีผู้ขาย', 'ชื่อผู้ซื้อ', 'เลขภาษีผู้ซื้อ',
  'มูลค่าก่อนภาษี', 'อัตราภาษี(%)', 'จำนวนภาษี', 'ยอดรวมสุทธิ',
  'สกุลเงิน', 'สถานะตรวจสอบ', 'หมายเหตุ', 'ที่มา', 'ไฟล์', 'เวลาบันทึก'
];
var ITEM_HEADERS = ['DocID', 'ลำดับ', 'รายละเอียด', 'จำนวน', 'ราคาต่อหน่วย', 'จำนวนเงิน'];
var LOG_HEADERS  = ['เวลา', 'ที่มา', 'ไฟล์', 'DocID', 'ผลลัพธ์', 'ข้อความ'];

/** เปิดสเปรดชีตปลายทาง (สร้างใหม่ถ้ายังไม่ได้ตั้งค่า) */
function getSpreadsheet_() {
  var cfg = getConfig();
  if (cfg.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  }
  // สร้างใหม่
  var ss = SpreadsheetApp.create('OCR Tax Records — ' + Utilities.formatDate(nowBkk_(), 'Asia/Bangkok', 'yyyy-MM-dd'));
  saveConfig({ SPREADSHEET_ID: ss.getId() });
  return ss;
}

/** ดึง/สร้างชีตพร้อมหัวตาราง */
function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  }
  return sh;
}

/** สร้าง/ตรวจให้ชีตทั้งหมดพร้อมใช้งาน แล้วลบชีตเปล่าเริ่มต้น */
function ensureAllSheets_(ss) {
  ensureSheet_(ss, SHEET_PURCHASE, DOC_HEADERS);
  ensureSheet_(ss, SHEET_SALES, DOC_HEADERS);
  ensureSheet_(ss, SHEET_ITEMS, ITEM_HEADERS);
  ensureSheet_(ss, SHEET_LOG, LOG_HEADERS);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1) { try { ss.deleteSheet(def); } catch (e) {} }
}

/** สร้าง DocID เพื่อกันข้อมูลซ้ำ (เลขที่เอกสาร + ผู้ขาย + ยอดรวม) */
function makeDocId_(d) {
  var key = [d.doc_number, d.seller_tax_id || d.seller_name, d.grand_total].join('|').toLowerCase();
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 12);
}

/** DocID ที่มีอยู่แล้วในชีตเอกสาร (ไว้เช็คซ้ำ) */
function existingDocIds_(ss) {
  var ids = {};
  [SHEET_PURCHASE, SHEET_SALES].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (r[0]) ids[r[0]] = true;
    });
  });
  return ids;
}

/**
 * บันทึกเอกสาร 1 ฉบับลงชีต
 * @param {Object} d       ข้อมูลที่ดึงได้
 * @param {Object} v       ผลการตรวจสอบ
 * @param {Object} meta    { source, fileName }
 * @return {Object} { docId, written, sheet }
 */
function storeDocument(d, v, meta) {
  var cfg = getConfig();
  var ss = getSpreadsheet_();
  ensureAllSheets_(ss);

  var docId = makeDocId_(d);
  meta = meta || {};

  // กันซ้ำ
  if (cfg.DEDUPE === 'true' && existingDocIds_(ss)[docId]) {
    writeLog_(ss, meta.source, meta.fileName, docId, 'ข้าม (ซ้ำ)', 'เอกสารนี้ถูกบันทึกแล้ว');
    return { docId: docId, written: false, duplicate: true, sheet: null };
  }

  var isSale = (d.doc_type === 'ภาษีขาย');
  var targetName = isSale ? SHEET_SALES : SHEET_PURCHASE;
  var sh = ensureSheet_(ss, targetName, DOC_HEADERS);

  sh.appendRow([
    docId, d.doc_date, d.doc_type, d.doc_number,
    d.seller_name, d.seller_tax_id, d.buyer_name, d.buyer_tax_id,
    d.sub_total, d.vat_rate, d.vat_amount, d.grand_total,
    d.currency, v.status, v.summary, meta.source || '', meta.fileName || '',
    Utilities.formatDate(nowBkk_(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
  ]);
  // ระบายสีสถานะ
  var lvlColor = { ok: '#d9ead3', warn: '#fff2cc', error: '#f4cccc' };
  sh.getRange(sh.getLastRow(), 14).setBackground(lvlColor[v.level] || '#ffffff');

  // รายการสินค้า (แยกหลายรายการ)
  if (d.line_items && d.line_items.length) {
    var itemSheet = ensureSheet_(ss, SHEET_ITEMS, ITEM_HEADERS);
    var rows = d.line_items.map(function (it, i) {
      return [docId, i + 1, it.description, it.quantity, it.unit_price, it.amount];
    });
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, rows.length, ITEM_HEADERS.length).setValues(rows);
  }

  writeLog_(ss, meta.source, meta.fileName, docId, 'บันทึกสำเร็จ (' + v.status + ')', v.summary);
  return { docId: docId, written: true, sheet: targetName };
}

function writeLog_(ss, source, fileName, docId, result, message) {
  try {
    var sh = ensureSheet_(ss, SHEET_LOG, LOG_HEADERS);
    sh.appendRow([
      Utilities.formatDate(nowBkk_(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
      source || '', fileName || '', docId || '', result || '', message || ''
    ]);
  } catch (e) { /* ไม่ให้ log ล้มทำงานหลักพัง */ }
}

/** URL ของสเปรดชีตปลายทาง (สำหรับเปิดจากหน้าเว็บ) */
function getSpreadsheetUrl() {
  var cfg = getConfig();
  if (!cfg.SPREADSHEET_ID) return '';
  try { return SpreadsheetApp.openById(cfg.SPREADSHEET_ID).getUrl(); }
  catch (e) { return ''; }
}

function nowBkk_() { return new Date(); }
