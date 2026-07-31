import { COMPANY, CLAIM_STATUS } from "./config.js";
import { renderCompanyBrandBar, renderCompanyFooter, formatDateThai, formatMoney, showToast, escapeHtml } from "./utils.js";
import { T, claimStatusTri } from "./i18n.js";
import { watchClaim, approveClaimStep, rejectClaimStep } from "./claims.js";
import { ensureApproval, renderApprovalStepper, APPROVAL_STATUS, APPROVAL_STEP_DEFS } from "./approval.js";

renderCompanyBrandBar("brand-bar", COMPANY);
renderCompanyFooter("app-footer", COMPANY);

const params = new URLSearchParams(window.location.search);
const claimDocId = params.get("claim") || "";
const contentEl = document.getElementById("claim-content");

let currentClaim = null;
let submitting = false;

if (!claimDocId) {
  contentEl.innerHTML = `<div class="hint" style="color:var(--danger);">Claim not found / ไม่พบรายการเบิกงวดงาน / 未找到申请记录</div>`;
} else {
  watchClaim(
    claimDocId,
    (claim) => {
      currentClaim = claim;
      render();
    },
    () => showToast(T.msgConnectFailCheckInternet.th)
  );
}

function statusStyle(status) {
  const map = {
    "รอตรวจสอบ": { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
    "อนุมัติแล้ว": { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
    "ปฏิเสธ": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  };
  return map[status] || map["รอตรวจสอบ"];
}

function render() {
  if (!currentClaim) {
    contentEl.innerHTML = `<div class="hint" style="color:var(--danger);">Claim not found / ไม่พบรายการเบิกงวดงาน / 未找到申请记录</div>`;
    return;
  }
  const c = currentClaim;
  const style = statusStyle(c.status);
  const approval = ensureApproval(c.approval);
  const thumbs = (c.images || [])
    .map((img, i) => `<img src="${img.url}" data-idx="${i}" title="${T.clickToViewPhoto.th}">`)
    .join("");

  const stepperHtml = renderApprovalStepper(approval, { lang: "all", escapeHtml });

  let actionHtml = "";
  if (approval.status === APPROVAL_STATUS.IN_PROGRESS) {
    const currentDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
    actionHtml = `
      <div class="card" style="margin-top:16px;">
        <p class="hint">Currently waiting for step ${approval.currentStep}/4 — ${currentDef?.labelEn} / ${currentDef?.labelTh} / ${currentDef?.labelZh}. Anyone with the link can act on behalf of this step / ขั้นตอนนี้รอการอนุมัติจาก ${currentDef?.labelTh} — ใครก็ได้ที่มีลิงก์นี้กดแทนขั้นตอนนี้ได้เลย</p>
        <div class="field">
          <label>Your name / ชื่อผู้อนุมัติ / 审批人姓名</label>
          <input type="text" id="approver-name" placeholder="e.g. K.Somchai">
        </div>
        <div class="field">
          <label>Note (optional) / หมายเหตุ (ถ้ามี) / 备注（可选）</label>
          <input type="text" id="approver-note" placeholder="">
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary btn-block" id="approve-btn">✅ ${T.btnApprove.en} / ${T.btnApprove.th} / ${T.btnApprove.zh}</button>
          <button class="btn btn-outline btn-block" id="reject-btn">❌ ${T.btnReject.en} / ${T.btnReject.th} / ${T.btnReject.zh}</button>
        </div>
      </div>`;
  } else if (approval.status === APPROVAL_STATUS.APPROVED) {
    actionHtml = `<div class="card" style="background:#d1fae5; margin-top:16px;">
      <strong>✅ Approved — all 4 steps complete / อนุมัติครบทุกขั้นตอนแล้ว / 已全部批准</strong>
    </div>`;
  } else if (approval.status === APPROVAL_STATUS.REJECTED) {
    actionHtml = `<div class="card" style="background:#fee2e2; margin-top:16px;">
      <strong>❌ Rejected — please revise and resubmit / ถูกปฏิเสธ ต้องแก้ไขแล้วส่งใหม่ / 已拒绝，请修改后重新提交</strong>
    </div>`;
  }

  contentEl.innerHTML = `
    <div class="row">
      <div>
        <div class="site">${escapeHtml(c.workItem || "-")}</div>
        <div class="meta">${T.claimAmountLabel.th}: ฿${formatMoney(c.claimAmount)} · ${T.progressLabel.th}: ${c.progressPercent ?? 0}%</div>
        ${c.project ? `<div class="meta">Project / โปรเจกต์ / 项目: ${escapeHtml(c.project)}</div>` : ""}
      </div>
      <span class="badge" style="background:${style.bg}; color:${style.text};">
        <span class="dot" style="background:${style.dot};"></span>${claimStatusTri(c.status)}
      </span>
    </div>
    <div class="meta" style="margin-top:8px;">${T.claimDateLabel.th}: ${formatDateThai(c.claimDate)} · #${escapeHtml(c.claimId || "")}</div>
    ${c.notes ? `<div class="desc" style="margin-top:8px;">${escapeHtml(c.notes)}</div>` : ""}
    ${thumbs ? `<div class="meta" style="margin-top:12px;">${T.photosLabel.th}</div><div class="ticket-thumbs">${thumbs}</div>` : ""}
    ${stepperHtml}
    <div id="claim-action"></div>
  `;

  contentEl.querySelectorAll(".ticket-thumbs img").forEach((img) => {
    img.addEventListener("click", () => openLightbox(c.images, Number(img.dataset.idx)));
  });

  document.getElementById("claim-action").innerHTML = actionHtml;
  wireActionHandlers();
}

function wireActionHandlers() {
  const approveBtn = document.getElementById("approve-btn");
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      if (submitting) return;
      const name = document.getElementById("approver-name").value.trim();
      if (!name) {
        showToast("Please enter your name / กรุณากรอกชื่อผู้อนุมัติ / 请输入姓名");
        return;
      }
      submitting = true;
      const note = document.getElementById("approver-note")?.value.trim() || "";
      try {
        await approveClaimStep(currentClaim.id, name, note);
        showToast("Approved / อนุมัติแล้ว / 已批准");
      } catch (e) {
        console.error(e);
        showToast("Error / เกิดข้อผิดพลาด / 出错了: " + e.message);
      } finally {
        submitting = false;
      }
    });
  }

  const rejectBtn = document.getElementById("reject-btn");
  if (rejectBtn) {
    rejectBtn.addEventListener("click", async () => {
      if (submitting) return;
      const name = document.getElementById("approver-name").value.trim();
      if (!name) {
        showToast("Please enter your name / กรุณากรอกชื่อผู้อนุมัติ / 请输入姓名");
        return;
      }
      if (!confirm("Reject this claim? The process will end and it must be revised and resubmitted from step 1 / ยืนยันการปฏิเสธรายการนี้? กระบวนการจะจบทันที ต้องแก้ไขแล้วส่งใหม่ตั้งแต่ขั้นตอนที่ 1 / 确认拒绝？流程将立即结束，需修改后从第1步重新提交")) return;
      submitting = true;
      const note = document.getElementById("approver-note")?.value.trim() || "";
      try {
        await rejectClaimStep(currentClaim.id, name, note);
        showToast("Rejected / ปฏิเสธแล้ว / 已拒绝");
      } catch (e) {
        console.error(e);
        showToast("Error / เกิดข้อผิดพลาด / 出错了: " + e.message);
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
