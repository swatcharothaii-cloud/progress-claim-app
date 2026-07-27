import { COMPANY } from "./config.js";
import { renderCompanyBrandBar, renderCompanyFooter, formatDateThai, formatMoney, showToast, escapeHtml } from "./utils.js";
import { T, claimStatusTri } from "./i18n.js";
import { loadProjects } from "./projects.js";
import { watchClaimsByProject } from "./claims.js";

renderCompanyBrandBar("brand-bar", COMPANY);
renderCompanyFooter("app-footer", COMPANY);

const projectSelect = document.getElementById("project-select");
const claimListEl = document.getElementById("claim-list");
let unsub = null;
let currentImages = [];
let currentIndex = 0;

async function init() {
  try {
    const projects = await loadProjects();
    const active = projects.filter((p) => p.active !== false);
    projectSelect.innerHTML =
      `<option value="">-- Select a project -- / -- เลือกโปรเจกต์ -- / -- 请选择项目 --</option>` +
      active.map((p) => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join("");
  } catch (e) {
    console.error(e);
    showToast(T.msgConnectFailCheckInternet.th);
  }
}

projectSelect.addEventListener("change", () => {
  if (unsub) {
    unsub();
    unsub = null;
  }
  const projectId = projectSelect.value;
  claimListEl.innerHTML = "";
  if (!projectId) return;
  unsub = watchClaimsByProject(projectId, renderClaims, () => showToast(T.msgConnectFailCheckInternet.th));
});

function renderClaims(list) {
  if (!list.length) {
    claimListEl.innerHTML = `<div class="hint">${T.noClaimsYet.en} / ${T.noClaimsYet.th} / ${T.noClaimsYet.zh}</div>`;
    return;
  }
  claimListEl.innerHTML = list
    .map((c) => {
      const style = statusStyle(c.status);
      const thumbs = (c.images || [])
        .map(
          (img, i) =>
            `<img src="${img.url}" data-claim="${c.id}" data-idx="${i}" title="${T.clickToViewPhoto.th}">`
        )
        .join("");
      return `
      <div class="ticket-card" style="border-left-color:${style.dot};">
        <div class="row">
          <div>
            <div class="site">${escapeHtml(c.workItem || "-")}</div>
            <div class="meta">${T.claimAmountLabel.th}: ฿${formatMoney(c.claimAmount)} · ${T.progressLabel.th}: ${c.progressPercent ?? 0}%</div>
          </div>
          <span class="badge" style="background:${style.bg}; color:${style.text};">
            <span class="dot" style="background:${style.dot};"></span>${claimStatusTri(c.status)}
          </span>
        </div>
        <div class="meta" style="margin-top:8px;">${T.claimDateLabel.th}: ${formatDateThai(c.claimDate)} · #${escapeHtml(c.claimId || "")}</div>
        ${c.notes ? `<div class="desc">${escapeHtml(c.notes)}</div>` : ""}
        ${thumbs ? `<div class="meta" style="margin-top:8px;">${T.photosLabel.th}</div><div class="ticket-thumbs">${thumbs}</div>` : ""}
      </div>`;
    })
    .join("");

  claimListEl.querySelectorAll(".ticket-thumbs img").forEach((img) => {
    img.addEventListener("click", () => {
      const claim = list.find((c) => c.id === img.dataset.claim);
      const idx = Number(img.dataset.idx);
      openLightbox(claim.images, idx);
    });
  });
}

function statusStyle(status) {
  const map = {
    "รอตรวจสอบ": { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
    "อนุมัติแล้ว": { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
    "ปฏิเสธ": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  };
  return map[status] || map["รอตรวจสอบ"];
}

// ============ Image Lightbox (เหมือน repair-app) ============
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
