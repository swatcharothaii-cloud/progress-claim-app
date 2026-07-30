// ใช้ Firebase Modular SDK ผ่าน CDN (ไม่ต้องมี build step) — ตัวเดียวกับ repair-app
// หมายเหตุ: ไม่ใช้ Firebase Storage เพราะต้องอัปเกรดเป็นแผน Blaze (ผูกบัตรเครดิต)
// รูปภาพที่แนบจะถูกบีบอัดแล้วเก็บเป็น base64 ตรงใน Firestore แทน (ดู image-compress.js)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { FIREBASE_CONFIG } from "./config.js";

// getApps()/getApp() กันไว้เผื่อโหลดซ้ำ (ไม่ได้จำเป็นในแอปนี้ แต่ไม่มีผลเสีย)
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);

export {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
};

export const CLAIMS_COLLECTION = "progressClaims";
export const PROJECTS_COLLECTION = "projects";
// collection เดียวกับ repair-app (Firestore ตัวเดียวกัน) — ใช้อ่าน/แก้ไข PO และการตรวจรับงานจากที่นี่ได้เลย
export const CONTRACTOR_JOBS_COLLECTION = "contractorJobs";
// คลังใบสั่งซื้อเก่าที่นำเข้าจากโปรแกรมบัญชี PEAK (progress-claim-app เท่านั้นที่ใช้ collection นี้)
export const LEGACY_PO_COLLECTION = "legacyPurchaseOrders";
