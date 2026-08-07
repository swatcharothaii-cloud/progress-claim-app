// contractor-jobs.js — เชื่อมต่อกับ collection "contractorJobs" ตัวเดียวกับ repair-app โดยตรง
// (Firestore ฐานข้อมูลเดียวกัน) เพื่อโชว์ "งาน PO / ส่งมอบงาน / ตรวจรับงาน" ในระบบเบิกงวดงาน
// โดยไม่ต้องกรอกข้อมูลซ้ำ — ความเคลื่อนไหวใดๆ ที่เกิดขึ้นฝั่ง repair-app (กดรับ/ปฏิเสธงาน, เปิด PO,
// ผู้รับเหมาส่งมอบงาน, ตรวจรับงาน) จะขึ้นที่นี่แบบเรียลไทม์ทันที เพราะอ่านจากเอกสารชุดเดียวกัน
//
// ขอบเขตของไฟล์นี้ (ตามที่ตกลงกับผู้ใช้งาน): ดูรายการทั้งหมด + กำหนด/แก้ไขเลขที่ PO + ตรวจรับงาน
// (ผ่าน/ไม่ผ่าน) ได้จากหน้านี้เลย ส่วนการ "สร้างงานส่งให้ผู้รับเหมา" และ "ตอบรับ/เสนอราคาของผู้รับเหมา"
// ยังคงทำที่ repair-app เท่านั้น (ยังไม่มีความจำเป็นต้องย้ายมาที่นี่)
import { db, collection, doc, addDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "./firebase-init.js";
import { CONTRACTOR_JOBS_COLLECTION, LEGACY_PO_COLLECTION } from "./firebase-init.js";
import { CONTRACTOR_JOB_STATUS, CONTRACTOR_JOB_TYPE, PO_FILE_MAX_BYTES } from "./config.js";
import { createFreshApproval, approveApprovalStep, rejectApprovalStep, APPROVAL_STATUS } from "./approval.js";

// สถานะระบบต่อรองราคา (negotiation.status บนเอกสาร contractorJobs) — ใช้แสดงผลอย่างเดียวในแอปนี้
// (การกด "ยอมรับ/ต่อรอง" ทำได้จากฝั่ง repair-app เท่านั้น ตามขอบเขตของไฟล์นี้ที่ตกลงกันไว้ด้านบน)
export const NEGOTIATION_STATUS = {
  AWAITING_ADMIN: "awaiting_admin",
  AWAITING_CONTRACTOR: "awaiting_contractor",
  AGREED: "agreed",
};

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

// ============================================================
//  แนบไฟล์ PDF ใบสั่งซื้อ (PO) + เชื่อมข้อมูลเข้าคลัง "Purchase Order Archive (PEAK Import)" ด้านล่าง
//  (เหมือนกับฝั่ง repair-app ทุกประการ — ต้องแก้พร้อมกันทั้ง 2 ที่ถ้ามีการเปลี่ยนแปลง)
// ============================================================
function readPoFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์ PDF ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// แอดมินออก/แก้ไขเลขที่ PO พร้อมแนบ (หรือลบ) ไฟล์ PDF ใบสั่งซื้อได้ในคราวเดียว
export async function setPoNumberWithFile(id, poNumber, file, removeFile) {
  if (file) {
    if (file.type !== "application/pdf") {
      throw new Error("แนบได้เฉพาะไฟล์ PDF เท่านั้น / Only PDF files can be attached");
    }
    if (file.size > PO_FILE_MAX_BYTES) {
      throw new Error(
        `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(PO_FILE_MAX_BYTES / 1024)}KB เพราะเก็บตรงใน Firestore ไม่ใช้ Storage) / File too large (max ${Math.round(PO_FILE_MAX_BYTES / 1024)}KB)`
      );
    }
  }
  const patch = { poNumber: (poNumber || "").trim() };
  if (file) {
    patch.poFileName = file.name;
    patch.poFileData = await readPoFileAsDataUrl(file);
    patch.poFileSize = file.size;
    patch.poFileUploadedAt = serverTimestamp();
  } else if (removeFile) {
    patch.poFileName = "";
    patch.poFileData = "";
    patch.poFileSize = null;
  }
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });

  const snap = await getDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id));
  const job = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (job) await syncContractorJobPoToArchive(job);
}

async function syncContractorJobPoToArchive(job) {
  if (!job.poFileData) {
    if (job.linkedLegacyPoId) {
      try {
        await deleteDoc(doc(db, LEGACY_PO_COLLECTION, job.linkedLegacyPoId));
      } catch (e) {
        console.warn("ลบรายการที่เคยเชื่อมไว้ในคลัง PO เก่าไม่สำเร็จ (ข้ามไป):", e);
      }
      await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, job.id), { linkedLegacyPoId: "" });
    }
    return;
  }
  const amount = job.type === CONTRACTOR_JOB_TYPE.QUOTE ? job.quotePrice : job.repairPrice;
  const archiveFields = {
    poNumber: job.poNumber || "",
    project: job.project || "",
    projectId: job.projectId || "",
    contractorNickname: job.contractorName || "",
    totalAmount: amount ?? null,
    notes: `Auto-linked from repair-app job ${job.jobId || job.id}${job.ticketId ? ` (ticket #${job.ticketId})` : ""} / เชื่อมข้อมูลอัตโนมัติจากงาน ${job.jobId || job.id} ใน repair-app`,
    importBatch: "repair_app_link",
    contractorJobId: job.id,
    poFileName: job.poFileName || "",
    poFileData: job.poFileData || "",
    poFileSize: job.poFileSize || null,
  };
  if (job.linkedLegacyPoId) {
    await updateDoc(doc(db, LEGACY_PO_COLLECTION, job.linkedLegacyPoId), archiveFields);
  } else {
    const ref = await addDoc(collection(db, LEGACY_PO_COLLECTION), {
      ...archiveFields,
      vendorName: "",
      issueDate: todayIsoDate(),
      status: "เชื่อมจาก Repair App / Linked from Repair App",
      lineItems: [],
      vatAmount: null,
      whtAmount: null,
      netPayable: null,
      rawProjectText: "",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, job.id), { linkedLegacyPoId: ref.id });
  }
}

// ---- ตรวจรับงานที่ผู้รับเหมาส่งมอบมา — ระบบอนุมัติ 4 ขั้นตอน (ทีมงาน/PM/จัดซื้อ/ผู้บริหาร) ----
// ใครก็ได้ที่ล็อกอินอยู่ (actorName = currentAdmin.name) กดแทนขั้นตอนไหนก็ได้ ไม่มีการบังคับสิทธิ์ตามตำแหน่งจริง
// อนุมัติขั้นตอนปัจจุบัน — ถ้าเป็นขั้นตอนสุดท้าย (ขั้นที่ 4) จะถือว่า "ตรวจรับผ่านทั้งหมด" ปิดงานเสร็จสิ้นทันที
export async function approveJobDeliveryStep(id, actorName, note) {
  const snap = await getDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id));
  const job = snap.exists() ? snap.data() : null;
  const approval = approveApprovalStep(job?.approval, actorName, note, serverTimestamp);
  const patch = { approval, updatedAt: serverTimestamp() };
  if (approval.status === APPROVAL_STATUS.APPROVED) {
    const round = (job?.inspectionRound || 0) + 1;
    Object.assign(patch, {
      inspectionRound: round,
      lastInspectionResult: "passed",
      lastInspectionBy: (actorName || "").trim(),
      lastInspectionNote: (note || "").trim(),
      lastInspectionAt: serverTimestamp(),
      deliveryAccepted: true,
      deliveryAcceptedBy: (actorName || "").trim(),
      deliveryAcceptedAt: serverTimestamp(),
      status: CONTRACTOR_JOB_STATUS.DONE,
    });
  }
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), patch);
  return approval;
}

// ปฏิเสธขั้นตอนปัจจุบัน — จบกระบวนการทันที (ตรวจไม่ผ่าน) ผู้รับเหมาต้องส่งมอบงานใหม่ (submitDelivery จะเริ่มกระบวนการใหม่)
export async function rejectJobDeliveryStep(id, actorName, note) {
  const snap = await getDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id));
  const job = snap.exists() ? snap.data() : null;
  const approval = rejectApprovalStep(job?.approval, actorName, note, serverTimestamp);
  const round = (job?.inspectionRound || 0) + 1;
  await updateDoc(doc(db, CONTRACTOR_JOBS_COLLECTION, id), {
    approval,
    inspectionRound: round,
    lastInspectionResult: "failed",
    lastInspectionBy: (actorName || "").trim(),
    lastInspectionNote: (note || "").trim(),
    lastInspectionAt: serverTimestamp(),
    // รีเซ็ตให้ผู้รับเหมาส่งมอบงานใหม่อีกครั้ง (deliveryAccepted ยังเป็น false อยู่แล้ว ไม่ต้องแก้)
    deliverySubmitted: false,
    updatedAt: serverTimestamp(),
  });
  return approval;
}
