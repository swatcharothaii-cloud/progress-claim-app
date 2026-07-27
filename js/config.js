// ============================================================
//  ตั้งค่าระบบ — REPLACE ME
//  ดูวิธีขอค่าต่างๆ ได้ใน README.md
// ============================================================

// 1) Firebase project config (Firebase Console > Project settings > Your apps > Web app)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAHql064G1oPcG4Ks23ytoaUimPBSIEVcM",
  authDomain: "repair-report-app-354ef.firebaseapp.com",
  projectId: "repair-report-app-354ef",
  storageBucket: "repair-report-app-354ef.firebasestorage.app",
  messagingSenderId: "848254244224",
  appId: "1:848254244224:web:b884c12ca6f20cfec59d65",
};

// 2) แผนที่: ใช้ OpenStreetMap + Leaflet (ฟรี ไม่ต้องขอ API Key และไม่ต้องผูกบัตรเครดิต)
//    ดูรายละเอียดได้ที่ js/map-picker.js — ไม่ต้องตั้งค่าอะไรเพิ่มในไฟล์นี้

// 3) LINE LIFF ID (LINE Developers Console > สร้าง LIFF app)
//    ถ้าต้องการรันเป็นเว็บแอปทั่วไป (ไม่ผ่าน LINE) ให้เว้นว่างไว้เป็น ""
export const LIFF_ID = "2010637585-n7YV0iHr"; // "ระบบแจ้งซ่อมออนไลน์" — ใช้กับหน้าแจ้งซ่อม (index.html)

// 3.1) LIFF ID สำหรับหน้าแอดมิน (LIFF app คนละตัวกับข้างบน เพราะ Endpoint URL ต่างกัน)
//      ให้ทีมงานเปิดหน้าแอดมินผ่านแอป LINE ได้เหมือนกัน แต่ยังต้องล็อกอินด้วยอีเมล/รหัสผ่านตามปกติ
//      (LINE เป็นแค่ช่องทางเข้าถึง ไม่ได้แทนที่ระบบสิทธิ์แอดมิน) ถ้าไม่ต้องการ เว้นว่างไว้เป็น ""
export const LIFF_ID_ADMIN = "2010637585-1P4sBTLt"; // "ระบบแจ้งซ่อม admin"

// 4) ข้อมูลบริษัท — แสดงที่หัว/ท้ายหน้าเว็บ แก้ไขได้ตามต้องการ
//    เปลี่ยนโลโก้ได้โดยแทนที่ไฟล์ assets/logo.svg (หรือเปลี่ยน path ด้านล่างเป็นไฟล์อื่น เช่น .png)
export const COMPANY = {
  logo: "assets/logo.svg",
  nameTh: "บริษัท ทริโอ-ซี โซลูชั่น จำกัด - สาขา 1",
  nameEn: "TRIO-C SOLUTION CO., LTD. - BRANCH 1",
  taxId: "0205556022443",
  addresses: [
    { labelTh: "สำนักงานใหญ่", labelEn: "Head office", th: "104 หมู่ 5 ตำบลธาตุทอง อำเภอบ่อทอง จังหวัดชลบุรี 20270", en: "104 Moo 5 Tard Thong, Bo Thong, Chonburi 20270" },
    { labelTh: "สาขา 1", labelEn: "Branch 1", th: "89/108 หมู่ 1 ถนนบางนา-ตราด แขวงบางพลีใหญ่ เขตบางพลี สมุทรปราการ 10540", en: "89/108 Moo 1 Bangna-Trad Rd., Bang Phli Yai Subd, Bang Phli Dist, Samut Prakan 10540" },
  ],
};

// ============================================================
//  ค่าคงที่ของระบบ — แก้ไขได้ตามต้องการ
// ============================================================

// รายการประเภทงาน "เริ่มต้น" — ใช้หว่านเมล็ด (seed) เข้า Firestore (collection "categories") ครั้งแรก
// เท่านั้น หลังจากนั้นให้ไปเพิ่ม/แก้ไข/ปิดใช้งานประเภทงานที่หน้าแอดมินแทน (แก้ไฟล์นี้จะไม่มีผลอีกต่อไป
// หลังจากหว่านเมล็ดไปแล้วครั้งหนึ่ง) ดูรายละเอียดที่ js/categories.js
export const CATEGORIES_SEED = [
  { id: "plumbing", label: "งานประปา", icon: "🚰", color: "#0ea5e9", order: 1 },
  { id: "electric", label: "งานไฟฟ้า", icon: "💡", color: "#f59e0b", order: 2 },
  { id: "builtin", label: "งานบิ้วอิน", icon: "🪚", color: "#8b5cf6", order: 3 },
  { id: "aircon", label: "งานแอร์", icon: "❄️", color: "#06b6d4", order: 4 },
  { id: "sanitary", label: "งานสุขภัณฑ์", icon: "🚽", color: "#10b981", order: 5 },
  { id: "paint", label: "งานสี", icon: "🎨", color: "#f43f5e", order: 6 },
  { id: "glass", label: "งานกระจก", icon: "🪟", color: "#3b82f6", order: 7 },
  { id: "curtain", label: "งานม่าน", icon: "🧵", color: "#ec4899", order: 8 },
  { id: "ceiling", label: "งานฝ้า", icon: "🔲", color: "#14b8a6", order: 9 },
  { id: "wall", label: "งานผนัง", icon: "🧱", color: "#a16207", order: 10 },
  { id: "wallpaper", label: "งานวอลเปเปอร์", icon: "📜", color: "#7c3aed", order: 11 },
  { id: "general", label: "งานทั่วไป", icon: "🧰", color: "#84cc16", order: 12 },
  { id: "other", label: "อื่นๆ", icon: "🔧", color: "#6b7280", order: 99 },
];

// รายชื่อแอดมิน — ใช้ "เลือกชื่อ" เข้าใช้งานหน้าแอดมิน (ไม่ต้องล็อกอินด้วยรหัสผ่าน)
// เพิ่ม/ลบ/แก้ไขรายชื่อได้ที่นี่โดยตรง
export const ADMINS = [
  { id: "001", name: "K.Eddie" },
  { id: "002", name: "K.Peggy" },
  { id: "003", name: "Nok" },
  { id: "004", name: "Pupae" },
  { id: "005", name: "Green" },
  { id: "006", name: "Off" },
  { id: "007", name: "Nay" },
  { id: "008", name: "Mui" },
  { id: "009", name: "Treeya" },
  { id: "010", name: "Tua" },
  { id: "011", name: "Ja" },
];

export const DEPARTMENTS = [
  "ทีมประปา",
  "ทีมไฟฟ้า",
  "ทีมบิ้วอิน/ช่างไม้",
  "ทีมแอร์",
  "ทีมสุขภัณฑ์",
  "ฝ่ายจัดซื้อ",
  "ผู้รับเหมาภายนอก",
  "อื่นๆ",
];

export const STATUS = {
  PENDING: "รอแก้ไข",
  DONE: "เสร็จแล้ว",
  FORWARDED: "ส่งต่อให้แผนกอื่นทำต่อ",
};

export const STATUS_STYLE = {
  [STATUS.PENDING]: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  [STATUS.DONE]: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  [STATUS.FORWARDED]: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
};

export const MAX_IMAGES = 5;
export const MAX_IMAGE_MB = 8; // ขนาดไฟล์ต้นฉบับสูงสุดที่ยอมรับก่อนบีบอัด

// ============================================================
//  ระบบส่งงานให้ผู้รับเหมา (Contractor Jobs) — เฟส 1
// ============================================================
export const CONTRACTOR_JOB_TYPE = {
  FIX: "fix", // งานแก้ไข — รับ/ปฏิเสธงาน แล้วยืนยันวันเข้าหน้างาน + จำนวนวันซ่อม
  QUOTE: "quote", // งานใหม่ที่ต้องเสนอราคา — รับ/ปฏิเสธงาน แล้วเสนอวัน+ราคา
  DEFECT: "defect", // งานแก้ไขที่ตรวจไม่ผ่าน (Defect/re-work) — เหมือน "fix" แต่มีเลขรอบที่ตรวจไม่ผ่านกำกับไว้
};

// สี/ไอคอนประจำ "ประเภทงาน" — ใช้แยกให้เห็นชัดตาแวบเดียวว่างานไหนเป็นแบบไหน
export const CONTRACTOR_JOB_TYPE_STYLE = {
  [CONTRACTOR_JOB_TYPE.FIX]: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd", icon: "🔧" },
  [CONTRACTOR_JOB_TYPE.QUOTE]: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7", icon: "💰" },
  [CONTRACTOR_JOB_TYPE.DEFECT]: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", icon: "⚠️" },
};

export const CONTRACTOR_JOB_STATUS = {
  WAITING: "รอผู้รับเหมาตอบรับ",
  CONFIRMED: "ผู้รับเหมารับงานแล้ว", // fix/defect: ยืนยันวันเข้าหน้างานแล้ว / quote: กดรับงาน+เสนอราคาแล้ว
  REJECTED: "ผู้รับเหมาปฏิเสธ",
  DONE: "เสร็จสิ้น",
};

export const CONTRACTOR_JOB_STATUS_STYLE = {
  [CONTRACTOR_JOB_STATUS.WAITING]: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  [CONTRACTOR_JOB_STATUS.CONFIRMED]: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  [CONTRACTOR_JOB_STATUS.REJECTED]: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  [CONTRACTOR_JOB_STATUS.DONE]: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
};

// รูปภาพจะถูกบีบอัดฝั่งเบราว์เซอร์แล้วเก็บเป็น base64 ตรงใน Firestore
// (ไม่ใช้ Firebase Storage เพื่อเลี่ยงการต้องอัปเกรดเป็นแผน Blaze ที่ต้องผูกบัตรเครดิต)
// Firestore เอกสารหนึ่งชิ้นมีขนาดจำกัดไม่เกิน 1MB จึงต้องบีบอัดรูปให้เล็กพอ
export const IMAGE_MAX_DIMENSION = 1000; // px ด้านที่ยาวที่สุดหลังย่อ
export const IMAGE_TARGET_BASE64_BYTES = 140 * 1024; // เป้าหมายขนาดต่อรูปหลังแปลงเป็น base64
