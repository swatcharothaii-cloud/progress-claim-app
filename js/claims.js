// claims.js — CRUD สำหรับ collection "progressClaims"
import {
  db,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  CLAIMS_COLLECTION,
} from "./firebase-init.js";
import { generateClaimId } from "./utils.js";
import { CLAIM_STATUS } from "./config.js";

// เพิ่มรายการเบิกงวดงานใหม่
export async function addClaim(data) {
  const claimId = generateClaimId();
  await addDoc(collection(db, CLAIMS_COLLECTION), {
    claimId,
    projectId: data.projectId || "",
    project: data.project || "",
    workItem: data.workItem || "",
    progressPercent: Number(data.progressPercent) || 0,
    claimAmount: Number(data.claimAmount) || 0,
    images: data.images || [],
    claimDate: data.claimDate,
    status: data.status || CLAIM_STATUS.PENDING,
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

// ผู้บริหารกดอนุมัติ/ปฏิเสธผ่านลิงก์สาธารณะ — เก็บชื่อผู้อนุมัติแบบพิมพ์เอง (ไม่มีระบบล็อกอิน)
export async function approveClaimPublic(id, approverName) {
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    status: CLAIM_STATUS.APPROVED,
    approvedBy: (approverName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectClaimPublic(id, approverName) {
  await updateDoc(doc(db, CLAIMS_COLLECTION, id), {
    status: CLAIM_STATUS.REJECTED,
    approvedBy: (approverName || "").trim(),
    approvalRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

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
