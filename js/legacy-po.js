// legacy-po.js — คลังใบสั่งซื้อเก่าที่เคยออกผ่านโปรแกรมบัญชี PEAK มาก่อนหน้านี้ (ก่อนมีระบบนี้)
// นำเข้าครั้งเดียวจากไฟล์ data/legacy-po-import-2026.json (แปลงมาจากไฟล์ Excel ที่ผู้ใช้อัปโหลดให้)
// แล้วเก็บไว้ใน collection "legacyPurchaseOrders" เพื่อดูอ้างอิง/แยกตามโปรเจกต์ — เป็นข้อมูลเก็บถาวร
// ไม่มีการแก้ไขยอดเงินจากหน้านี้ (แก้ได้แค่ "โปรเจกต์ที่สังกัด" เผื่อจัดกลุ่มผิดตอนนำเข้า)
import { db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp } from "./firebase-init.js";
import { LEGACY_PO_COLLECTION, PROJECTS_COLLECTION } from "./firebase-init.js";
import { loadProjects, addProject } from "./projects.js";

const IMPORT_DATA_URL = "./data/legacy-po-import-2026.json";

// นำเข้าข้อมูลจากไฟล์ JSON ที่แปลงมาจาก Excel — ทำได้หลายครั้งอย่างปลอดภัย (ข้ามรายการที่นำเข้าไปแล้ว
// โดยเช็คคู่ เลขที่เอกสาร + ช่างประจำ ที่มีอยู่แล้วใน Firestore ก่อนสร้างใหม่)
// onProgress(doneCount, totalCount) เรียกเป็นระยะเพื่ออัปเดตสถานะบนหน้าจอ
export async function importLegacyPurchaseOrders(onProgress) {
  const res = await fetch(IMPORT_DATA_URL);
  if (!res.ok) throw new Error("โหลดไฟล์ข้อมูลนำเข้าไม่สำเร็จ (" + res.status + ")");
  const records = await res.json();

  // 1) โหลดโปรเจกต์ที่มีอยู่แล้วทั้งหมด แล้วสร้างโปรเจกต์ใหม่เฉพาะชื่อที่ยังไม่มี (ผสมเข้ากับโปรเจกต์หลัก
  //    ที่ใช้ร่วมกับ repair-app ตามที่ตกลงไว้ — ไม่สร้างซ้ำถ้ามีชื่อเดียวกันอยู่แล้ว)
  let allProjects = await loadProjects();
  const projectByLabel = new Map(allProjects.map((p) => [p.label, p]));
  const distinctLabels = Array.from(new Set(records.map((r) => r.project)));
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
    const key = `${r.poNumber}::${r.contractorNickname}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const project = projectByLabel.get(r.project);
    await addDoc(collection(db, LEGACY_PO_COLLECTION), {
      poNumber: r.poNumber,
      contractorNickname: r.contractorNickname,
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
      project: r.project,
      importBatch: "peak_2026H1",
      createdAt: serverTimestamp(),
    });
    existingKeys.add(key);
    created++;
  }
  return { total: records.length, created, skipped };
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
