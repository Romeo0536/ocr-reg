/**
 * Gemini.gs
 * -------------------------------------------------------------------------
 * เรียก Gemini เพื่ออ่านบิล/ใบเสร็จ/ใบกำกับภาษี แล้วคืนข้อมูลแบบมีโครงสร้าง (JSON)
 *
 * ใช้ responseSchema เพื่อบังคับให้โมเดลตอบเป็น JSON ตามรูปแบบที่กำหนด
 * รองรับไฟล์ภาพ (jpg/png/webp) และ PDF
 * ------------------------------------------------------------------------- */

var GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** โครงสร้าง JSON ที่ต้องการให้ Gemini ตอบกลับ */
function geminiResponseSchema_() {
  return {
    type: 'OBJECT',
    properties: {
      doc_type: {
        type: 'STRING',
        description: 'ประเภทเอกสาร',
        enum: ['ภาษีซื้อ', 'ภาษีขาย', 'ใบเสร็จ', 'บิล', 'อื่นๆ']
      },
      doc_number: { type: 'STRING', description: 'เลขที่เอกสาร/ใบกำกับภาษี' },
      doc_date: { type: 'STRING', description: 'วันที่บนเอกสาร รูปแบบ YYYY-MM-DD' },
      seller_name: { type: 'STRING', description: 'ชื่อผู้ขาย/ผู้ประกอบการ' },
      seller_tax_id: { type: 'STRING', description: 'เลขประจำตัวผู้เสียภาษีผู้ขาย 13 หลัก' },
      buyer_name: { type: 'STRING', description: 'ชื่อผู้ซื้อ' },
      buyer_tax_id: { type: 'STRING', description: 'เลขประจำตัวผู้เสียภาษีผู้ซื้อ 13 หลัก' },
      currency: { type: 'STRING', description: 'สกุลเงิน เช่น THB' },
      sub_total: { type: 'NUMBER', description: 'มูลค่าสินค้า/บริการก่อนภาษี' },
      vat_rate: { type: 'NUMBER', description: 'อัตราภาษีมูลค่าเพิ่ม เป็นเปอร์เซ็นต์ เช่น 7' },
      vat_amount: { type: 'NUMBER', description: 'จำนวนภาษีมูลค่าเพิ่ม' },
      grand_total: { type: 'NUMBER', description: 'ยอดรวมสุทธิ' },
      line_items: {
        type: 'ARRAY',
        description: 'รายการสินค้า/บริการแต่ละบรรทัด',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING', description: 'รายละเอียดสินค้า/บริการ' },
            quantity: { type: 'NUMBER', description: 'จำนวน' },
            unit_price: { type: 'NUMBER', description: 'ราคาต่อหน่วย' },
            amount: { type: 'NUMBER', description: 'จำนวนเงินรวมของบรรทัด' }
          },
          required: ['description', 'amount']
        }
      },
      confidence: { type: 'NUMBER', description: 'ความมั่นใจในการอ่าน 0-1' },
      notes: { type: 'STRING', description: 'ข้อสังเกต เช่น อ่านไม่ชัด/ข้อมูลขาด' }
    },
    required: ['doc_type', 'seller_name', 'grand_total', 'line_items']
  };
}

function geminiPrompt_() {
  return [
    'คุณเป็นผู้ช่วยบัญชีที่อ่านเอกสารภาษีของประเทศไทย',
    'อ่านรูป/ไฟล์เอกสารนี้ (อาจเป็นบิล ใบเสร็จ ใบกำกับภาษี ภาษีซื้อ หรือภาษีขาย)',
    'แล้วดึงข้อมูลออกมาให้ครบถ้วนตามโครงสร้าง JSON ที่กำหนด',
    '',
    'ข้อกำหนด:',
    '- ตัวเลขเงินให้เป็นตัวเลขล้วน ไม่มีเครื่องหมายคอมมา ไม่มีสัญลักษณ์สกุลเงิน',
    '- วันที่ให้แปลงเป็นรูปแบบ YYYY-MM-DD (ถ้าเป็น พ.ศ. ให้ลบ 543 เป็น ค.ศ.)',
    '- แยกรายการสินค้า/บริการทุกบรรทัดใส่ใน line_items',
    '- ถ้าไม่พบข้อมูลช่องใด ให้เว้นเป็นค่าว่างหรือ 0 อย่าเดา',
    '- doc_type: ถ้าเราเป็นผู้ซื้อ = "ภาษีซื้อ", ถ้าเราเป็นผู้ขาย = "ภาษีขาย", ',
    '  ถ้าไม่แน่ใจให้ใช้ "ใบเสร็จ" หรือ "บิล" ตามลักษณะเอกสาร',
    '- vat_rate ปกติคือ 7 สำหรับประเทศไทย',
    'ตอบกลับเป็น JSON เท่านั้น'
  ].join('\n');
}

/**
 * ส่งไฟล์ 1 ไฟล์ให้ Gemini อ่าน
 * @param {Blob} blob  ไฟล์ภาพหรือ PDF
 * @return {Object} ข้อมูลที่ดึงได้ (ตาม schema)
 */
function geminiExtract(blob) {
  var cfg = getConfig();
  if (!cfg.GEMINI_API_KEY) {
    throw new Error('ยังไม่ได้ตั้งค่า Gemini API Key — กรุณาไปที่หน้าตั้งค่า');
  }

  var mime = blob.getContentType() || 'application/octet-stream';
  var b64 = Utilities.base64Encode(blob.getBytes());

  var payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: geminiPrompt_() },
        { inline_data: { mime_type: mime, data: b64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema_()
    }
  };

  var url = GEMINI_ENDPOINT + encodeURIComponent(cfg.GEMINI_MODEL) +
            ':generateContent?key=' + encodeURIComponent(cfg.GEMINI_API_KEY);

  var res = fetchWithRetry_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini error ' + code + ': ' + text.slice(0, 500));
  }

  var data = JSON.parse(text);
  var cand = data.candidates && data.candidates[0];
  if (!cand || !cand.content || !cand.content.parts || !cand.content.parts[0]) {
    throw new Error('Gemini ไม่ส่งข้อมูลกลับ (อาจถูกบล็อกโดย safety filter)');
  }
  var jsonText = cand.content.parts.map(function (p) { return p.text || ''; }).join('');
  var parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('อ่านผลลัพธ์ JSON จาก Gemini ไม่ได้: ' + jsonText.slice(0, 300));
  }
  return normalizeExtract_(parsed);
}

/** ทำความสะอาด/เติมค่าเริ่มต้นให้ข้อมูลที่ดึงได้ */
function normalizeExtract_(d) {
  d = d || {};
  d.doc_type = d.doc_type || 'บิล';
  d.doc_number = d.doc_number || '';
  d.doc_date = d.doc_date || '';
  d.seller_name = d.seller_name || '';
  d.seller_tax_id = (d.seller_tax_id || '').toString().replace(/\D/g, '');
  d.buyer_name = d.buyer_name || '';
  d.buyer_tax_id = (d.buyer_tax_id || '').toString().replace(/\D/g, '');
  d.currency = d.currency || 'THB';
  d.sub_total = num_(d.sub_total);
  d.vat_rate = (d.vat_rate === 0 || d.vat_rate) ? num_(d.vat_rate) : num_(getConfig().DEFAULT_VAT_RATE);
  d.vat_amount = num_(d.vat_amount);
  d.grand_total = num_(d.grand_total);
  d.confidence = num_(d.confidence);
  d.notes = d.notes || '';
  d.line_items = (d.line_items || []).map(function (it) {
    return {
      description: (it && it.description) || '',
      quantity: num_(it && it.quantity),
      unit_price: num_(it && it.unit_price),
      amount: num_(it && it.amount)
    };
  });
  // เติม sub_total จากรายการ ถ้าเอกสารไม่ได้ระบุ
  if (!d.sub_total && d.line_items.length) {
    d.sub_total = d.line_items.reduce(function (s, it) { return s + it.amount; }, 0);
  }
  return d;
}

function num_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** UrlFetch พร้อม retry (เผื่อ network / rate limit) */
function fetchWithRetry_(url, options, maxTries) {
  maxTries = maxTries || 4;
  var wait = 2000;
  var lastErr;
  for (var i = 0; i < maxTries; i++) {
    try {
      var res = UrlFetchApp.fetch(url, options);
      var code = res.getResponseCode();
      if (code === 429 || code >= 500) {         // ควรลองใหม่
        lastErr = new Error('HTTP ' + code);
        Utilities.sleep(wait); wait *= 2; continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      Utilities.sleep(wait); wait *= 2;
    }
  }
  throw lastErr || new Error('fetch failed');
}
