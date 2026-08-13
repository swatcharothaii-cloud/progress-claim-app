// project-merge.js — รวมโปรเจกต์ที่ซ้ำ/ใกล้เคียงกันเข้าเป็นโปรเจกต์เดียว
// (เช่น "Plus City Condo" + "Plus City Park" → "Plus City", "PST" + "PST Condo" → "PST Condo")
//
// ปัญหาเดิม: การ "เปลี่ยนชื่อ" โปรเจกต์ผ่าน updateProject() ไม่ไล่แก้ข้อมูลเก่าที่เคยบันทึกชื่อเดิมไปแล้ว
// (ดูคอมเมนต์ใน projects.js) ทำให้ถ้ามีโปรเจกต์ซ้ำกัน 2 ชื่อในระบบ ข้อมูลจะกระจัดกระจายอยู่คนละที่
//
// ฟังก์ชันนี้แก้ปัญหานั้นโดยไล่อัปเดตทุก collection ที่มีการอ้างอิงโปรเจกต์ให้ครบ — ทั้ง repairRequests /
// contractorJobs (repair-app) และ legacyPurchaseOrders / progressClaims (progress-claim-app) เพราะใช้
// Firestore ฐานข้อมูลเดียวกัน ไม่ว่าจะกดรวมจากแอปไหนก็ตาม — ให้ทุกอย่างชี้ไปที่ "โปรเจกต์ที่เหลืออยู่"
// (survivor) แทน แล้วปิดใช้งาน (active:false) โปรเจกต์ที่ถูกรวมทิ้ง (ลบถาวรไม่ได้ตามกติกาความปลอดภัย —
// firestore.rules ตั้ง allow delete: if false ไว้บน collection "projects" โดยตั้งใจ)
import { db, collection, doc, getDocs, query, where, updateDoc, serverTimestamp } from "./firebase-init.js";
import { PROJECTS_COLLECTION } from "./firebase-init.js";

// รายชื่อ collection ทั้งหมดที่มีฟิลด์ "project" (ชื่อ) + "projectId" (id) อ้างอิงโปรเจกต์
// (ใช้ชื่อ collection ตรงๆ แทนการ import ค่าคงที่จากไฟล์อื่น เพราะบาง collection เป็นของอีกแอปหนึ่ง)
const REFERENCING_COLLECTIONS = ["repairRequests", "contractorJobs", "legacyPurchaseOrders", "progressClaims"];

// ย้ายเอกสารทุกชิ้นใน collection ที่ระบุ ที่เคยอ้างอิงโปรเจกต์เดิม (ทั้งด้วย id และด้วยชื่อ เผื่อบาง
// เอกสารเก่ามี projectId ว่าง/ไม่ตรง แต่ชื่อ project ตรงกับของเดิมเป๊ะ) ให้ไปอ้างอิงโปรเจกต์ใหม่แทน
async function reassignCollectionDocs(collName, oldProjectId, oldLabel, newProjectId, newLabel) {
  const col = collection(db, collName);
  const seenIds = new Set();
  const docsToUpdate = [];

  if (oldProjectId) {
    const snap = await getDocs(query(col, where("projectId", "==", oldProjectId)));
    snap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        docsToUpdate.push(d);
      }
    });
  }
  if (oldLabel) {
    const snap = await getDocs(query(col, where("project", "==", oldLabel)));
    snap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        docsToUpdate.push(d);
      }
    });
  }

  for (const d of docsToUpdate) {
    await updateDoc(doc(db, collName, d.id), { project: newLabel, projectId: newProjectId });
  }
  return docsToUpdate.length;
}

// รวมโปรเจกต์หลายรายการเข้าเป็นโปรเจกต์เดียวชื่อ targetLabel
// sourceProjects: [{id, label}, ...] อย่างน้อย 2 รายการที่แอดมินติ๊กเลือกไว้ว่าจะรวมกัน
// เลือก "โปรเจกต์ที่เหลืออยู่" (survivor) ดังนี้: ถ้ามีรายการที่ชื่อตรงกับ targetLabel อยู่แล้วในกลุ่มที่
// เลือก ใช้อันนั้นเป็น survivor เลย (ไม่ต้องเปลี่ยนชื่อ) ไม่งั้นเอารายการแรกในกลุ่มมาเปลี่ยนชื่อเป็น
// targetLabel แทน ส่วนที่เหลือ (losers) จะถูกปิดใช้งานและย้ายข้อมูลทั้งหมดมาที่ survivor
// คืนค่า { survivorId, survivorLabel, counts: { <collectionName>: จำนวนเอกสารที่แก้ไข } }
export async function mergeProjectsGroup(sourceProjects, targetLabel) {
  const label = (targetLabel || "").trim();
  if (!label) throw new Error("กรุณาระบุชื่อโปรเจกต์ปลายทาง / Please enter a target project name");
  if (!sourceProjects || sourceProjects.length < 2) {
    throw new Error("เลือกอย่างน้อย 2 โปรเจกต์ที่จะรวมกัน / Tick at least 2 projects to merge");
  }

  let survivor = sourceProjects.find((p) => (p.label || "").trim() === label) || sourceProjects[0];
  const losers = sourceProjects.filter((p) => p.id !== survivor.id);
  const survivorRenamed = (survivor.label || "").trim() !== label;

  if (survivorRenamed) {
    await updateDoc(doc(db, PROJECTS_COLLECTION, survivor.id), { label, updatedAt: serverTimestamp() });
  }

  const counts = {};
  for (const loser of losers) {
    for (const collName of REFERENCING_COLLECTIONS) {
      const n = await reassignCollectionDocs(collName, loser.id, loser.label, survivor.id, label);
      counts[collName] = (counts[collName] || 0) + n;
    }
    await updateDoc(doc(db, PROJECTS_COLLECTION, loser.id), {
      active: false,
      mergedIntoProjectId: survivor.id,
      mergedIntoLabel: label,
      updatedAt: serverTimestamp(),
    });
  }

  // ถ้า survivor เปลี่ยนชื่อไปด้วย ต้องรีเฟรชเอกสารเก่าที่เคยอ้างอิงชื่อเดิมของ survivor เองด้วย
  // (ไม่งั้นจะเห็นชื่อเก่าค้างอยู่ในข้อมูลเก่าที่แม้จะมี projectId ถูกต้องอยู่แล้วก็ตาม)
  if (survivorRenamed) {
    for (const collName of REFERENCING_COLLECTIONS) {
      const n = await reassignCollectionDocs(collName, survivor.id, survivor.label, survivor.id, label);
      counts[collName] = (counts[collName] || 0) + n;
    }
  }

  return { survivorId: survivor.id, survivorLabel: label, counts };
}
