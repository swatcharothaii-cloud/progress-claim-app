import { COMPANY, CONTRACTOR_JOB_TYPE, CONTRACTOR_JOB_TYPE_STYLE, CONTRACTOR_JOB_STATUS } from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai } from "./utils.js";
import { T, jobTypeTri, contractorJobStatusTri } from "./i18n.js";
import { watchContractorJob, approveJobPublic, rejectJobPublic } from "./contractor-jobs.js";

renderCompanyBrandBar("brand-bar", COMPANY);

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

const params = new URLSearchParams(window.location.search);
const jobDocId = params.get("job") || "";
const contentEl = document.getElementById("job-content");

let currentJob = null;
let submitting = false;

if (!jobDocId) {
  contentEl.innerHTML = `<div class="hint" style="color:var(--danger);">${T.contractorJobNotFound}</div>`;
} else {
  watchContractorJob(
    jobDocId,
    (job) => {
      currentJob = job;
      render();
    },
    () => showToast(T.msgConnectFailCheckInternet)
  );
}

function render() {
  if (!currentJob) {
    contentEl.innerHTML = `<div class="hint" style="color:var(--danger);">${T.contractorJobNotFound}</div>`;
    return;
  }
  const job = currentJob;
  const photosHtml = (job.images || [])
    .map((img, i) => `<img src="${img.url}" data-idx="${i}" title="${T.clickToViewPhoto || ""}">`)
    .join("");

  const isFixLike = job.type !== CONTRACTOR_JOB_TYPE.QUOTE; // fix และ defect ใช้ข้อมูลชุดเดียวกัน
  const typeStyle = CONTRACTOR_JOB_TYPE_STYLE[job.type] || CONTRACTOR_JOB_TYPE_STYLE[CONTRACTOR_JOB_TYPE.FIX];

  const responseHtml =
    job.status === CONTRACTOR_JOB_STATUS.CONFIRMED
      ? isFixLike
        ? `<div class="meta" style="margin-top:8px;">📅 ${T.contractorSiteVisitDateLabel}: ${formatDateThai(job.siteVisitDate)}</div>
           <div class="meta">⏱️ ${T.contractorRepairDaysLabel}: ${job.repairDays ?? "-"}</div>`
        : `<div class="meta" style="margin-top:8px;">⏱️ ${T.contractorQuoteDaysLabel}: ${job.quoteDays ?? "-"}</div>
           <div class="meta">💰 ${T.contractorQuotePriceLabel}: ฿${Number(job.quotePrice || 0).toLocaleString("th-TH")}</div>
           ${job.quoteNote ? `<div class="meta">📝 ${T.contractorQuoteNoteLabel}: ${escapeHtml(job.quoteNote)}</div>` : ""}`
      : "";

  const defectBanner =
    job.type === CONTRACTOR_JOB_TYPE.DEFECT && job.defectRound
      ? `<div class="card" style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; font-weight:700; margin-bottom:12px;">
          ⚠️ ${T.contractorDefectRoundPrefix} ${escapeHtml(String(job.defectRound))}
        </div>`
      : "";

  let actionHtml = "";
  if (job.status === CONTRACTOR_JOB_STATUS.WAITING) {
    actionHtml = `<div class="card" style="background:#fef3c7; margin-top:16px;"><strong>⏳ Waiting for the contractor to respond first / รอผู้รับเหมาตอบรับงานนี้ก่อน / 等待承包商先回复此工程</strong></div>`;
  } else if (job.status === CONTRACTOR_JOB_STATUS.REJECTED) {
    actionHtml = `<div class="card" style="background:#fee2e2; margin-top:16px;"><strong>❌ The contractor rejected this job — nothing to approve / ผู้รับเหมาปฏิเสธงานนี้แล้ว ไม่มีอะไรให้อนุมัติ / 承包商已拒绝此工程，无需批准</strong></div>`;
  } else if (job.approvalStatus === "approved") {
    actionHtml = `<div class="card" style="background:#d1fae5; margin-top:16px;">
        <strong>✅ Approved / อนุมัติแล้ว / 已批准</strong>
        ${job.approvedBy ? `<div class="meta" style="margin-top:6px;">By / โดย / 批准人: ${escapeHtml(job.approvedBy)}</div>` : ""}
      </div>`;
  } else if (job.approvalStatus === "rejected") {
    actionHtml = `<div class="card" style="background:#fee2e2; margin-top:16px;">
        <strong>❌ Rejected / ปฏิเสธ / 已拒绝</strong>
        ${job.approvedBy ? `<div class="meta" style="margin-top:6px;">By / โดย / 处理人: ${escapeHtml(job.approvedBy)}</div>` : ""}
      </div>`;
  } else {
    // job.status === CONFIRMED และยังไม่เคยอนุมัติ/ปฏิเสธ (approvalStatus ว่างหรือ "pending")
    actionHtml = `
      <div class="card" style="margin-top:16px;">
        <div class="field">
          <label>Your name (optional) / ชื่อผู้อนุมัติ (ไม่บังคับ) / 审批人姓名（可选）</label>
          <input type="text" id="approver-name" placeholder="e.g. K.Eddie">
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary btn-block" id="approve-job-btn">✅ Approve / อนุมัติ / 批准</button>
          <button class="btn btn-outline btn-block" id="reject-job-btn">❌ Reject / ปฏิเสธ / 拒绝</button>
        </div>
      </div>`;
  }

  contentEl.innerHTML = `
    ${defectBanner}
    <span class="badge" style="background:${typeStyle.bg}; color:${typeStyle.text}; border:1px solid ${typeStyle.border}; font-weight:700; margin-bottom:10px;">${typeStyle.icon} ${jobTypeTri(job.type)}</span>
    <h3 style="margin:8px 0 4px;">${escapeHtml(job.siteName || job.project || "-")}</h3>
    ${job.project ? `<div class="meta">📍 Project / โปรเจกต์ / 项目: ${escapeHtml(job.project)}</div>` : ""}
    ${job.contractorName ? `<div class="meta">👷 Contractor / ผู้รับเหมา / 承包商: ${escapeHtml(job.contractorName)}</div>` : ""}
    <div class="meta" style="margin-top:6px;">Job status / สถานะงาน / 工程状态: ${contractorJobStatusTri(job.status)}</div>
    <div class="desc" style="margin-top:10px;">${escapeHtml(job.description || "")}</div>
    ${responseHtml}
    ${photosHtml ? `<div class="meta" style="margin-top:12px;">🖼️ Photos / รูปภาพ / 照片</div><div class="ticket-thumbs">${photosHtml}</div>` : ""}
    <div id="job-approval-action"></div>
  `;

  contentEl.querySelectorAll(".ticket-thumbs img").forEach((img) => {
    img.addEventListener("click", () => openLightbox(job.images, Number(img.dataset.idx)));
  });

  document.getElementById("job-approval-action").innerHTML = actionHtml;
  wireActionHandlers(job);
}

function wireActionHandlers(job) {
  const approveBtn = document.getElementById("approve-job-btn");
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      if (submitting) return;
      submitting = true;
      const name = document.getElementById("approver-name").value.trim();
      try {
        await approveJobPublic(job.id, name);
        showToast("Approved / อนุมัติแล้ว / 已批准");
      } catch (e) {
        console.error(e);
        showToast(T.errorPrefix + e.message);
      } finally {
        submitting = false;
      }
    });
  }

  const rejectBtn = document.getElementById("reject-job-btn");
  if (rejectBtn) {
    rejectBtn.addEventListener("click", async () => {
      if (submitting) return;
      if (!confirm("Reject this job? / ยืนยันการปฏิเสธงานนี้? / 确认拒绝此工程？")) return;
      submitting = true;
      const name = document.getElementById("approver-name").value.trim();
      try {
        await rejectJobPublic(job.id, name);
        showToast("Rejected / ปฏิเสธแล้ว / 已拒绝");
      } catch (e) {
        console.error(e);
        showToast(T.errorPrefix + e.message);
      } finally {
        submitting = false;
      }
    });
  }
}

// ============ Image Lightbox ============
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
document.getElementById("lightbox-close").addEventListener("click", () => (lightboxModal.style.display = "none"));
document.getElementById("lightbox-prev").addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  renderLightbox();
});
document.getElementById("lightbox-next").addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % currentImages.length;
  renderLightbox();
});
lightboxModal.addEventListener("click", (e) => {
  if (e.target === lightboxModal) lightboxModal.style.display = "none";
});
