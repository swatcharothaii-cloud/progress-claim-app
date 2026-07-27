// contractor-jobs.js — เชื่อมต่อกับ collection "contractorJobs" ตัวเดียวกับ repair-app โดยตรง
// (Firestore ฐานข้อมูลเดียวกัน) เพื่อโชว์ "งาน PO / ส่งมอบงาน / ตรวจรับงาน" ในระบบเบิกงวดงาน
// โดยไม่ต้องกรอกข้อมูลซ้ำ — ความเคลื่อนไหวใดๆ ที่เกิดขึ้นฝั่ง repair-app (กดรับ/ปฏิเสธงาน, เปิด PO,
// ผู้รับเหมาส่งมอบงาน, ตรวจรับงาน) จะขึ้นที่นี่แบบเรียลไทม์ทันที เพราะอ่านจากเอกสารชุดเดียวกัน
//
// ขอบเขตของไฟล์นี้ (ตามที่ตกลงกับผู้ใช้งาน): ดูรายการทั้งหมด + กำหนด/แก้ไขเลขที่ PO + ตรวจรับงาน
// (ผ่าน/ไม่ผ่าน) ได้จากหน้านี้เลย ส่วนการ "สร้างงานส่งให้ผู้รับเหมา" และ "ตอบรับ/เสนอราคาของผู้รับเหมา"
// ยังคงทำที่ repair-app เท่านั้น (ยังไม่มีความจำเป็นต้องย้ายมาที่นี่)
import { db, collection, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } from "./firebase-init.js";
import { CONTRACTOR_JOBS_COLLECTION } from "./firebase-init.js";
import { CONTRACTOR_JOB_STATUS } from "./config.js";

// subscribe งานผู้รับเหมาทั้งหมด (ใหม่สุดก่อน) — ใช้ค่าเดียวกันไม่ว่าจะเปิดจากแอปไหน
export function watchAllContractorJobs(cb, onErr) {
  const q = query(collection(db, CONTRACTOR_JOBS_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}

// กำหนด/แก้ไขเลขที่ PO ให้งานนี้ (เหมือนกับฝั่ง repair-app ทุกประการ)
export async function setPoNumber(id, poNumber) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    poNumber: (poNumber || "").trim(),
    updatedAt: serverTimestamp(),
  });
}

// ตรวจรับงานที่ผู้รับเหมาส่งมอบมา — ผ่าน (ปิดงานเสร็จสิ้น)
export async function passDeliveryInspection(id, { round, inspectorName, note }) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    inspectionRound: round,
    lastInspectionResult: "passed",
    lastInspectionBy: (inspectorName || "").trim(),
    lastInspectionNote: (note || "").trim(),
    lastInspectionAt: serverTimestamp(),
    deliveryAccepted: true,
    deliveryAcceptedBy: (inspectorName || "").trim(),
    deliveryAcceptedAt: serverTimestamp(),
    status: CONTRACTOR_JOB_STATUS.DONE,
    updatedAt: serverTimestamp(),
  });
}

// ตรวจรับงาน — ไม่ผ่าน (รีเซ็ตให้ผู้รับเหมาส่งมอบงานใหม่)
export async function failDeliveryInspection(id, { round, inspectorName, note }) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    inspectionRound: round,
    lastInspectionResult: "failed",
    lastInspectionBy: (inspectorName || "").trim(),
    lastInspectionNote: (note || "").trim(),
    lastInspectionAt: serverTimestamp(),
    deliverySubmitted: false,
    updatedAt: serverTimestamp(),
  });
}
