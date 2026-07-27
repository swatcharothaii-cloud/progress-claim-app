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
