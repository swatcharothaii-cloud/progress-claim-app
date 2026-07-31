// delivery-note.js — หน้าฟอร์มใบส่งมอบงานแยกต่างหาก (เปิดจากลิงก์ 📦 ในหน้า Purchase Order Archive)
// ทำเป็นเอกสารเต็มหน้าแยกจากหน้าแอดมินหลัก ให้หน้าตาเป็นทางการเหมือนเอกสารจริง ไม่ใช่แค่ popup เล็กๆ
import { ADMINS, COMPANY, MAX_IMAGES, MAX_IMAGE_MB } from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, formatMoney, escapeHtml, todayStr } from "./utils.js";
import { compressImageToDataUrl } from "./image-compress.js";
import { getLegacyPoById, updateLegacyPoDeliveryNote, approveLegacyPoDeliveryStep, rejectLegacyPoDeliveryStep } from "./legacy-po.js";
import { ensureApproval, renderApprovalStepper, APPROVAL_STATUS, APPROVAL_STEP_DEFS } from "./approval.js";

renderCompanyBrandBar("brand-bar", COMPANY);

// ============================================================
//  ต้องเลือกตัวตน (identity) จากหน้า admin.html มาก่อนเสมอ — ใช้ localStorage เดียวกัน
//  ถ้ายังไม่ได้เลือก ให้เด้งกลับไปหน้า admin.html ให้เลือกก่อน แล้วค่อยกดลิงก์ 📦 เข้ามาใหม่
// ============================================================
const IDENTITY_KEY = "progressClaimAdminIdentity";
function getIdentity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
    if (parsed && ADMINS.some((a) => a.id === parsed.id)) return parsed;
  } catch (e) {}
  return null;
}
const currentAdmin = getIdentity();
if (!currentAdmin) {
  location.href = "admin.html";
}

const poId = new URLSearchParams(location.search).get("id");
let po = null;
let photos = []; // [{ url, description, percent, passed: "passed"|"failed"|"" }]
// เก็บ snapshot ของเนื้อหาล่าสุดที่บันทึกไว้ — ใช้เช็คว่ามีการแก้ไขเนื้อหาจริงหรือไม่ก่อนบันทึก
// (ปุ่ม "พิมพ์" จะเรียก save() ก่อนเสมอเพื่อไม่ให้ข้อมูลที่เพิ่งแก้หาย แต่ถ้าไม่มีอะไรเปลี่ยนเลย
// ก็ไม่ควรรีเซ็ตกระบวนการอนุมัติที่เพิ่งอนุมัติเสร็จไปโดยไม่ได้ตั้งใจ)
let lastSavedSnapshot = "";

async function init() {
  if (!currentAdmin) return; // กำลังจะ redirect อยู่แล้วด้านบน
  if (!poId) {
    document.getElementById("loading-state").textContent = "Missing PO id / ไม่พบรหัส PO ในลิงก์ / 链接缺少PO编号";
    return;
  }
  try {
    po = await getLegacyPoById(poId);
  } catch (e) {
    console.error(e);
    document.getElementById("loading-state").textContent = "Failed to load / โหลดข้อมูลไม่สำเร็จ / 加载失败";
    return;
  }
  if (!po) {
    document.getElementById("loading-state").textContent = "PO not found / ไม่พบใบสั่งซื้อนี้ / 未找到该采购单";
    return;
  }
  photos = (po.deliveryPhotos || []).map((ph) => ({ ...ph }));
  renderHeader();
  renderPhotoList();
  renderApprovalSection();
  lastSavedSnapshot = JSON.stringify(collectFormData());
  document.getElementById("loading-state").style.display = "none";
  document.getElementById("dn-form").style.display = "block";
}

function renderHeader() {
  document.title = `Delivery Note / ใบส่งมอบงาน — ${po.poNumber || ""}`;
  document.getElementById("dn-subtitle").textContent = `${po.contractorNickname || ""} — ${po.vendorName || ""}`;
  document.getElementById("dn-po-number").textContent = po.poNumber || "-";
  document.getElementById("dn-issue-date").textContent = formatDateThai(po.issueDate);
  document.getElementById("dn-project").textContent = po.project || "-";
  document.getElementById("dn-total").innerHTML = `<b>฿${po.totalAmount != null ? Number(po.totalAmount).toLocaleString("th-TH") : "-"}</b>`;
  document.getElementById("dn-status").textContent = po.status || "-";
  document.getElementById("dn-delivery-date").value = po.deliveryDate || todayStr();
}

// แสดงแถบขั้นตอนอนุมัติ 4 ขั้น + ปุ่มอนุมัติ/ปฏิเสธขั้นตอนปัจจุบัน (ใครก็ได้ที่ล็อกอินอยู่กดแทนขั้นตอนไหนก็ได้)
function renderApprovalSection() {
  const el = document.getElementById("dn-approval-section");
  if (!el) return;
  const approval = ensureApproval(po.approval);
  const stepperHtml = renderApprovalStepper(approval, { lang: "all", escapeHtml });
  let actionsHtml = "";
  if (approval.status === APPROVAL_STATUS.IN_PROGRESS) {
    const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
    actionsHtml = `
      <div class="approval-actions">
        <button class="btn btn-primary" id="dn-approve-step-btn">✅ Approve step ${approval.currentStep}/4 (${stepDef?.labelTh}) as "${escapeHtml(currentAdmin?.name || "")}"</button>
        <button class="btn btn-outline" id="dn-reject-step-btn">❌ Reject step ${approval.currentStep}/4 (${stepDef?.labelTh})</button>
      </div>`;
  }
  el.innerHTML = stepperHtml + actionsHtml;

  const approveBtn = document.getElementById("dn-approve-step-btn");
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      if (!confirm(`Approve this step as "${currentAdmin?.name}"? / ยืนยันอนุมัติขั้นตอนนี้ในนาม "${currentAdmin?.name}"?`)) return;
      try {
        po.approval = await approveLegacyPoDeliveryStep(poId, currentAdmin?.name, "");
        showToast("บันทึกแล้ว / Saved / 已保存");
        renderApprovalSection();
      } catch (e) {
        console.error(e);
        showToast("บันทึกไม่สำเร็จ / Save failed / 保存失败");
      }
    });
  }
  const rejectBtn = document.getElementById("dn-reject-step-btn");
  if (rejectBtn) {
    rejectBtn.addEventListener("click", async () => {
      const note = prompt("Reason for rejection (optional) / เหตุผลที่ปฏิเสธ (ถ้ามี):", "") || "";
      if (!confirm(`Reject this step? The process will end and it must be revised and resubmitted from step 1. / ยืนยันปฏิเสธ? กระบวนการจะจบทันที ต้องแก้ไขแล้วส่งใหม่ตั้งแต่ขั้นตอนที่ 1`)) return;
      try {
        po.approval = await rejectLegacyPoDeliveryStep(poId, currentAdmin?.name, note);
        showToast("บันทึกแล้ว / Saved / 已保存");
        renderApprovalSection();
      } catch (e) {
        console.error(e);
        showToast("บันทึกไม่สำเร็จ / Save failed / 保存失败");
      }
    });
  }
}

function renderPhotoList() {
  const wrap = document.getElementById("dn-photo-list");
  if (!photos.length) {
    wrap.innerHTML = `<div class="hint" style="padding:10px 0;">No photos yet — add some above / ยังไม่มีรูปภาพ เพิ่มได้จากด้านบน / 暂无照片，请在上方添加</div>`;
    return;
  }
  wrap.innerHTML = photos
    .map(
      (ph, i) => `
    <div class="legacy-delivery-photo-item" data-idx="${i}">
      <img src="${ph.url}" class="ldp-thumb" data-idx="${i}">
      <div class="legacy-delivery-photo-fields">
        <textarea class="ldp-desc" data-idx="${i}" rows="2" placeholder="คำอธิบายภาพ / Photo description / 图片说明">${escapeHtml(ph.description || "")}</textarea>
        <div class="legacy-delivery-photo-row">
          <label class="hint" style="margin:0;">% งาน / Progress</label>
          <input type="number" class="ldp-percent" data-idx="${i}" min="0" max="100" value="${ph.percent ?? ""}" style="width:80px;">
          <label class="hint" style="margin:0;">สถานะ / Status</label>
          <select class="ldp-status" data-idx="${i}">
            <option value="" ${!ph.passed ? "selected" : ""}>⏳ ยังไม่ตรวจ / Not inspected</option>
            <option value="passed" ${ph.passed === "passed" ? "selected" : ""}>✅ ผ่าน / Passed</option>
            <option value="failed" ${ph.passed === "failed" ? "selected" : ""}>❌ ไม่ผ่าน / Failed</option>
          </select>
          <button type="button" class="btn btn-sm ldp-remove" data-idx="${i}" style="margin-left:auto; background:#fee2e2; color:#991b1b;">🗑️</button>
        </div>
      </div>
    </div>`
    )
    .join("");

  wrap.querySelectorAll(".ldp-thumb").forEach((img) => {
    img.addEventListener("click", () => openLightbox(photos, Number(img.dataset.idx)));
  });
  wrap.querySelectorAll(".ldp-desc").forEach((el) => {
    el.addEventListener("input", () => {
      photos[Number(el.dataset.idx)].description = el.value;
    });
  });
  wrap.querySelectorAll(".ldp-percent").forEach((el) => {
    el.addEventListener("input", () => {
      photos[Number(el.dataset.idx)].percent = el.value === "" ? "" : Number(el.value);
    });
  });
  wrap.querySelectorAll(".ldp-status").forEach((el) => {
    el.addEventListener("change", () => {
      photos[Number(el.dataset.idx)].passed = el.value;
    });
  });
  wrap.querySelectorAll(".ldp-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      photos.splice(Number(btn.dataset.idx), 1);
      renderPhotoList();
    });
  });
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  if (photos.length + files.length > MAX_IMAGES) {
    showToast(`Max ${MAX_IMAGES} images / สูงสุด ${MAX_IMAGES} รูป / 最多 ${MAX_IMAGES} 张`);
  }
  const room = Math.max(0, MAX_IMAGES - photos.length);
  for (const file of files.slice(0, room)) {
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) continue;
    try {
      const url = await compressImageToDataUrl(file);
      photos.push({ url, description: "", percent: "", passed: "" });
    } catch (err) {
      console.error(err);
    }
  }
  renderPhotoList();
  e.target.value = "";
}

function collectFormData() {
  return {
    deliveryPhotos: photos,
    deliveryDate: document.getElementById("dn-delivery-date").value || "",
  };
}

// บันทึกเนื้อหาใบส่งมอบงาน (รูปภาพ/วันที่ส่งมอบ) — ถ้าเนื้อหาเปลี่ยนไปจริงจากที่บันทึกไว้ล่าสุด จะเริ่ม
// กระบวนการอนุมัติ 4 ขั้นตอนใหม่เสมอ (ตามที่ตกลงกันไว้: แก้ไขแล้วต้องส่งใหม่ตั้งแต่ขั้นตอนที่ 1)
// ถ้าเนื้อหาไม่ได้เปลี่ยนเลย (เช่นกดปุ่ม "พิมพ์" ซึ่งเรียก save() ก่อนเสมอ) จะไม่บันทึกซ้ำ/ไม่รีเซ็ตการอนุมัติที่ทำไปแล้ว
async function save() {
  const formData = collectFormData();
  const snapshot = JSON.stringify(formData);
  if (snapshot === lastSavedSnapshot) return true; // ไม่มีอะไรเปลี่ยน — ไม่ต้องบันทึกซ้ำ ไม่กระทบการอนุมัติที่มีอยู่
  try {
    await updateLegacyPoDeliveryNote(poId, formData, currentAdmin?.name);
    lastSavedSnapshot = snapshot;
    po = await getLegacyPoById(poId);
    renderApprovalSection();
    return true;
  } catch (err) {
    console.error(err);
    showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง / Save failed, please try again / 保存失败，请重试");
    return false;
  }
}

// ============================================================
//  พิมพ์เอกสารใบส่งมอบงาน (A4 แนวตั้ง) — บันทึกก่อนเสมอเพื่อไม่ให้ข้อมูลที่เพิ่งแก้หายไป
// ============================================================
function setPrintPage(orientation, marginMm = 10) {
  let styleEl = document.getElementById("dynamic-print-page-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-page-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: ${marginMm}mm; } }`;
}

function buildPrintHtml() {
  const dash = `<span class="dn-empty-note">-</span>`;
  const val = (v) => (v === null || v === undefined || v === "" ? dash : escapeHtml(String(v)));
  const data = collectFormData();
  const row2 = (labelA, valueA, labelB, valueB) => `
    <tr>
      <td class="dn-label">${labelA}</td>
      <td class="dn-value">${valueA}</td>
      <td class="dn-label-2">${labelB}</td>
      <td class="dn-value">${valueB}</td>
    </tr>`;

  const statusHtml = (passed) =>
    passed === "passed"
      ? `<span class="dn-photo-status-passed">✅ Passed / ผ่าน</span>`
      : passed === "failed"
      ? `<span class="dn-photo-status-failed">❌ Failed / ไม่ผ่าน</span>`
      : `<span class="dn-photo-status-pending">⏳ Not inspected / ยังไม่ตรวจ</span>`;

  const photosSection = (photos || []).length
    ? `<div class="dn-section-title">📷 Delivery photos / ภาพส่งมอบงาน (${photos.length})</div>
       <div class="dn-photos-wrap">
         <div class="dn-photos-grid">
           ${photos
             .map(
               (ph, i) => `
             <div class="dn-photo-card">
               <img class="print-thumb" src="${ph.url}">
               <div class="dn-photo-caption"><b>#${i + 1}</b> ${val(ph.description)}</div>
               <div class="dn-photo-caption"><span class="dn-photo-percent">${ph.percent !== "" && ph.percent != null ? `${escapeHtml(String(ph.percent))}%` : dash}</span></div>
               <div class="dn-photo-caption">${statusHtml(ph.passed)}</div>
             </div>`
             )
             .join("")}
         </div>
       </div>`
    : `<div class="dn-section-title">📷 Delivery photos / ภาพส่งมอบงาน</div><div style="padding:14px;" class="hint">No photos / ยังไม่มีรูปภาพ</div>`;

  return `
    <div class="print-report-header">
      ${COMPANY?.logo ? `<img src="${COMPANY.logo}">` : ""}
      <div class="titles">
        <h1>${escapeHtml(COMPANY?.nameTh || "")}</h1>
        <div class="sub">${escapeHtml(COMPANY?.nameEn || "")}</div>
      </div>
    </div>

    <div class="dn-doc">
      <div class="dn-doc-title-bar">
        <div class="dn-doc-title">
          Delivery Note / ใบส่งมอบงาน
          <span class="sub">${escapeHtml(po.contractorNickname || "")} — ${escapeHtml(po.vendorName || "")}</span>
        </div>
        <div class="dn-doc-no">
          PO No. / เลขที่ PO
          <b>${escapeHtml(po.poNumber || "-")}</b>
        </div>
      </div>

      <div class="dn-section-title">🗂️ PO Information / ข้อมูล PO</div>
      <table class="dn-table">
        ${row2("Issue date<br>วันที่ออก", formatDateThai(po.issueDate), "Project<br>โปรเจกต์", val(po.project))}
        ${row2("Total<br>มูลค่ารวม", `<b>฿${po.totalAmount != null ? Number(po.totalAmount).toLocaleString("th-TH") : "-"}</b>`, "Delivery date<br>วันที่ส่งมอบ", data.deliveryDate ? formatDateThai(data.deliveryDate) : dash)}
      </table>

      ${photosSection}

      <div class="dn-section-title">✍️ Acceptance / การตรวจรับ (4 ขั้นตอน)</div>
      ${renderApprovalStepper(ensureApproval(po.approval), { lang: "all", escapeHtml })}
    </div>
  `;
}

document.getElementById("dn-images").addEventListener("change", handleImageSelect);
document.getElementById("save-btn").addEventListener("click", async () => {
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  const ok = await save();
  btn.disabled = false;
  if (ok) showToast("บันทึกแล้ว / Saved / 已保存");
});
document.getElementById("print-btn").addEventListener("click", async () => {
  const btn = document.getElementById("print-btn");
  btn.disabled = true;
  const ok = await save();
  btn.disabled = false;
  if (!ok) return;
  document.getElementById("print-report").innerHTML = buildPrintHtml();
  setPrintPage("portrait", 10); // ใบส่งมอบงาน = เอกสารเดี่ยว พิมพ์แนวตั้ง A4
  showToast("Use your browser's print dialog to save as PDF / ใช้หน้าต่างพิมพ์ของเบราว์เซอร์เพื่อบันทึกเป็น PDF / 请使用浏览器打印对话框另存为 PDF");
  setTimeout(() => window.print(), 300);
});

// ============================================================
//  IMAGE LIGHTBOX (ย่อจากของหน้า admin.js มาใช้ในหน้านี้โดยเฉพาะ)
// ============================================================
let currentImages = [];
let currentIndex = 0;
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCounter = document.getElementById("lightbox-counter");

function openLightbox(images, startIndex) {
  currentImages = images || [];
  currentIndex = startIndex || 0;
  if (!currentImages.length) return;
  renderLightbox();
  lightboxModal.style.display = "flex";
}
function renderLightbox() {
  lightboxImg.src = currentImages[currentIndex]?.url || "";
  lightboxCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
}
function closeLightbox() {
  lightboxModal.style.display = "none";
}
document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
document.getElementById("lightbox-prev").addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  renderLightbox();
});
document.getElementById("lightbox-next").addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % currentImages.length;
  renderLightbox();
});
lightboxModal.addEventListener("click", (e) => {
  if (e.target === lightboxModal) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (lightboxModal.style.display !== "flex") return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") document.getElementById("lightbox-prev").click();
  if (e.key === "ArrowRight") document.getElementById("lightbox-next").click();
});

init();
