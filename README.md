# Progress Claim App / ระบบเบิกงวดงาน

ระบบสำหรับแอดมิน Trio-C บันทึกรายการ "เบิกงวดงาน" (progress claim) ของแต่ละโปรเจกต์ พร้อมรูปภาพหน้างาน
ประกอบการเบิก และหน้าตรวจสอบสถานะแบบดูอย่างเดียวสำหรับเจ้าของบ้าน/ผู้เกี่ยวข้อง

ใช้ Firebase โปรเจกต์เดียวกับ `repair-app` (Firestore ตัวเดียวกัน) — แชร์ข้อมูล "โปรเจกต์" (projects)
และ "รายชื่อแอดมิน" ร่วมกัน

## หน้าเว็บ

- `index.html` — เปลี่ยนเส้นทางไปหน้า `track.html` อัตโนมัติ
- `track.html` — หน้าตรวจสอบสถานะ (สาธารณะ, ดูอย่างเดียว) เลือกโปรเจกต์แล้วดูรายการเบิกงวดงานทั้งหมด
- `admin.html` — หน้าแอดมิน (เพิ่ม/แก้ไข/อนุมัติ/ปฏิเสธรายการเบิกงวดงาน, ส่งออก Excel/PDF)

## ⚠️ สำคัญ: ต้องอัปเดต Firestore Security Rules ก่อนใช้งานจริง

ไฟล์ `firestore.rules` ในโปรเจกต์นี้เป็น "ฉบับรวม" ที่ครอบคลุมทั้ง repair-app และ progress-claim-app
(เพราะใช้ Firestore ฐานข้อมูลเดียวกัน) — **ต้องนำไปวางแทนที่ rules เดิมใน Firebase Console เพื่อให้
collection `progressClaims` ใช้งานได้** มิฉะนั้นแอปนี้จะบันทึก/อ่านข้อมูลไม่ได้ (permission denied)

ขั้นตอน:
1. เปิด [Firebase Console](https://console.firebase.google.com/) → เลือกโปรเจกต์ `repair-report-app-354ef`
2. ไปที่ **Firestore Database → Rules**
3. คัดลอกเนื้อหาทั้งหมดจากไฟล์ `firestore.rules` ในโฟลเดอร์นี้ไปวางแทนที่ของเดิม
4. กด **Publish**

## Deploy บน Netlify (เหมือน repair-app)

1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub repo `progress-claim-app`
2. Netlify → Add new site → Import an existing project → Deploy with GitHub → เลือก repo นี้
3. ไม่ต้องตั้งค่า Build command / Publish directory เป็นพิเศษ (เป็นเว็บ static ธรรมดา)
