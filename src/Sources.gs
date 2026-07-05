/**
 * Sources.gs
 * -------------------------------------------------------------------------
 * ดึงไฟล์เอกสารจากแหล่งที่ตั้งค่าไว้ (เปิด/ปิด/เลือกได้)
 *   manual : อัปโหลดผ่านหน้าเว็บ (จัดการใน Code.gs)
 *   drive  : โฟลเดอร์ใน Google Drive
 *   gmail  : ไฟล์แนบในอีเมลตามเงื่อนไขค้นหา
 *
 * แต่ละไฟล์คืนเป็น { blob, fileName, source, onDone }
 *   onDone() = ฟังก์ชันที่เรียกเมื่อประมวลผลไฟล์นั้นเสร็จ (ย้ายไฟล์ / ติด label)
 * ------------------------------------------------------------------------- */

var SUPPORTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf'];

function isSupported_(mime) { return SUPPORTED_MIME.indexOf(mime) !== -1; }

/** ดึงรายการไฟล์ที่รอประมวลผลจากแหล่งปัจจุบัน */
function collectPendingFiles_() {
  var cfg = getConfig();
  if (cfg.SOURCE_MODE === 'drive') return collectFromDrive_(cfg);
  if (cfg.SOURCE_MODE === 'gmail') return collectFromGmail_(cfg);
  return []; // manual: ไม่มีไฟล์อัตโนมัติ
}

/* ----------------------------- Drive ----------------------------- */
function collectFromDrive_(cfg) {
  if (!cfg.DRIVE_SOURCE_FOLDER_ID) throw new Error('ยังไม่ได้ตั้งค่าโฟลเดอร์ต้นทางใน Drive');
  var folder = DriveApp.getFolderById(cfg.DRIVE_SOURCE_FOLDER_ID);
  var doneFolder = cfg.DRIVE_DONE_FOLDER_ID ? DriveApp.getFolderById(cfg.DRIVE_DONE_FOLDER_ID) : null;

  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (!isSupported_(f.getMimeType())) continue;
    (function (file) {
      out.push({
        blob: file.getBlob(),
        fileName: file.getName(),
        source: 'Drive',
        onDone: function () {
          if (doneFolder) {
            doneFolder.addFile(file);
            folder.removeFile(file);
          }
        }
      });
    })(f);
  }
  return out;
}

/* ----------------------------- Gmail ----------------------------- */
function collectFromGmail_(cfg) {
  var query = cfg.GMAIL_QUERY || 'has:attachment';
  var label = getOrCreateLabel_(cfg.GMAIL_PROCESSED_LABEL);
  // ไม่เอาอีเมลที่ประมวลผลแล้ว
  var fullQuery = query + ' -label:' + (cfg.GMAIL_PROCESSED_LABEL || 'OCR-Processed');
  var threads = GmailApp.search(fullQuery, 0, 20);

  var out = [];
  threads.forEach(function (thread) {
    var before = out.length;
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        if (!isSupported_(att.getContentType())) return;
        out.push({
          blob: att.copyBlob(),
          fileName: att.getName(),
          source: 'Gmail: ' + msg.getSubject(),
          onDone: null   // จะติด label ทีเดียวตอนจบ thread
        });
      });
    });
    // ผูกการติด label เข้ากับไฟล์สุดท้ายของ thread นี้ (เฉพาะเมื่อมีไฟล์ที่รองรับ)
    if (out.length > before) {
      (function (t, last) {
        last.onDone = function () { t.addLabel(label); };
      })(thread, out[out.length - 1]);
    }
  });
  return out;
}

function getOrCreateLabel_(name) {
  name = name || 'OCR-Processed';
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/** ทดสอบว่าแหล่งข้อมูลปัจจุบันเข้าถึงได้ (ใช้ปุ่ม "ทดสอบการเชื่อมต่อ") */
function testSource() {
  var cfg = getConfig();
  try {
    if (cfg.SOURCE_MODE === 'drive') {
      var folder = DriveApp.getFolderById(cfg.DRIVE_SOURCE_FOLDER_ID);
      var n = 0, it = folder.getFiles();
      while (it.hasNext() && n < 100) { if (isSupported_(it.next().getMimeType())) n++; }
      return { ok: true, message: 'พบไฟล์ที่รองรับ ' + n + ' ไฟล์ในโฟลเดอร์ "' + folder.getName() + '"' };
    }
    if (cfg.SOURCE_MODE === 'gmail') {
      var threads = GmailApp.search(cfg.GMAIL_QUERY, 0, 5);
      return { ok: true, message: 'พบอีเมลตรงเงื่อนไข (ตัวอย่าง) ' + threads.length + ' รายการ' };
    }
    return { ok: true, message: 'โหมดอัปโหลดเอง — พร้อมรับไฟล์จากหน้าเว็บ' };
  } catch (e) {
    return { ok: false, message: 'เชื่อมต่อไม่ได้: ' + e.message };
  }
}
