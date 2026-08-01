// admins.js — จัดการ "รายชื่อแอดมิน" ผ่าน Firestore (collection "admins") ใช้ร่วมกันระหว่างระบบเบิกงวดงาน
// (progress-claim-app) กับระบบแจ้งซ่อม (repair-app) เพราะทั้งสองระบบใช้ Firestore โปรเจกต์เดียวกัน —
// เพิ่ม/แก้ไข/ปิดใช้งานแอดมินจากระบบใดระบบหนึ่งก็มีผลกับอีกระบบทันที (อ่านข้อมูลชุดเดียวกัน)
//
// แทนที่ ADMINS ที่เคย hardcode ไว้ใน config.js (ต้องแก้โค้ด + deploy ใหม่ทุกครั้งที่อยากเพิ่ม/ลบคน)
// ครั้งแรกที่ระบบถูกใช้งาน (ยังไม่มีข้อมูลใน collection "admins" เลย) จะหว่านเมล็ดจากรายชื่อเดิมใน
// config.js ให้อัตโนมัติ (คงรหัส 001-011 เดิมไว้ ไม่กระทบประวัติ "แก้ไขล่าสุดโดย" ของรายการเก่า)
import { db, collection, getDocs, doc, setDoc, updateDoc, serverTimestamp } from "./firebase-init.js";
import { ADMINS_COLLECTION } from "./firebase-init.js";
import { ADMINS as ADMINS_SEED } from "./config.js";

let seedPromise = null;

function seedIfEmpty() {
  return (async () => {
    const snap = await getDocs(collection(db, ADMINS_COLLECTION));
    if (!snap.empty) return;
    for (const a of ADMINS_SEED) {
      await setDoc(doc(db, ADMINS_COLLECTION, a.id), {
        name: a.name,
        active: true,
        order: parseInt(a.id, 10) || 999,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  })();
}

// เรียกครั้งเดียวต่อการโหลดหน้าเว็บหนึ่งครั้ง (กันหว่านเมล็ดซ้ำถ้าหลายส่วนของหน้าเดียวกันเรียกพร้อมกัน)
function ensureSeed() {
  if (!seedPromise) {
    seedPromise = seedIfEmpty().catch((e) => {
      console.warn("หว่านเมล็ดรายชื่อแอดมินเริ่มต้นไม่สำเร็จ (จะลองใหม่ครั้งถัดไป)", e);
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

// โหลดแอดมินทั้งหมด (รวมที่ปิดใช้งานแล้ว) เรียงตาม order แล้วตามด้วยชื่อ (ไทย)
export async function loadAdmins() {
  await ensureSeed();
  const snap = await getDocs(collection(db, ADMINS_COLLECTION));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.name || "").localeCompare(b.name || "", "th"));
  return list;
}

function nextId(existing) {
  const nums = existing.map((a) => parseInt(a.id, 10)).filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(next).padStart(3, "0");
}

// เพิ่มแอดมินใหม่ — สร้างรหัส 3 หลักถัดไปให้อัตโนมัติ (ต่อจากรหัสสูงสุดที่มีอยู่ในระบบตอนนี้)
export async function addAdmin({ name }, existing) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) throw new Error("กรุณาระบุชื่อแอดมิน");
  const id = nextId(existing || []);
  await setDoc(doc(db, ADMINS_COLLECTION, id), {
    name: trimmedName,
    active: true,
    order: parseInt(id, 10),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

// แก้ไขแอดมิน (ชื่อ / สถานะเปิด-ปิดใช้งาน) — ปิดใช้งานเท่านั้น ไม่มีการลบถาวร เพื่อไม่ให้ประวัติ
// "แก้ไขล่าสุดโดย" ในรายการแจ้งซ่อม/เบิกงวดงานเก่าอ้างอิงชื่อที่หายไปจากระบบ
export async function updateAdmin(id, patch) {
  await updateDoc(doc(db, ADMINS_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}
