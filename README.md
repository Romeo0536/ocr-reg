# 🧾 ระบบอ่านบิล & ภาษี — OCR → Google Sheet (Gemini)

ระบบเว็บสำหรับ **อ่านบิล / ใบเสร็จ / ภาษีซื้อ / ภาษีขาย** อัตโนมัติด้วย **Gemini**
แล้ว **ตรวจสอบ + บันทึกลง Google Sheet** — ล็อกอินด้วย Gmail, เลือกได้ว่าจะ
**ดึงข้อมูลจากไหน** และ **เก็บที่ไหน**, ทำงานอัตโนมัติตามรอบเวลาได้, และ
**แยกรายการสินค้าหลายรายการต่อเอกสาร** ได้

สร้างบน **Google Apps Script** เพื่อให้ได้ Gmail login, สิทธิ์ Google Sheets/
Drive/Gmail แบบเนทีฟ, และตั้งเวลาทำงานอัตโนมัติได้ฟรี

---

## ✨ ความสามารถ

| ความต้องการ | ทำได้อย่างไร |
|---|---|
| อ่านบิล/ใบเสร็จ/ภาษีซื้อ/ภาษีขาย | Gemini vision อ่านรูป/PDF → JSON แบบมีโครงสร้าง |
| ตรวจสอบ | ตรวจภาษี 7%, ยอดรวม, ผลรวมรายการ, เลขผู้เสียภาษี 13 หลัก |
| บันทึกลง Google Sheet | แยกชีต **ภาษีซื้อ / ภาษีขาย / รายการสินค้า / Log** |
| Login ด้วย Gmail | Web App รันในสิทธิ์ผู้ใช้ (`executeAs: USER_DEPLOYING`, `access: MYSELF`) |
| เปิด/ปิด ดึงจากไหน | โหมด **อัปโหลดเอง / Google Drive / Gmail** |
| เปิด/ปิด เก็บที่ไหน | ระบุ Spreadsheet ID เอง หรือให้ระบบสร้างชีตใหม่ |
| ทำงานอัตโนมัติ | Time-driven trigger (ทุก 1–60 นาที) |
| แยกหลายรายการ | ทุกบรรทัดสินค้าเก็บลงชีต `รายการสินค้า` ผูกด้วย `DocID` |

---

## 📁 โครงสร้างไฟล์

```
src/
├── appsscript.json    # manifest + OAuth scopes + web app config
├── Config.gs          # อ่าน/บันทึกการตั้งค่า (Script Properties)
├── Gemini.gs          # เรียก Gemini อ่านเอกสาร → JSON (responseSchema)
├── Validate.gs        # ตรวจสอบความถูกต้องของข้อมูล
├── SheetStore.gs      # สร้างชีต + เขียนข้อมูล + กันซ้ำ
├── Sources.gs         # ดึงไฟล์จาก Drive / Gmail
├── Code.gs            # Web App entry + orchestration + trigger
├── Index.html         # หน้าเว็บหลัก
├── Stylesheet.html    # CSS
└── JavaScript.html    # ฝั่ง client
```

---

## 🚀 วิธีติดตั้ง (แนะนำ: ใช้ clasp)

### เตรียมของ
1. บัญชี Google (Gmail)
2. **Gemini API Key** — ขอฟรีที่ https://aistudio.google.com/apikey
3. ติดตั้ง [Node.js](https://nodejs.org) แล้วติดตั้ง clasp:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

### สร้างและอัปโหลดโปรเจกต์
```bash
cd src
clasp create --type webapp --title "OCR Tax Records"
clasp push
```
> ไฟล์ `.clasp.json` จะถูกสร้างให้ (ถูก ignore ไว้ใน git แล้ว)

### หรือ ติดตั้งแบบ Manual (ไม่ต้องใช้ clasp)
1. เปิด https://script.google.com → **New project**
2. คัดลอกเนื้อหาไฟล์ `.gs` แต่ละไฟล์ไปวางเป็นไฟล์ Script
3. คัดลอกไฟล์ `.html` ไปวางเป็นไฟล์ HTML (ชื่อ `Index`, `Stylesheet`, `JavaScript`)
4. เมนู **Project Settings** → เปิด *"Show appsscript.json manifest file"* แล้ววางเนื้อหา `appsscript.json`

---

## ▶️ Deploy เป็น Web App

1. ในตัวแก้ไข Apps Script กด **Deploy → New deployment**
2. เลือกชนิด **Web app**
3. ตั้งค่า:
   - **Execute as:** *Me* (ตัวคุณเอง)
   - **Who has access:** *Only myself* (หรือ *Anyone within your organization*)
4. กด **Deploy** แล้วกด **Authorize access** อนุญาตสิทธิ์ทั้งหมด
5. เปิด **Web app URL** ที่ได้ → จะเห็นหน้าระบบ (ล็อกอินด้วย Gmail อัตโนมัติ)

---

## 🛠️ ตั้งค่าครั้งแรก (ในหน้าเว็บ)

### แท็บ ⚙️ ตั้งค่า
- **Gemini API Key** — วาง key (เก็บใน Script Properties ไม่โผล่ในโค้ด)
- **รุ่นโมเดล** — ค่าเริ่มต้น `gemini-2.0-flash` (เปลี่ยนเป็นรุ่นที่บัญชีคุณเข้าถึงได้ เช่น `gemini-3.1-flash`)
- **แหล่งข้อมูล** — เลือก:
  - **อัปโหลดเอง** — ลากไฟล์เข้าหน้าเว็บ
  - **Google Drive** — ใส่ *Folder ID* ต้นทาง (คัดจาก URL โฟลเดอร์) + โฟลเดอร์เก็บไฟล์ที่ทำเสร็จ (ไม่บังคับ)
  - **Gmail** — ใส่เงื่อนไขค้นหา เช่น `has:attachment invoice OR ใบเสร็จ newer_than:30d`
- **ปลายทาง** — ใส่ *Spreadsheet ID* หรือเว้นว่างให้ระบบสร้างชีตใหม่ + เปิด/ปิด กันซ้ำ
- กด **บันทึกการตั้งค่า** และ **ทดสอบการเชื่อมต่อ**

### แท็บ 🤖 อัตโนมัติ
- เปิดสวิตช์ **ทำงานอัตโนมัติ** + เลือกรอบเวลา → กด **บันทึก & ตั้งเวลา**
- ระบบจะดึงเอกสารจาก Drive/Gmail มาอ่านและบันทึกเองตามรอบ (ต้องเลือกแหล่งเป็น Drive หรือ Gmail)

---

## 📊 ผลลัพธ์ใน Google Sheet

| ชีต | เก็บอะไร |
|---|---|
| **ภาษีซื้อ** | เอกสารฝั่งซื้อ (1 แถว = 1 เอกสาร) |
| **ภาษีขาย** | เอกสารฝั่งขาย (1 แถว = 1 เอกสาร) |
| **รายการสินค้า** | ทุกบรรทัดสินค้า ผูกกับเอกสารด้วย `DocID` |
| **Log** | ประวัติการทำงาน/ข้อผิดพลาด |

สถานะตรวจสอบในแต่ละแถว: 🟩 **ผ่าน** / 🟨 **ควรตรวจ** / 🟥 **ผิดพลาด**

---

## 🔒 ความปลอดภัย
- Gemini API Key เก็บใน **Script Properties** ของโปรเจกต์ ไม่ commit ลง git และไม่ส่งกลับหน้าเว็บ
- Web App ตั้ง `access: MYSELF` — เข้าถึงได้เฉพาะเจ้าของบัญชี (ปรับได้ตอน deploy)
- ทุก request ทำงานในสิทธิ์บัญชี Google ของผู้ใช้เอง

## ⚠️ ข้อจำกัด
- Gemini อ่านได้แม่นมากกับเอกสารชัด แต่ควร **ตรวจแถวสถานะ "ควรตรวจ/ผิดพลาด"** เสมอ
- Apps Script UrlFetch/ประมวลผลมีโควตารายวัน — ไฟล์จำนวนมากควรตั้งรอบอัตโนมัติแทนการยิงทีเดียว
- ชื่อรุ่นโมเดลต้องเป็นรุ่นที่ Gemini API รองรับ ณ ขณะใช้งาน
