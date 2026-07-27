// contractor-jobs.js — จัดการ "งานที่ส่งให้ผู้รับเหมา" ผ่าน Firestore (collection "contractorJobs")
import {
  db,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "./firebase-init.js";
import { CONTRACTOR_JOBS_COLLECTION } from "./firebase-init.js";
import { CONTRACTOR_JOB_STATUS } from "./config.js";

function generateJobId() {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CJ-${datePart}-${rand}`;
}

// สร้างงานใหม่ส่งให้ผู้รับเหมา (แอดมินเรียกจากหน้าแอดมิน)
export async function addContractorJob(data) {
  const jobId = generateJobId();
  const ref = await addDoc(collection(db, CONTRACTOR_JOBS_COLLECTION), {
    jobId,
    type: data.type, // "fix" | "quote" | "defect"
    ticketId: data.ticketId || "",
    projectId: data.projectId || "",
    project: data.project || "",
    siteName: data.siteName || "",
    description: data.description || "",
    images: data.images || [],
    contractorId: data.contractorId || "",
    contractorName: data.contractorName || "",
    // แอดมินเสนอวันเข้าหน้างานเบื้องต้นได้ (ผู้รับเหมายืนยัน/แก้ไขได้อีกครั้งผ่านลิงก์) — ใช้กับ fix/defect
    siteVisitDate: data.siteVisitDate || "",
    repairDays: null,
    // เฉพาะงานประเภท "defect" — เลขรอบที่ตรวจไม่ผ่าน (admin เป็นคนระบุตอนสร้างงาน)
    defectRound: data.defectRound != null && data.defectRound !== "" ? Number(data.defectRound) : null,
    contractorResponse: "",
    quoteDays: null,
    quotePrice: null,
    quoteNote: "",
    status: CONTRACTOR_JOB_STATUS.WAITING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: data.updatedBy || "",
    respondedAt: null,
  });
  return { id: ref.id, jobId };
}

export async function updateContractorJob(id, patch) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}

// ---------------- ลิงก์อนุมัติสำหรับผู้บริหาร (ไม่ต้องล็อกอิน) ----------------
// แอดมินกดสร้างลิงก์ทีละงาน (ปกติหลังผู้รับเหมาตอบรับ/เสนอราคาแล้ว) ให้ผู้บริหารกดอนุมัติ/ปฏิเสธเองผ่านลิงก์
export async function sendJobForApproval(id) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    approvalStatus: "pending",
    updatedAt: serverTimestamp(),
  });
}

export async function approveJobPublic(id, approverName) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    approvalStatus: "approved",
    approvedBy: (approverName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectJobPublic(id, approverName) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    approvalStatus: "rejected",
    approvedBy: (approverName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ---------------- เรียกจากหน้าผู้รับเหมา (contractor.html, ไม่ต้องล็อกอิน) ----------------

// งานประเภท "งานแก้ไข" / "งานแก้ไขที่ตรวจไม่ผ่าน" — ผู้รับเหมายืนยัน/ระบุวันเข้าหน้างาน + จำนวนวันซ่อม
// (ใช้ร่วมกันทั้ง fix และ defect เพราะฟอร์มเหมือนกัน — ต้องกดรับงานนี้ก่อนถึงจะกรอกได้)
export async function respondFixJob(id, { siteVisitDate, repairDays }) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    siteVisitDate,
    repairDays: Number(repairDays),
    contractorResponse: "confirmed",
    status: CONTRACTOR_JOB_STATUS.CONFIRMED,
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ปฏิเสธงาน — ใช้ร่วมกันได้ทั้ง 3 ประเภทงาน (fix / quote / defect)
export async function rejectJob(id) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    contractorResponse: "rejected",
    status: CONTRACTOR_JOB_STATUS.REJECTED,
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// งานประเภท "งานใหม่ที่ต้องเสนอราคา" — ผู้รับเหมารับงาน + เสนอจำนวนวัน/ราคา
export async function acceptQuoteJob(id, { quoteDays, quotePrice, quoteNote }) {
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    contractorResponse: "accepted",
    quoteDays: Number(quoteDays),
    quotePrice: Number(quotePrice),
    quoteNote: (quoteNote || "").trim(),
    status: CONTRACTOR_JOB_STATUS.CONFIRMED,
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// สำหรับหน้าแอดมิน — subscribe งานทั้งหมด (ใหม่สุดก่อน)
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

// สำหรับหน้าผู้รับเหมา (public, ไม่ต้องล็อกอิน) — subscribe งานเดียวตาม document id
export function watchContractorJob(id, cb, onErr) {
  return onSnapshot(
    doc(db, CONTRACTOR_JOBS_COLLECTION, id),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}

export async function getContractorJobOnce(id) {
  const snap = await getDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
