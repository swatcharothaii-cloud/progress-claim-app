import { COMPANY, CONTRACTOR_JOB_TYPE, CONTRACTOR_JOB_TYPE_STYLE, CONTRACTOR_JOB_STATUS } from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, todayStr } from "./utils.js";
import { T, jobTypeTri, contractorJobStatusTri } from "./i18n.js";
import { watchContractorJob, respondFixJob, acceptQuoteJob, rejectJob } from "./contractor-jobs.js";

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
// true เมื่อผู้รับเหมากด "รับงาน" แล้ว กำลังจะกรอกรายละเอียด (ใช้ร่วมกันทั้ง fix/defect/quote)
let showResponseForm = false;

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
  const isFixLike = job.type !== CONTRACTOR_JOB_TYPE.QUOTE; // fix และ defect ใช้ฟอร์มเดียวกัน
  const typeStyle = CONTRACTOR_JOB_TYPE_STYLE[job.type] || CONTRACTOR_JOB_TYPE_STYLE[CONTRACTOR_JOB_TYPE.FIX];
  const photosHtml = (job.images || [])
    .map((img, i) => `<img src="${img.url}" data-idx="${i}" title="${T.clickToViewPhoto || ""}">`)
    .join("");

  let actionHtml = "";
  if (job.status === CONTRACTOR_JOB_STATUS.WAITING) {
    if (!showResponseForm) {
      actionHtml = acceptRejectGateHtml();
    } else if (isFixLike) {
      actionHtml = fixFormHtml(job);
    } else {
      actionHtml = quoteFormHtml();
    }
  } else if (job.status === CONTRACTOR_JOB_STATUS.CONFIRMED) {
    actionHtml = isFixLike
      ? `<div class="card" style="background:#d1fae5; border:1px solid #6ee7b7; margin-top:16px;">
            <strong>✅ ${T.contractorSubmittedThanks}</strong>
            <div class="meta" style="margin-top:8px;">📅 ${T.contractorSiteVisitDateLabel}: ${formatDateThai(job.siteVisitDate)}</div>
            <div class="meta">⏱️ ${T.contractorRepairDaysLabel}: ${job.repairDays}</div>
          </div>`
      : `<div class="card" style="background:#d1fae5; border:1px solid #6ee7b7; margin-top:16px;">
            <strong>✅ ${T.contractorSubmittedThanks}</strong>
            <div class="meta" style="margin-top:8px;">⏱️ ${T.contractorQuoteDaysLabel}: ${job.quoteDays}</div>
            <div class="meta">💰 ${T.contractorQuotePriceLabel}: ฿${Number(job.quotePrice || 0).toLocaleString("th-TH")}</div>
            ${job.quoteNote ? `<div class="meta">📝 ${T.contractorQuoteNoteLabel}: ${escapeHtml(job.quoteNote)}</div>` : ""}
          </div>`;
  } else if (job.status === CONTRACTOR_JOB_STATUS.REJECTED) {
    actionHtml = `<div class="card" style="background:#fee2e2; border:1px solid #fca5a5; margin-top:16px;"><strong>❌ ${T.contractorRejectedMsg}</strong></div>`;
  } else {
    actionHtml = `<div class="card" style="background:#dbeafe; border:1px solid #93c5fd; margin-top:16px;"><strong>🏁 ${contractorJobStatusTri(job.status)}</strong></div>`;
  }

  const defectBanner =
    job.type === CONTRACTOR_JOB_TYPE.DEFECT && job.defectRound
      ? `<div class="card" style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; font-weight:700; margin-bottom:12px;">
          ⚠️ ${T.contractorDefectRoundPrefix} ${escapeHtml(String(job.defectRound))}
        </div>`
      : "";

  contentEl.innerHTML = `
    ${defectBanner}
    <span class="badge" style="background:${typeStyle.bg}; color:${typeStyle.text}; border:1px solid ${typeStyle.border}; font-weight:700; margin-bottom:10px;">${typeStyle.icon} ${jobTypeTri(job.type)}</span>
    <h3 style="margin:8px 0 4px;">${escapeHtml(job.siteName || job.project || "-")}</h3>
    ${job.project ? `<div class="meta">📍 Project / โปรเจกต์ / 项目: ${escapeHtml(job.project)}</div>` : ""}
    <div class="desc" style="margin-top:10px;">${escapeHtml(job.description || "")}</div>
    ${photosHtml ? `<div class="meta" style="margin-top:12px;">🖼️ Photos / รูปภาพ / 照片</div><div class="ticket-thumbs">${photosHtml}</div>` : ""}
    <div id="job-action"></div>
  `;

  contentEl.querySelectorAll(".ticket-thumbs img").forEach((img) => {
    img.addEventListener("click", () => openLightbox(job.images, Number(img.dataset.idx)));
  });

  document.getElementById("job-action").innerHTML = actionHtml;
  wireActionHandlers(job);
}

function acceptRejectGateHtml() {
  return `
    <div class="card" style="margin-top:16px;">
      <div class="hint" style="margin-bottom:10px;">${T.contractorAwaitingResponseMsg}</div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary btn-block" id="accept-job-btn">✅ ${T.contractorAcceptBtn}</button>
        <button class="btn btn-outline btn-block" id="reject-job-btn">❌ ${T.contractorRejectBtn}</button>
      </div>
    </div>
  `;
}

function fixFormHtml(job) {
  return `
    <div class="card" style="margin-top:16px;">
      <div class="field">
        <label>📅 ${T.contractorSiteVisitDateLabel}</label>
        <input type="date" id="f-visit-date" value="${job.siteVisitDate || todayStr()}">
      </div>
      <div class="field">
        <label>⏱️ ${T.contractorRepairDaysLabel}</label>
        <input type="number" id="f-repair-days" min="1" step="1" placeholder="e.g. 3">
      </div>
      <button class="btn btn-primary btn-block" id="submit-fix-btn">${T.contractorSubmitBtn}</button>
    </div>
  `;
}

function quoteFormHtml() {
  return `
    <div class="card" style="margin-top:16px;">
      <div class="field">
        <label>⏱️ ${T.contractorQuoteDaysLabel}</label>
        <input type="number" id="f-quote-days" min="1" step="1" placeholder="e.g. 5">
      </div>
      <div class="field">
        <label>💰 ${T.contractorQuotePriceLabel}</label>
        <input type="number" id="f-quote-price" min="0" step="0.01" placeholder="e.g. 25000">
      </div>
      <div class="field">
        <label>📝 ${T.contractorQuoteNoteLabel}</label>
        <textarea id="f-quote-note" rows="2"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="submit-quote-btn">${T.contractorSubmitBtn}</button>
    </div>
  `;
}

function wireActionHandlers(job) {
  const acceptBtn = document.getElementById("accept-job-btn");
  if (acceptBtn) {
    acceptBtn.addEventListener("click", () => {
      showResponseForm = true;
      render();
    });
  }

  const rejectBtn = document.getElementById("reject-job-btn");
  if (rejectBtn) {
    rejectBtn.addEventListener("click", async () => {
      if (!confirm(T.contractorRejectBtn + "?")) return;
      try {
        await rejectJob(job.id);
      } catch (e) {
        console.error(e);
        showToast(T.errorPrefix + e.message);
      }
    });
  }

  const fixBtn = document.getElementById("submit-fix-btn");
  if (fixBtn) {
    fixBtn.addEventListener("click", async () => {
      const siteVisitDate = document.getElementById("f-visit-date").value;
      const repairDays = document.getElementById("f-repair-days").value;
      if (!siteVisitDate || !repairDays) {
        showToast("Please fill in all fields / กรุณากรอกข้อมูลให้ครบ / 请填写所有字段");
        return;
      }
      try {
        await respondFixJob(job.id, { siteVisitDate, repairDays });
        showToast(T.contractorSubmittedThanks);
      } catch (e) {
        console.error(e);
        showToast(T.errorPrefix + e.message);
      }
    });
  }

  const submitQuoteBtn = document.getElementById("submit-quote-btn");
  if (submitQuoteBtn) {
    submitQuoteBtn.addEventListener("click", async () => {
      const quoteDays = document.getElementById("f-quote-days").value;
      const quotePrice = document.getElementById("f-quote-price").value;
      const quoteNote = document.getElementById("f-quote-note").value;
      if (!quoteDays || !quotePrice) {
        showToast("Please fill in all fields / กรุณากรอกข้อมูลให้ครบ / 请填写所有字段");
        return;
      }
      try {
        await acceptQuoteJob(job.id, { quoteDays, quotePrice, quoteNote });
        showToast(T.contractorSubmittedThanks);
      } catch (e) {
        console.error(e);
        showToast(T.errorPrefix + e.message);
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
