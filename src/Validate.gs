/**
 * Validate.gs
 * -------------------------------------------------------------------------
 * ตรวจสอบความถูกต้องของข้อมูลที่ดึงมา ก่อนบันทึกลงชีต
 *   - ภาษี ≈ อัตรา% ของมูลค่าก่อนภาษี
 *   - มูลค่า + ภาษี ≈ ยอดรวม
 *   - ผลรวมรายการ ≈ มูลค่าก่อนภาษี
 *   - ตรวจเลขประจำตัวผู้เสียภาษี 13 หลัก
 * คืนสถานะ: ผ่าน (ok) / ควรตรวจ (warn) / ผิดพลาด (error) พร้อมข้อความ
 * ------------------------------------------------------------------------- */

var TOLERANCE = 1.0;   // คลาดเคลื่อนได้ ±1 บาท (ปัดเศษ)

function validateDoc(d) {
  var issues = [];
  var level = 'ok';   // ok | warn | error

  function warn(m) { issues.push('⚠ ' + m); if (level === 'ok') level = 'warn'; }
  function err(m)  { issues.push('✖ ' + m); level = 'error'; }

  // ข้อมูลจำเป็น
  if (!d.seller_name) warn('ไม่พบชื่อผู้ขาย');
  if (!d.doc_date)    warn('ไม่พบวันที่เอกสาร');
  if (!d.grand_total) err('ไม่พบยอดรวมสุทธิ');

  // เลขผู้เสียภาษี
  if (d.seller_tax_id && d.seller_tax_id.length !== 13)
    warn('เลขผู้เสียภาษีผู้ขายไม่ครบ 13 หลัก (' + d.seller_tax_id.length + ')');
  if (d.buyer_tax_id && d.buyer_tax_id.length !== 13)
    warn('เลขผู้เสียภาษีผู้ซื้อไม่ครบ 13 หลัก (' + d.buyer_tax_id.length + ')');

  // ภาษี ≈ อัตรา% ของมูลค่า
  if (d.sub_total && d.vat_rate) {
    var expectVat = d.sub_total * d.vat_rate / 100;
    if (d.vat_amount && Math.abs(expectVat - d.vat_amount) > Math.max(TOLERANCE, d.sub_total * 0.005))
      warn('ภาษีไม่ตรงกับ ' + d.vat_rate + '% ของมูลค่า (คำนวณได้ ' + round2_(expectVat) + ' แต่ในบิล ' + d.vat_amount + ')');
  }

  // มูลค่า + ภาษี ≈ ยอดรวม
  if (d.sub_total && d.grand_total) {
    var sum = d.sub_total + d.vat_amount;
    if (Math.abs(sum - d.grand_total) > Math.max(TOLERANCE, d.grand_total * 0.005))
      warn('มูลค่า + ภาษี (' + round2_(sum) + ') ไม่ตรงกับยอดรวม (' + d.grand_total + ')');
  }

  // ผลรวมรายการ ≈ มูลค่าก่อนภาษี
  if (d.line_items && d.line_items.length && d.sub_total) {
    var itemSum = d.line_items.reduce(function (s, it) { return s + it.amount; }, 0);
    if (Math.abs(itemSum - d.sub_total) > Math.max(TOLERANCE, d.sub_total * 0.01))
      warn('ผลรวมรายการ (' + round2_(itemSum) + ') ไม่ตรงกับมูลค่าก่อนภาษี (' + d.sub_total + ')');
  }

  // ความมั่นใจต่ำ
  if (d.confidence && d.confidence < 0.6)
    warn('โมเดลอ่านด้วยความมั่นใจต่ำ (' + Math.round(d.confidence * 100) + '%)');

  if (d.notes) issues.push('📝 ' + d.notes);

  var labelMap = { ok: 'ผ่าน', warn: 'ควรตรวจ', error: 'ผิดพลาด' };
  return {
    level: level,
    status: labelMap[level],
    messages: issues,
    summary: issues.length ? issues.join(' | ') : 'ผ่านการตรวจสอบ'
  };
}

function round2_(n) { return Math.round(n * 100) / 100; }
