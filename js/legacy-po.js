// legacy-po.js — คลังใบสั่งซื้อเก่าที่เคยออกผ่านโปรแกรมบัญชี PEAK มาก่อนหน้านี้ (ก่อนมีระบบนี้)
// นำเข้าครั้งเดียวจากไฟล์ data/legacy-po-import-2026.json (แปลงมาจากไฟล์ Excel ที่ผู้ใช้อัปโหลดให้)
// แล้วเก็บไว้ใน collection "legacyPurchaseOrders" เพื่อดูอ้างอิง/แยกตามโปรเจกต์ — เป็นข้อมูลเก็บถาวร
// ไม่มีการแก้ไขยอดเงินจากหน้านี้ (แก้ได้แค่ "โปรเจกต์ที่สังกัด" เผื่อจัดกลุ่มผิดตอนนำเข้า)
import { db, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, where, serverTimestamp, increment } from "./firebase-init.js";
import { LEGACY_PO_COLLECTION, PROJECTS_COLLECTION } from "./firebase-init.js";

// คอลเลกชันใหม่: "ใบส่งมอบงาน" ของ PO เก่าแต่ละใบ — แยกเป็นเอกสารของตัวเอง ทำให้ PO 1 ใบ
// มีใบส่งมอบงานได้หลายใบ (ส่งเป็นงวดๆ) แทนที่จะมีได้ใบเดียวเหมือนเดิม (ฟิลด์ deliveryPhotos/
// deliveryDate/approval บนตัว PO เองที่ใช้แบบเดิมยังเก็บไว้เผื่อความเข้ากันได้ แต่ไม่ใช้สร้างใหม่แล้ว)
export const LEGACY_PO_DELIVERY_NOTES_COLLECTION = "legacyPoDeliveryNotes";
import { loadProjects, addProject } from "./projects.js";
import { createFreshApproval, approveApprovalStep, rejectApprovalStep } from "./approval.js";

const IMPORT_DATA_URL = "./data/legacy-po-import-2026.json";

// นำเข้าข้อมูลจากไฟล์ JSON ที่แปลงมาจาก Excel (ครั้งแรกที่ตั้งระบบ) — ทำได้หลายครั้งอย่างปลอดภัย
// (ข้ามรายการที่นำเข้าไปแล้ว โดยเช็คคู่ เลขที่เอกสาร + ช่างประจำ ที่มีอยู่แล้วใน Firestore ก่อนสร้างใหม่)
// onProgress(doneCount, totalCount) เรียกเป็นระยะเพื่ออัปเดตสถานะบนหน้าจอ
export async function importLegacyPurchaseOrders(onProgress) {
  const res = await fetch(IMPORT_DATA_URL);
  if (!res.ok) throw new Error("โหลดไฟล์ข้อมูลนำเข้าไม่สำเร็จ (" + res.status + ")");
  const records = await res.json();
  return importLegacyPurchaseOrderRecords(records, onProgress, "peak_2026H1");
}

// เวอร์ชันทั่วไป — รับ array ของ record ตรงๆ (ใช้ทั้งกับการนำเข้าจากไฟล์ JSON ด้านบน และจากไฟล์ Excel ที่
// แอดมินอัปโหลดเองผ่านหน้าเว็บ — ดู admin.js ส่วน "📤 Import from Excel") แต่ละ record ควรมีฟิลด์:
// poNumber, contractorNickname, vendorName, issueDate, status, lineItems, totalAmount, vatAmount,
// whtAmount, netPayable, notes, rawProjectText, project (ทุกฟิลด์นอกจาก poNumber/project เป็น optional)
export async function importLegacyPurchaseOrderRecords(records, onProgress, importBatch) {
  // 1) โหลดโปรเจกต์ที่มีอยู่แล้วทั้งหมด แล้วสร้างโปรเจกต์ใหม่เฉพาะชื่อที่ยังไม่มี (ผสมเข้ากับโปรเจกต์หลัก
  //    ที่ใช้ร่วมกับ repair-app ตามที่ตกลงไว้ — ไม่สร้างซ้ำถ้ามีชื่อเดียวกันอยู่แล้ว)
  let allProjects = await loadProjects();
  const projectByLabel = new Map(allProjects.map((p) => [p.label, p]));
  const distinctLabels = Array.from(new Set(records.map((r) => r.project).filter(Boolean)));
  for (const label of distinctLabels) {
    if (!projectByLabel.has(label)) {
      const newId = await addProject({ label, color: randomColorFor(label) });
      projectByLabel.set(label, { id: newId, label });
    }
  }

  // 2) เช็ครายการที่นำเข้าไปแล้วก่อน (กันนำเข้าซ้ำถ้ากดปุ่มนี้มากกว่า 1 ครั้ง)
  const existingSnap = await getDocs(collection(db, LEGACY_PO_COLLECTION));
  const existingKeys = new Set(
    existingSnap.docs.map((d) => `${d.data().poNumber}::${d.data().contractorNickname}`)
  );

  let done = 0;
  let skipped = 0;
  let created = 0;
  for (const r of records) {
    done++;
    if (onProgress) onProgress(done, records.length, { created, skipped });
    const key = `${r.poNumber}::${r.contractorNickname || ""}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const project = projectByLabel.get(r.project);
    await addDoc(collection(db, LEGACY_PO_COLLECTION), {
      poNumber: r.poNumber,
      contractorNickname: r.contractorNickname || "",
      vendorName: r.vendorName || "",
      issueDate: r.issueDate || "",
      status: r.status || "",
      lineItems: r.lineItems || [],
      totalAmount: r.totalAmount ?? null,
      vatAmount: r.vatAmount ?? null,
      whtAmount: r.whtAmount ?? null,
      netPayable: r.netPayable ?? null,
      notes: r.notes || "",
      rawProjectText: r.rawProjectText || "",
      projectId: project?.id || "",
      project: r.project || "",
      importBatch: importBatch || "manual",
      createdAt: serverTimestamp(),
    });
    existingKeys.add(key);
    created++;
  }
  return { total: records.length, created, skipped };
}

// เพิ่ม PO เก่าทีละใบเองจากหน้าแอดมิน (ปุ่ม "✏️ Add PO Manually") — ใช้ตอนมีแค่ใบเดียว (เช่น อ่านจาก
// ไฟล์ PDF ที่แปลงเป็น Excel/ตัวเลขไม่ได้อัตโนมัติ) เตือน (ไม่บล็อก) ถ้าเลขที่ PO+ช่างประจำซ้ำกับที่มีอยู่แล้ว
export async function addLegacyPoManual(data) {
  let projectId = "";
  if (data.project) {
    const allProjects = await loadProjects();
    let match = allProjects.find((p) => p.label === data.project);
    if (!match) {
      const newId = await addProject({ label: data.project, color: randomColorFor(data.project) });
      match = { id: newId, label: data.project };
    }
    projectId = match.id;
  }
  const ref = await addDoc(collection(db, LEGACY_PO_COLLECTION), {
    poNumber: data.poNumber,
    contractorNickname: data.contractorNickname || "",
    vendorName: data.vendorName || "",
    issueDate: data.issueDate || "",
    status: data.status || "",
    lineItems: data.lineItems || [],
    totalAmount: data.totalAmount ?? null,
    vatAmount: data.vatAmount ?? null,
    whtAmount: data.whtAmount ?? null,
    netPayable: data.netPayable ?? null,
    notes: data.notes || "",
    rawProjectText: "",
    projectId,
    project: data.project || "",
    importBatch: "manual",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// เช็คว่ามี PO เลขที่นี้ + ช่างประจำนี้อยู่แล้วหรือยัง (ใช้เตือนก่อนเพิ่มเองทีละใบ กันเพิ่มซ้ำโดยไม่รู้ตัว)
export async function findExistingLegacyPo(poNumber, contractorNickname) {
  const snap = await getDocs(collection(db, LEGACY_PO_COLLECTION));
  return snap.docs.find(
    (d) => d.data().poNumber === poNumber && (d.data().contractorNickname || "") === (contractorNickname || "")
  );
}

function randomColorFor(label) {
  // สีคงที่ตาม hash ของชื่อ (ไม่ใช่ random จริงเพื่อไม่ให้สีเปลี่ยนทุกครั้งที่รันใหม่)
  const palette = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#4338ca"];
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function watchAllLegacyPOs(cb, onErr) {
  const q = query(collection(db, LEGACY_PO_COLLECTION), orderBy("issueDate", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error(err);
      if (onErr) onErr(err);
    }
  );
}

// แก้ไข "โปรเจกต์ที่สังกัด" ของใบสั่งซื้อเก่ารายการนี้ (เผื่อระบบจัดกลุ่มผิดตอนนำเข้าอัตโนมัติ)
export async function reassignLegacyPoProject(id, projectId, projectLabel) {
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, id), {
    projectId: projectId || "",
    project: projectLabel || "",
  });
}

// แก้ไขชื่อเล่น/ชื่อ-นามสกุลจริงของผู้รับเหมา เฉพาะรายการเดียว (ไม่กระทบรายการอื่นที่ชื่อเล่นเดียวกัน)
// ใช้แก้ข้อมูลที่นำเข้าจาก PEAK มาผิด เช่น คำนำหน้า นาย/นางสาว ไม่ตรงกับตัวจริง
export async function updateLegacyPoContractorName(id, contractorNickname, vendorName) {
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, id), {
    contractorNickname: contractorNickname || "",
    vendorName: vendorName || "",
  });
}

// แก้ไขชื่อเล่น/ชื่อ-นามสกุลจริง ให้ทุกใบสั่งซื้อที่มี "ชื่อเล่นเดิม" (oldNickname) ตรงกันในคราวเดียว
// ใช้แก้ปัญหาข้อมูลนำเข้าจาก PEAK ที่ชื่อเล่นเดียวกันแต่ชื่อ-นามสกุลจริง/คำนำหน้าไม่ตรงกันปนกันอยู่หลายบิล
// คืนค่าจำนวนรายการที่แก้ไขไปทั้งหมด
export async function bulkUpdateLegacyPoContractorNameByNickname(oldNickname, newNickname, newVendorName) {
  const snap = await getDocs(collection(db, LEGACY_PO_COLLECTION));
  const matches = snap.docs.filter((d) => (d.data().contractorNickname || "") === (oldNickname || ""));
  let count = 0;
  for (const d of matches) {
    await updateDoc(doc(db, LEGACY_PO_COLLECTION, d.id), {
      contractorNickname: newNickname || "",
      vendorName: newVendorName || "",
    });
    count++;
  }
  return count;
}

export async function deleteLegacyPo(id) {
  await deleteDoc(doc(db, LEGACY_PO_COLLECTION, id));
}

// ดึงข้อมูล PO เก่ารายการเดียวตาม id — ใช้โดยหน้าฟอร์มใบส่งมอบงาน (delivery-note.html) ที่เปิดจากลิงก์แยก
export async function getLegacyPoById(id) {
  const snap = await getDoc(doc(db, LEGACY_PO_COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// บันทึกใบส่งมอบงานฉบับเต็มของ PO เก่ารายการนี้โดยเฉพาะ — รูปภาพ (แต่ละรูปมีคำอธิบาย/% ความคืบหน้า/
// สถานะผ่าน-ไม่ผ่านแยกกันเป็นรายภาพ) รวมถึงวันที่ส่งมอบ
// ทุกครั้งที่แก้ไขเนื้อหา (บันทึก) จะเริ่มกระบวนการอนุมัติ 4 ขั้นตอนใหม่เสมอ (ตามที่ตกลงกันไว้: แก้ไขแล้วต้องส่งใหม่ตั้งแต่ขั้นตอนที่ 1)
export async function updateLegacyPoDeliveryNote(id, data, updatedBy) {
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, id), {
    deliveryPhotos: data.deliveryPhotos || [],
    deliveryDate: data.deliveryDate || "",
    approval: createFreshApproval(),
    deliveryNoteUpdatedAt: serverTimestamp(),
    deliveryNoteUpdatedBy: updatedBy || "",
  });
}

// ---- ระบบอนุมัติ 4 ขั้นตอนสำหรับใบส่งมอบงาน PO เก่า (ใครก็ได้ที่ล็อกอินอยู่ กดแทนขั้นตอนไหนก็ได้) ----
export async function approveLegacyPoDeliveryStep(id, actorName, note) {
  const snap = await getDoc(doc(db, LEGACY_PO_COLLECTION, id));
  const p = snap.exists() ? snap.data() : null;
  const approval = approveApprovalStep(p?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, id), {
    approval,
    deliveryNoteUpdatedAt: serverTimestamp(),
    deliveryNoteUpdatedBy: actorName || "",
  });
  return approval;
}

// ปฏิเสธขั้นตอนปัจจุบัน — จบกระบวนการทันที ต้องแก้ไขแล้วบันทึกใหม่ (updateLegacyPoDeliveryNote) จึงจะเริ่มใหม่ได้
export async function rejectLegacyPoDeliveryStep(id, actorName, note) {
  const snap = await getDoc(doc(db, LEGACY_PO_COLLECTION, id));
  const p = snap.exists() ? snap.data() : null;
  const approval = rejectApprovalStep(p?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, id), {
    approval,
    deliveryNoteUpdatedAt: serverTimestamp(),
    deliveryNoteUpdatedBy: actorName || "",
  });
  return approval;
}

// ============================================================
//  ใบส่งมอบงานหลายใบต่อ PO (ใบที่ 1, 2, 3, ... — ส่งเป็นงวดๆ ได้)
//  แต่ละใบเป็นเอกสารแยกใน collection "legacyPoDeliveryNotes" อ้างอิงกลับไปที่ poId
//  เก็บข้อมูล PO ที่จำเป็นต่อการแสดงผล (poNumber/project/contractorNickname/vendorName/totalAmount)
//  แบบ snapshot ไว้ในตัวใบส่งมอบงานเองด้วย เพื่อไม่ต้อง query ซ้อน PO ทุกครั้งที่เปิดดู
// ============================================================

function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

// สร้างใบส่งมอบงานใหม่ (ใบที่เท่าไหร่ก็ได้ ไม่ทับใบเก่า) สำหรับ PO นี้
export async function createDeliveryNoteForPo(po, createdBy) {
  const ref = await addDoc(collection(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION), {
    poId: po.id,
    poNumber: po.poNumber || "",
    project: po.project || "",
    contractorNickname: po.contractorNickname || "",
    vendorName: po.vendorName || "",
    totalAmount: po.totalAmount ?? null,
    status: po.status || "",
    issueDate: po.issueDate || "",
    deliveryPhotos: [],
    deliveryDate: "",
    note: "",
    approval: createFreshApproval(),
    createdAt: serverTimestamp(),
    createdBy: createdBy || "",
    updatedAt: serverTimestamp(),
    updatedBy: createdBy || "",
  });
  // เก็บตัวนับจำนวนใบไว้ที่ตัว PO เอง ให้ตารางหลักโชว์ badge ได้โดยไม่ต้อง query เพิ่มทุกแถว
  await updateDoc(doc(db, LEGACY_PO_COLLECTION, po.id), { deliveryNoteCount: increment(1) });
  return ref.id;
}

// รายการใบส่งมอบงานทั้งหมดของ PO ใบนี้ — ใหม่สุดก่อน
export async function listDeliveryNotesForPo(poId) {
  const snap = await getDocs(query(collection(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION), where("poId", "==", poId)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return list;
}

export async function getDeliveryNoteById(id) {
  const snap = await getDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// บันทึกเนื้อหาใบส่งมอบงานใบนี้ (รูปภาพ/วันที่ส่งมอบ/หมายเหตุ) — แก้ไขแล้วเริ่มอนุมัติใหม่ตั้งแต่ขั้นตอนที่ 1 เสมอ
export async function updateDeliveryNote(id, data, updatedBy) {
  await updateDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id), {
    deliveryPhotos: data.deliveryPhotos || [],
    deliveryDate: data.deliveryDate || "",
    note: data.note || "",
    approval: createFreshApproval(),
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy || "",
  });
}

export async function deleteDeliveryNote(id, poId) {
  await deleteDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id));
  if (poId) {
    await updateDoc(doc(db, LEGACY_PO_COLLECTION, poId), { deliveryNoteCount: increment(-1) });
  }
}

export async function approveDeliveryNoteStep(id, actorName, note) {
  const snap = await getDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id));
  const p = snap.exists() ? snap.data() : null;
  const approval = approveApprovalStep(p?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id), { approval, updatedAt: serverTimestamp(), updatedBy: actorName || "" });
  return approval;
}

export async function rejectDeliveryNoteStep(id, actorName, note) {
  const snap = await getDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id));
  const p = snap.exists() ? snap.data() : null;
  const approval = rejectApprovalStep(p?.approval, actorName, note, serverTimestamp);
  await updateDoc(doc(db, LEGACY_PO_DELIVERY_NOTES_COLLECTION, id), { approval, updatedAt: serverTimestamp(), updatedBy: actorName || "" });
  return approval;
}
