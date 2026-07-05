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
├── Api.gs             # JSON API (doPost/doGet) สำหรับหน้าเว็บภายนอก
├── Code.gs            # Web App entry + orchestration + trigger
├── Index.html         # หน้าเว็บหลัก (ในตัว Apps Script)
├── Stylesheet.html    # CSS
└── JavaScript.html    # ฝั่ง client (ในตัว)

web/
└── index.html         # หน้าเว็บภายนอก (standalone) — host ที่ไหนก็ได้
```

> มี **2 หน้าเว็บ** ให้เลือกใช้:
> 1. **หน้าในตัว Apps Script** (`src/Index.html`) — เปิดจาก Web App URL โดยตรง ล็อกอิน Gmail อัตโนมัติ
> 2. **หน้าเว็บภายนอก** (`web/index.html`) — ไฟล์เดียวจบ เอาไป host ที่ Netlify / Vercel / GitHub Pages แล้วเชื่อมต่อผ่าน API

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

## 🌐 เชื่อมต่อกับหน้าเว็บภายนอก (Standalone Frontend)

ใช้ไฟล์ `web/index.html` เป็นหน้าเว็บแยก ที่คุยกับ Apps Script ผ่าน **JSON API**

### 1) เตรียม API ฝั่ง Apps Script
สร้าง **Deployment ที่ 2 แยกต่างหาก** สำหรับ API (ไม่ยุ่งกับ Deployment แรกที่เป็น *Only myself*):
1. **Deploy → New deployment → Web app**
   - **Execute as:** *Me*
   - **Who has access:** **`Anyone`** ← จำเป็น เพราะ frontend ภายนอกเรียกโดยไม่มี cookie ของ Google
   > ความปลอดภัยของ Deployment นี้อาศัย **API Token** (+ *Login ด้วย Gmail* ถ้าตั้งค่า) ไม่ใช่สิทธิ์ Google
2. เปิด **หน้าในตัว** (Deployment แรก) → แท็บ **⚙️ ตั้งค่า → 🔌 การเชื่อมต่อ (API)**
3. กด **สร้าง Token** → คัดลอก **API Token**; และคัดลอก **URL ของ Deployment ที่ 2** (ตัวที่เป็น Anyone)
4. (ไม่บังคับ) กรอก **อีเมลที่อนุญาต** + **Google OAuth Client ID** เพื่อบังคับ Login ด้วย Gmail

> 💡 ใช้ 2 deployment เพื่อให้หน้าในตัว (owner) ยังปลอดภัยแบบ *Only myself* ส่วน API เปิด *Anyone*
> แต่ถูกล็อกด้วย Token — โค้ดชุดเดียวกันรองรับทั้งสองแบบอยู่แล้ว

### 2) รันหน้าเว็บภายนอก
- เปิด `web/index.html` ตรงๆ ในเบราว์เซอร์ หรือ deploy ขึ้น host:
  - **Netlify / Vercel** — ลากโฟลเดอร์ `web/` วาง หรือชี้ publish directory = `web`
  - **GitHub Pages** — ตั้ง Pages ให้เสิร์ฟโฟลเดอร์ `web/`
- เปิดหน้าเว็บ → กรอก **Web App URL** + **API Token** → กด **เชื่อมต่อ**
- ใช้งานได้เหมือนหน้าในตัวทุกอย่าง (อัปโหลด, ตั้งค่า, อัตโนมัติ) ค่าเชื่อมต่อถูกจำใน `localStorage`

### 3) (ไม่บังคับ) เปิด Login ด้วย Gmail บนหน้าเว็บภายนอก
1. สร้าง **OAuth Client ID** (ชนิด *Web application*) ที่ https://console.cloud.google.com/apis/credentials
2. เพิ่มโดเมนของหน้าเว็บใน *Authorized JavaScript origins*
3. นำ Client ID มากรอกในแท็บการเชื่อมต่อ (API) + ใส่อีเมลที่อนุญาต
4. หน้าเว็บภายนอกจะมีปุ่ม **Sign in with Google** — ต้อง Login ก่อนจึงบันทึก/ประมวลผลได้

### รายละเอียด API (สำหรับต่อยอดเอง)
`POST {WebAppURL}` — body เป็น JSON (ส่งด้วย `Content-Type: text/plain` เพื่อเลี่ยง CORS preflight)
```json
{ "action": "processImages", "apiToken": "...", "idToken": "(optional)",
  "files": [{ "name":"bill.jpg", "mimeType":"image/jpeg", "dataB64":"..." }] }
```
| action | ทำอะไร | ต้อง Login Gmail* |
|---|---|---|
| `ping` / `bootstrap` | ทดสอบ / ดึงค่าตั้งต้น | ไม่ |
| `autoStatus` / `sheetUrl` / `testSource` | สถานะ / ลิงก์ชีต / ทดสอบแหล่ง | ไม่ |
| `saveConfig` | บันทึกการตั้งค่า | ใช่ |
| `processImages` | อ่านไฟล์ที่อัปโหลด | ใช่ |
| `processSources` | ดึงจาก Drive/Gmail มาอ่าน | ใช่ |

*เฉพาะเมื่อกรอก `ALLOWED_EMAILS` ไว้ — ถ้าเว้นว่างจะใช้ API Token อย่างเดียว

ทดสอบเร็วๆ ผ่าน GET: `{WebAppURL}?action=ping&token=YOUR_TOKEN`

## 🔒 ความปลอดภัย
- Gemini API Key และ API Token เก็บใน **Script Properties** ไม่ commit ลง git และไม่ส่งกลับผ่าน API
- หน้าในตัว: `access: MYSELF` — เข้าถึงได้เฉพาะเจ้าของ
- หน้าเว็บภายนอก: ต้อง deploy เป็น `Anyone` แต่ป้องกันด้วย **API Token** (บังคับทุก request) และ
  บังคับ **Login ด้วย Gmail** ได้เพิ่มโดยตั้ง `ALLOWED_EMAILS` — เก็บ Token เป็นความลับ
  เพราะใครมี URL + Token ก็เรียกได้ (สร้าง Token ใหม่ได้ตลอดเพื่อเพิกถอนของเดิม)
- ทุก request ประมวลผลในสิทธิ์บัญชี Google ของเจ้าของ Web App (สเปรดชีต/ไดรฟ์/เมลของเจ้าของ)

## ⚠️ ข้อจำกัด
- Gemini อ่านได้แม่นมากกับเอกสารชัด แต่ควร **ตรวจแถวสถานะ "ควรตรวจ/ผิดพลาด"** เสมอ
- Apps Script UrlFetch/ประมวลผลมีโควตารายวัน — ไฟล์จำนวนมากควรตั้งรอบอัตโนมัติแทนการยิงทีเดียว
- ชื่อรุ่นโมเดลต้องเป็นรุ่นที่ Gemini API รองรับ ณ ขณะใช้งาน
