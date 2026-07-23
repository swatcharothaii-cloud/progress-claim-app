// projects.js — จัดการ "โปรเจกต์" ผ่าน Firestore (collection "projects")
// ใช้แยกขอบเขตรายการแจ้งซ่อมเป็นแต่ละโปรเจกต์ (ดูได้เฉพาะโปรเจกต์นั้นๆ ไม่ปนกับโปรเจกต์อื่น) โดย
// ประเภทงาน (categories.js) ยังคงเป็นตัวกรอง "ระดับย่อย" ภายในแต่ละโปรเจกต์เหมือนเดิม
//
// ต่างจากประเภทงานตรงที่ไม่มีชุดข้อมูลเริ่มต้น (ไม่มี "โปรเจกต์เริ่มต้น" ที่ตายตัว) — แอดมินต้องสร้าง
// โปรเจกต์แรกเองจากหน้าแอดมิน (หัวข้อ "📁 จัดการโปรเจกต์") ก่อน ผู้แจ้งจึงจะเลือกโปรเจกต์ได้
import { db, collection, getDocs, doc, addDoc, updateDoc, serverTimestamp } from "./firebase-init.js";
import { PROJECTS_COLLECTION } from "./firebase-init.js";

// โหลดโปรเจกต์ทั้งหมด (รวมที่ปิดใช้งานแล้วด้วย) เรียงตาม order แล้วตามด้วยชื่อ (ไทย)
export async function loadProjects() {
  const snap = await getDocs(collection(db, PROJECTS_COLLECTION));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.label || "").localeCompare(b.label || "", "th"));
  return list;
}

// เพิ่มโปรเจกต์ใหม่ — label เป็นค่าที่จะถูกบันทึกจริงลงในรายการแจ้งซ่อม (project) จึงควรตั้งเป็น
// ภาษาไทยให้ชัดเจนและไม่ซ้ำกับโปรเจกต์เดิม
export async function addProject({ label, color }) {
  const trimmedLabel = (label || "").trim();
  if (!trimmedLabel) throw new Error("กรุณาระบุชื่อโปรเจกต์");
  const ref = await addDoc(collection(db, PROJECTS_COLLECTION), {
    label: trimmedLabel,
    color: color || "#2563eb",
    order: 999,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// แก้ไขโปรเจกต์ (ชื่อ/สี/สถานะเปิด-ปิดใช้งาน) — หมายเหตุ: การเปลี่ยน "ชื่อ" จะไม่กระทบรายการแจ้งซ่อม
// เก่าที่เคยบันทึกชื่อเดิมไปแล้ว (ยังคงเก็บชื่อ ณ ตอนที่แจ้งไว้เหมือนเดิม)
export async function updateProject(id, patch) {
  await updateDoc(doc(db, PROJECTS_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}
