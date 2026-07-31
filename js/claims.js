// claims.js — CRUD สำหรับ collection "progressClaims"
import {
  db,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  CLAIMS_COLLECTION,
} from "./firebase-init.js";
import { generateClaimId } from "./utils.js";
import { CLAIM_STATUS } from "./config.js";
import { createFreshApproval, approveApprovalStep, rejectApprovalStep, APPROVAL_STATUS } from "./approval.js";

// CLAIM_STATUS (เดิม) ยังเก็บไว้ให้หน้าจอ/รายงานเดิมใช้ต่อ (ตาราง, ตัวกรอง, track.html)
// แต่ตอนนี้ค่าของมันถูก "สังเคราะห์" มาจาก approval.status เสมอ ไม่ใช่ค่าที่แก้ไขเองได้อิสระอีกต่อไป
function statusFromApproval(approval) {
  if (approval?.status === APPROVAL_STATUS.APPROVED) return CLAIM_STATUS.APPROVED;
  if (approval?.status === APPROVAL_STATUS.REJECTED) return CLAIM_STATUS.REJECTED;
  return CLAIM_STATUS.PENDING;
}

// เพิ่มรายการเบิกงวดงานใหม่ — เริ่มกระบวนการอนุมัติ 4 ขั้นตอนใหม่เสมอ
export async function addClaim(data) {
  const claimId = generateClaimId();
  const approval = createFreshApproval();
  await addDoc(collection(db, CLAIMS_COLLECTION), {
    claimId,
    projectId: data.projectId || "",
    project: data.project || "",
    workItem: data.workItem || "",
    // อ้างอิงย้อนกลับไปยังงานผู้รับเหมา/ใบส่งมอบงานใน collection "contractorJobs" (ถ้าเลือกไว้ตอนสร้างรายการเบิกงวด)
    // เก็บเป็นค่าคงที่ ณ ตอนเลือก ไม่ได้ผูกแบบ live-lookup เพื่อให้ประวัติการเบิกยังถูกต้องแม้ PO จะถูกแก้ไขภายหลัง
    poNumber: data.poNumber || "",
    sourceJobId: data.sourceJobId || "",
    sourceJobNo: data.sourceJobNo || "",
    sourceType: data.sourceType || "", // "job" = อ้างอิงงานผู้รับเหมาในระบบ, "legacy" = อ้างอิง PO เก่าที่นำเข้าจาก PEAK
    poAmount: data.poAmount ?? null, // ยอดเงินเต็มตาม PO ณ ตอนที่เลือกอ้างอิง (ใช้คำนวณ % การเบิกในครั้งถัดไปที่แก้ไขรายการนี้)
    progressPercent: Number(data.progressPercent) || 0,
    claimAmount: Number(data.claimAmount) || 0,
    images: data.images || [],
    claimDate: data.claimDate,
    status: statusFromApproval(approval),
    approval,
    notes: data.notes || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: data.updatedBy || "",
  });
  return claimId;
}

export async function updateClaim(id, patch, updatedBy) {
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy || "",
  });
}

// แก้ไขรายการเบิกงวดงานที่มีอยู่แล้ว — ทุกครั้งที่แก้ไขเนื้อหา ระบบจะ "เริ่มกระบวนการอนุมัติใหม่"
// กลับไปขั้นตอนที่ 1 เสมอ (ตามที่ตกลงกันไว้: แก้ไขแล้วต้องส่งใหม่ตั้งแต่ขั้นตอนที่ 1)
export async function resubmitClaim(id, patch, updatedBy) {
  const approval = createFreshApproval();
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    ...patch,
    status: statusFromApproval(approval),
    approval,
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy || "",
  });
}

// ---- ระบบอนุมัติ 4 ขั้นตอน (ใครก็ได้ที่ล็อกอินอยู่ กดแทนขั้นตอนไหนก็ได้) ----
export async function approveClaimStep(id, actorName, note) {
  const snap = await getDoc(doc(db, CLAIMS_COLLECTION, id));
  const claim = snap.exists() ? snap.data() : null;
  const approval = approveApprovalStep(claim?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    approval,
    status: statusFromApproval(approval),
    approvedBy: (actorName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorName || "",
  });
  return approval;
}

// ปฏิเสธขั้นตอนปัจจุบัน — จบกระบวนการทันที ต้องแก้ไขแล้วส่งใหม่ (resubmitClaim) จึงจะเริ่มใหม่ได้
export async function rejectClaimStep(id, actorName, note) {
  const snap = await getDoc(doc(db, CLAIMS_COLLECTION, id));
  const claim = snap.exists() ? snap.data() : null;
  const approval = rejectApprovalStep(claim?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    approval,
    status: statusFromApproval(approval),
    approvedBy: (actorName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorName || "",
  });
  return approval;
}

// ลบรายการเบิกงวดงานถาวร (ตามคำขอ) — กู้คืนไม่ได้
export async function deleteClaim(id) {
  await deleteDoc(doc(db, CLAIMS_COLLECTION, id));
}

// สำหรับหน้าแอดมิน — subscribe รายการทั้งหมด (เรียงใหม่สุดก่อน)
export function watchAllClaims(cb, onErr) {
  const q = query(collection(db, CLAIMS_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}

// สำหรับหน้าอนุมัติ (public, ไม่ต้องล็อกอิน) — subscribe รายการเดียวตาม document id
export function watchClaim(id, cb, onErr) {
  return onSnapshot(
    doc(db, CLAIMS_COLLECTION, id),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}

// หมายเหตุ: เดิมมี approveClaimPublic/rejectClaimPublic สำหรับลิงก์สาธารณะ (ไม่ต้องล็อกอิน)
// ตอนนี้ถูกแทนที่ด้วย approveClaimStep/rejectClaimStep ด้านบน ซึ่งรองรับขั้นตอนอนุมัติทั้ง 4 ขั้น
// หน้า approve.html (public) ยังคงใช้งานได้เหมือนเดิม เพียงแค่เรียก approveClaimStep/rejectClaimStep แทน

// สำหรับหน้าตรวจสอบสถานะ (public) — subscribe เฉพาะโปรเจกต์ที่เลือก
export function watchClaimsByProject(projectId, cb, onErr) {
  const q = query(collection(db, CLAIMS_COLLECTION), where("projectId", "==", projectId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.claimDate || "").localeCompare(a.claimDate || ""));
      cb(list);
    },
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}
