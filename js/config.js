// ============================================================
//  ตั้งค่าระบบ — Progress Claim App (ระบบเบิกงวดงาน)
//  ใช้ Firebase โปรเจกต์เดียวกับ repair-app (ตามที่ยืนยันไว้) — ข้อมูล "โปรเจกต์" (projects)
//  และ "รายชื่อแอดมิน" (ADMINS) ใช้ร่วมกันกับระบบแจ้งซ่อม
// ============================================================

// 1) Firebase project config — เหมือนกับ repair-app ทุกประการ (Firestore ตัวเดียวกัน)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAHql064G1oPcG4Ks23ytoaUimPBSIEVcM",
  authDomain: "repair-report-app-354ef.firebaseapp.com",
  projectId: "repair-report-app-354ef",
  storageBucket: "repair-report-app-354ef.firebasestorage.app",
  messagingSenderId: "848254244224",
  appId: "1:848254244224:web:b884c12ca6f20cfec59d65",
};

// 2) ข้อมูลบริษัท — เหมือนกับ repair-app
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

// 3) รายชื่อแอดมิน — ใช้ "เลือกชื่อ" เข้าใช้งานหน้าแอดมิน (รายชื่อเดียวกับ repair-app)
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

// 4) สถานะการเบิกงวดงาน
export const CLAIM_STATUS = {
  PENDING: "รอตรวจสอบ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธ",
};

export const CLAIM_STATUS_STYLE = {
  [CLAIM_STATUS.PENDING]: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  [CLAIM_STATUS.APPROVED]: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  [CLAIM_STATUS.REJECTED]: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

// 5) รูปภาพ — ค่าเดียวกับ repair-app (บีบอัดฝั่งเบราว์เซอร์ ไม่ใช้ Firebase Storage)
export const IMAGE_MAX_DIMENSION = 1000;
export const IMAGE_TARGET_BASE64_BYTES = 140 * 1024;
export const MAX_IMAGES = 5;
export const MAX_IMAGE_MB = 5;

// ไฟล์ PDF ใบสั่งซื้อ (PO) — ค่าเดียวกับ repair-app (ต้องแก้พร้อมกันทั้ง 2 ที่) เก็บเป็น base64 ตรงใน
// Firestore เช่นเดียวกับรูปภาพ (ไม่ใช้ Storage) จึงต้องจำกัดขนาดไฟล์ดิบไว้ล่วงหน้า
export const PO_FILE_MAX_BYTES = 650 * 1024; // ~650KB ไฟล์ดิบ (~890KB หลังแปลงเป็น base64)

// ============================================================
//  6) งานที่ส่งให้ผู้รับเหมา (Contractor Jobs) — ใช้ Firestore collection "contractorJobs"
//  ร่วมกับ repair-app ตัวเดียวกัน (ดูค่าคงที่ตัวเดียวกันนี้ใน repair-app/js/config.js — ต้องแก้ไข
//  พร้อมกันทั้ง 2 ที่ถ้ามีการเปลี่ยนค่า/สี/ป้ายชื่อ เพื่อไม่ให้ 2 ระบบแสดงผลไม่ตรงกัน)
//  หน้าแอดมินของ progress-claim-app ใช้ค่านี้แค่แสดงผล + กดกำหนดเลขที่ PO + ตรวจรับงาน (ผ่าน/ไม่ผ่าน)
//  ส่วนการ "สร้างงาน" และ "ตอบรับงานของผู้รับเหมา" ยังคงทำที่ repair-app เท่านั้น
// ============================================================
export const CONTRACTOR_JOB_TYPE = {
  FIX: "fix",
  QUOTE: "quote",
  DEFECT: "defect",
};

export const CONTRACTOR_JOB_TYPE_STYLE = {
  [CONTRACTOR_JOB_TYPE.FIX]: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd", icon: "🔧" },
  [CONTRACTOR_JOB_TYPE.QUOTE]: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7", icon: "💰" },
  [CONTRACTOR_JOB_TYPE.DEFECT]: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", icon: "⚠️" },
};

export const CONTRACTOR_JOB_STATUS = {
  WAITING: "รอผู้รับเหมาตอบรับ",
  CONFIRMED: "ผู้รับเหมารับงานแล้ว",
  REJECTED: "ผู้รับเหมาปฏิเสธ",
  DONE: "เสร็จสิ้น",
};

export const CONTRACTOR_JOB_STATUS_STYLE = {
  [CONTRACTOR_JOB_STATUS.WAITING]: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  [CONTRACTOR_JOB_STATUS.CONFIRMED]: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  [CONTRACTOR_JOB_STATUS.REJECTED]: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  [CONTRACTOR_JOB_STATUS.DONE]: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
};

// ============================================================
//  ลิงก์ไปยังระบบ repair-app (ปุ่ม "🔗" ในหน้าแอดมิน เชื่อมต่อ 2 ระบบเข้าด้วยกัน)
//  ⚠️ ตรวจสอบว่า URL นี้ตรงกับเว็บ repair-app ที่ deploy จริงของคุณ — ถ้าไม่ตรง แก้ไขที่นี่ที่เดียว
// ============================================================
export const OTHER_APP_URL = "https://swatcharothaii-cloud.github.io/repair-app/admin.html";
