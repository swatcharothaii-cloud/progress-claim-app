// categories.js — จัดการ "ประเภทงาน" ผ่าน Firestore (collection "categories") แทนที่การกำหนด
// ตายตัวใน config.js เดิม เพื่อให้แอดมิน "เพิ่มประเภทงานใหม่ได้เองในระบบ" โดยไม่ต้องแก้โค้ด/deploy ใหม่
//
// ครั้งแรกที่ระบบถูกใช้งาน (ยังไม่มีข้อมูลใน collection "categories" เลย) จะหว่านเมล็ดจาก
// CATEGORIES_SEED ใน config.js ให้อัตโนมัติ (รวมประเภทงานเดิม 6 อย่าง + ที่เพิ่มใหม่ 5 อย่าง)
// หลังจากนั้นไปเพิ่ม/แก้ไข/ปิดใช้งานประเภทงานได้ที่หน้าแอดมินโดยตรง
import { db, collection, getDocs, doc, setDoc, addDoc, updateDoc, serverTimestamp } from "./firebase-init.js";
import { CATEGORIES_COLLECTION } from "./firebase-init.js";
import { CATEGORIES_SEED } from "./config.js";

let seedPromise = null;

function seedIfEmpty() {
  return (async () => {
    const snap = await getDocs(collection(db, CATEGORIES_COLLECTION));
    if (!snap.empty) return;
    for (const cat of CATEGORIES_SEED) {
      await setDoc(doc(db, CATEGORIES_COLLECTION, cat.id), {
        label: cat.label,
        icon: cat.icon,
        color: cat.color,
        order: cat.order ?? 999,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  })();
}

// เรียกครั้งเดียวต่อการโหลดหน้าเว็บหนึ่งครั้ง (กันหว่านเมล็ดซ้ำถ้าหลายส่วนของหน้าเดียวกันเรียกพร้อมกัน)
// ถ้าล้มเหลว (เช่นเน็ตหลุดตอนนั้นพอดี) จะรีเซ็ตให้ลองใหม่ได้ในครั้งถัดไปที่เรียก แทนที่จะค้างว่า "เคยลองแล้ว"
function ensureDefaultCategories() {
  if (!seedPromise) {
    seedPromise = seedIfEmpty().catch((e) => {
      console.warn("หว่านเมล็ดประเภทงานเริ่มต้นไม่สำเร็จ (จะลองใหม่ครั้งถัดไป)", e);
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

// โหลดประเภทงานทั้งหมด (รวมที่ปิดใช้งานแล้วด้วย) เรียงตาม order แล้วตามด้วยชื่อ (ไทย)
export async function loadCategories() {
  await ensureDefaultCategories();
  const snap = await getDocs(collection(db, CATEGORIES_COLLECTION));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.label || "").localeCompare(b.label || "", "th"));
  return list;
}

// เพิ่มประเภทงานใหม่ — label เป็นค่าที่จะถูกบันทึกจริงลงในรายการแจ้งซ่อม (category) จึงควรตั้งเป็น
// ภาษาไทยให้ชัดเจนและไม่ซ้ำกับประเภทงานเดิม
export async function addCategory({ label, icon, color }) {
  const trimmedLabel = (label || "").trim();
  if (!trimmedLabel) throw new Error("กรุณาระบุชื่อประเภทงาน");
  const ref = await addDoc(collection(db, CATEGORIES_COLLECTION), {
    label: trimmedLabel,
    icon: (icon || "🔧").trim() || "🔧",
    color: color || "#6b7280",
    order: 999, // รายการที่เพิ่มเองจะแสดงต่อท้ายรายการเริ่มต้นเสมอ
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// แก้ไขประเภทงาน (ชื่อ/ไอคอน/สี/สถานะเปิด-ปิดใช้งาน) — หมายเหตุ: การเปลี่ยน "ชื่อ" จะไม่กระทบ
// รายการแจ้งซ่อมเก่าที่เคยบันทึกชื่อเดิมไปแล้ว (ยังคงเก็บชื่อ ณ ตอนที่แจ้งไว้เหมือนเดิม)
export async function updateCategory(id, patch) {
  await updateDoc(doc(db, CATEGORIES_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}
