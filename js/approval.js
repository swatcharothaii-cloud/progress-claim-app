// ============================================================
//  approval.js — โมดูลกลางสำหรับ "การอนุมัติ 4 ขั้นตอน" ใช้ร่วมกันทุกจุดในระบบ
//  (Progress Claims / Contractor Job Delivery Inspection / Legacy PO Delivery Note)
//  ⚠️ ไฟล์นี้ต้องเหมือนกันทุกตัวอักษร (byte-identical) กับ repair-app/js/approval.js
//     ถ้าแก้ไขที่นี่ ต้องคัดลอกไปแก้อีกฝั่งด้วยเสมอ
//
//  แนวคิด: ทุกขั้นตอนอนุมัติในระบบ (ไม่ว่าจะเป็นการเบิกงวดงาน, ตรวจรับงานผู้รับเหมา,
//  หรือใบส่งมอบงาน PO เก่า) ใช้ "chain" เดียวกัน 4 ขั้น:
//    1. ทีมงาน/ผู้ดูแลงาน   (team)
//    2. หัวหน้าทีม/PM       (pm)
//    3. ฝ่ายจัดซื้อ         (purchasing)
//    4. ผู้บริหาร           (management)
//  ใครก็ได้ที่ล็อกอินอยู่ (เลือกชื่อจากรายชื่อแอดมิน) สามารถกดอนุมัติ/ปฏิเสธ "แทน" ขั้นตอนใดก็ได้
//  ไม่มีการบังคับสิทธิ์ตามตำแหน่งจริง — เป็นการยืนยันขั้นตอนเชิงกระบวนการเท่านั้น
//  ถ้ามีขั้นตอนใดกด "ไม่ผ่าน/ปฏิเสธ" กระบวนการจะจบทันที (status: rejected) ต้องแก้ไขแล้วส่งใหม่
//  ซึ่งจะรีเซ็ตกลับไปเริ่มที่ขั้นตอนที่ 1 ใหม่เสมอ
// ============================================================

export const APPROVAL_STEP_DEFS = [
  {
    step: 1,
    key: "team",
    labelTh: "ทีมงาน/ผู้ดูแลงาน",
    labelEn: "Site Team / Supervisor",
    labelZh: "现场团队/负责人",
    icon: "👷",
  },
  {
    step: 2,
    key: "pm",
    labelTh: "หัวหน้าทีม/PM",
    labelEn: "Team Lead / PM",
    labelZh: "项目负责人",
    icon: "🧑‍💼",
  },
  {
    step: 3,
    key: "purchasing",
    labelTh: "ฝ่ายจัดซื้อ",
    labelEn: "Purchasing",
    labelZh: "采购部",
    icon: "🛒",
  },
  {
    step: 4,
    key: "management",
    labelTh: "ผู้บริหาร",
    labelEn: "Management",
    labelZh: "管理层",
    icon: "🏢",
  },
];

export const APPROVAL_STATUS = {
  IN_PROGRESS: "in_progress",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// สร้างสถานะ approval เริ่มต้น (ใหม่เอี่ยม / รีเซ็ตกลับขั้นตอนที่ 1)
export function createFreshApproval() {
  return {
    status: APPROVAL_STATUS.IN_PROGRESS,
    currentStep: 1,
    steps: APPROVAL_STEP_DEFS.map((def) => ({
      step: def.step,
      status: "pending", // pending | approved | rejected
      by: "",
      at: null,
      note: "",
    })),
  };
}

// ตรวจสอบว่าเป็น object approval ที่ใช้งานได้จริงหรือไม่ (กันเอกสารเก่าที่ยังไม่มี field นี้)
export function isValidApproval(approval) {
  return !!(approval && Array.isArray(approval.steps) && approval.steps.length === APPROVAL_STEP_DEFS.length);
}

// คืนค่า approval ที่ใช้งานได้เสมอ — ถ้าไม่มี/ผิดรูปแบบ จะคืนค่าชุดใหม่ (เอกสารเก่าก่อนมีระบบนี้)
export function ensureApproval(approval) {
  return isValidApproval(approval) ? approval : createFreshApproval();
}

// อนุมัติขั้นตอนปัจจุบัน (actorName = currentAdmin.name ของคนที่กดอยู่ ณ ตอนนั้น)
// timestampFn: เดิมตั้งใจไว้ให้ส่ง serverTimestamp() ของ Firestore เข้ามา แต่ "at" ด้านล่างนี้อยู่ใน
// array (a.steps) ซึ่ง Firestore ไม่รองรับ serverTimestamp() ภายใน array (จะได้ FirebaseError:
// "serverTimestamp() is not currently supported inside arrays" ตอนบันทึกจริง) จึงต้องใช้เวลาฝั่ง
// client (new Date()) แทนเสมอสำหรับฟิลด์นี้โดยเฉพาะ — ไม่ใช้ timestampFn ที่รับเข้ามาแล้ว (คงพารามิเตอร์
// นี้ไว้เพื่อไม่ต้องแก้ทุกจุดที่เรียกใช้ฟังก์ชันนี้)
export function approveApprovalStep(approval, actorName, note, timestampFn) {
  const a = ensureApproval(approval);
  if (a.status !== APPROVAL_STATUS.IN_PROGRESS) return a;
  const idx = a.steps.findIndex((s) => s.step === a.currentStep);
  if (idx === -1) return a;
  const ts = new Date();
  a.steps[idx] = {
    ...a.steps[idx],
    status: "approved",
    by: (actorName || "").trim(),
    at: ts,
    note: (note || "").trim(),
  };
  if (a.currentStep >= APPROVAL_STEP_DEFS.length) {
    a.status = APPROVAL_STATUS.APPROVED;
  } else {
    a.currentStep = a.currentStep + 1;
  }
  return a;
}

// ปฏิเสธขั้นตอนปัจจุบัน — จบกระบวนการทันที (ไม่ไปต่อขั้นถัดไป)
// (ดูหมายเหตุเรื่อง serverTimestamp() ใน array ที่ approveApprovalStep ด้านบน — ใช้เหตุผลเดียวกัน)
export function rejectApprovalStep(approval, actorName, note, timestampFn) {
  const a = ensureApproval(approval);
  if (a.status !== APPROVAL_STATUS.IN_PROGRESS) return a;
  const idx = a.steps.findIndex((s) => s.step === a.currentStep);
  if (idx === -1) return a;
  const ts = new Date();
  a.steps[idx] = {
    ...a.steps[idx],
    status: "rejected",
    by: (actorName || "").trim(),
    at: ts,
    note: (note || "").trim(),
  };
  a.status = APPROVAL_STATUS.REJECTED;
  return a;
}

// เมื่อแก้ไข/ส่งใหม่หลังถูกปฏิเสธ (หรือกรณีอื่นที่ต้องการเริ่มกระบวนการใหม่) — รีเซ็ตกลับขั้นตอนที่ 1 เสมอ
export function resetApprovalForResubmit() {
  return createFreshApproval();
}

function stepLabel(def, lang) {
  if (lang === "th") return def.labelTh;
  if (lang === "zh") return def.labelZh;
  return `${def.labelEn} / ${def.labelTh} / ${def.labelZh}`;
}

function fmtStepAt(at) {
  if (!at) return "";
  try {
    // Firestore serverTimestamp() ที่ยังไม่ resolve (pending) จะไม่มี .value/.toDate — กันไว้เผื่อรูปแบบต่าง ๆ
    if (typeof at === "string") return new Date(at).toLocaleString("th-TH");
    if (at.toDate) return at.toDate().toLocaleString("th-TH");
    if (at.value) return new Date(at.value).toLocaleString("th-TH");
  } catch (e) {
    return "";
  }
  return "";
}

// สร้าง HTML แสดงแถบขั้นตอนอนุมัติ 4 ขั้น (ใช้ได้ทั้งหน้าแอดมิน/หน้าอนุมัติสาธารณะ/หน้าพิมพ์เอกสาร)
// opts: { lang: "th"|"en"|"all", compact: bool, escapeHtml: fn (จำเป็นถ้าจะแสดง note ที่มาจาก user input) }
export function renderApprovalStepper(approval, opts = {}) {
  const a = ensureApproval(approval);
  const esc = typeof opts.escapeHtml === "function" ? opts.escapeHtml : (s) => String(s == null ? "" : s);
  const lang = opts.lang || "all";

  const stepsHtml = APPROVAL_STEP_DEFS.map((def, i) => {
    const s = a.steps.find((x) => x.step === def.step) || { status: "pending", by: "", at: null, note: "" };
    let stateClass = "approval-step-pending";
    if (s.status === "approved") stateClass = "approval-step-approved";
    else if (s.status === "rejected") stateClass = "approval-step-rejected";
    else if (a.status === APPROVAL_STATUS.IN_PROGRESS && a.currentStep === def.step) stateClass = "approval-step-current";

    const byLine = s.by
      ? `<div class="approval-step-by">${s.status === "approved" ? "✅" : s.status === "rejected" ? "❌" : ""} ${esc(s.by)}</div>`
      : "";
    const atLine = s.at ? `<div class="approval-step-at">${esc(fmtStepAt(s.at))}</div>` : "";
    const noteLine = s.note ? `<div class="approval-step-note">"${esc(s.note)}"</div>` : "";
    const arrow = i < APPROVAL_STEP_DEFS.length - 1 ? `<div class="approval-step-arrow">→</div>` : "";

    return `
      <div class="approval-step ${stateClass}">
        <div class="approval-step-icon">${def.icon}</div>
        <div class="approval-step-label">${esc(stepLabel(def, lang))}</div>
        ${byLine}
        ${atLine}
        ${noteLine}
      </div>
      ${arrow}
    `;
  }).join("");

  let overallClass = "approval-overall-progress";
  let overallText =
    lang === "th"
      ? `กำลังรออนุมัติ — ขั้นตอนที่ ${a.currentStep}/4`
      : `In progress — Step ${a.currentStep}/4 / กำลังรออนุมัติ ขั้นตอนที่ ${a.currentStep}/4`;
  if (a.status === APPROVAL_STATUS.APPROVED) {
    overallClass = "approval-overall-approved";
    overallText = lang === "th" ? "✅ อนุมัติครบทุกขั้นตอนแล้ว" : "✅ Approved — All 4 steps complete / อนุมัติครบทุกขั้นตอนแล้ว";
  } else if (a.status === APPROVAL_STATUS.REJECTED) {
    overallClass = "approval-overall-rejected";
    overallText = lang === "th" ? "❌ ถูกปฏิเสธ — ต้องแก้ไขแล้วส่งใหม่" : "❌ Rejected — Please revise and resubmit / ถูกปฏิเสธ ต้องแก้ไขแล้วส่งใหม่";
  }

  return `
    <div class="approval-stepper">
      <div class="approval-overall ${overallClass}">${overallText}</div>
      <div class="approval-steps-row">${stepsHtml}</div>
    </div>
  `;
}
