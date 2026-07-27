import { ADMINS, COMPANY, CLAIM_STATUS, MAX_IMAGES, MAX_IMAGE_MB } from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, formatMoney, escapeHtml, todayStr } from "./utils.js";
import { T, claimStatusTri } from "./i18n.js";
import { loadProjects, addProject, updateProject } from "./projects.js";
import { addClaim, updateClaim, watchAllClaims } from "./claims.js";
import { compressImageToDataUrl } from "./image-compress.js";

renderCompanyBrandBar("brand-bar", COMPANY);

// ============================================================
//  ระบุตัวตนด้วยการ "เลือกชื่อ" — เหมือน repair-app (ไม่ใช่ระบบล็อกอินจริง)
// ============================================================
const IDENTITY_KEY = "progressClaimAdminIdentity";
function getIdentity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
    if (parsed && ADMINS.some((a) => a.id === parsed.id)) return parsed;
  } catch {}
  return null;
}
function setIdentity(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
}

const identityScreen = document.getElementById("identity-screen");
const dashboard = document.getElementById("dashboard");
const idGrid = document.getElementById("admin-id-grid");
const whoamiEl = document.getElementById("admin-whoami");

idGrid.innerHTML = ADMINS.map(
  (a) => `<button type="button" class="admin-chip" data-id="${a.id}"><span class="id-num">${escapeHtml(a.id)}</span>${escapeHtml(a.name)}</button>`
).join("");
idGrid.querySelectorAll(".admin-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const found = ADMINS.find((a) => a.id === btn.dataset.id);
    if (found) {
      setIdentity(found);
      showDashboard();
    }
  });
});
document.getElementById("switch-user-btn").addEventListener("click", () => {
  clearIdentity();
  identityScreen.style.display = "flex";
  dashboard.style.display = "none";
});

let currentAdmin = getIdentity();
function showDashboard() {
  currentAdmin = getIdentity();
  identityScreen.style.display = "none";
  dashboard.style.display = "block";
  whoamiEl.textContent = currentAdmin ? `👤 ${currentAdmin.name}` : "";
  main();
}
if (currentAdmin) {
  showDashboard();
} else {
  identityScreen.style.display = "flex";
}

// ============================================================
//  MAIN
// ============================================================
let allClaims = [];
let allProjects = [];
let selectedProjectScope = localStorage.getItem("progressClaimProjectScope") || "";
let unsubClaims = null;
let mainStarted = false;

async function main() {
  if (mainStarted) return;
  mainStarted = true;

  document.getElementById("c-status").innerHTML = Object.values(CLAIM_STATUS)
    .map((s) => `<option value="${s}">${claimStatusTri(s)}</option>`)
    .join("");
  document.getElementById("filter-status").insertAdjacentHTML(
    "beforeend",
    Object.values(CLAIM_STATUS).map((s) => `<option value="${s}">${claimStatusTri(s)}</option>`).join("")
  );
  // ป้องกันปัญหาเบราว์เซอร์ค้าง selectedness ไว้ที่ตัวเลือกแรกหลัง insertAdjacentHTML (ดูหมายเหตุใน repair-app admin.js)
  document.getElementById("filter-status").value = "";

  await refreshProjects();

  unsubClaims = watchAllClaims(
    (list) => {
      allClaims = list;
      render();
    },
    () => showToast(T.msgConnectFailCheckInternet.th)
  );

  document.getElementById("project-switcher").addEventListener("change", (e) => {
    selectedProjectScope = e.target.value;
    localStorage.setItem("progressClaimProjectScope", selectedProjectScope);
    render();
  });
  document.getElementById("filter-status").addEventListener("change", render);
  document.getElementById("filter-search").addEventListener("input", render);

  document.getElementById("add-claim-btn").addEventListener("click", () => openClaimModal());
  document.getElementById("close-claim-modal").addEventListener("click", closeClaimModal);
  document.getElementById("cancel-claim-btn").addEventListener("click", closeClaimModal);
  document.getElementById("save-claim-btn").addEventListener("click", saveClaim);
  document.getElementById("c-images").addEventListener("change", handleImageSelect);

  document.getElementById("project-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = document.getElementById("proj-label").value.trim();
    const color = document.getElementById("proj-color").value;
    if (!label) return;
    await addProject({ label, color });
    document.getElementById("proj-label").value = "";
    await refreshProjects();
    showToast(T.msgSaved.th);
  });

  document.getElementById("export-excel-btn").addEventListener("click", exportExcel);
  document.getElementById("export-pdf-btn").addEventListener("click", exportPdf);
}

async function refreshProjects() {
  allProjects = await loadProjects();
  const switcher = document.getElementById("project-switcher");
  switcher.innerHTML =
    `<option value="">${T.allProjectsLabel.en} / ${T.allProjectsLabel.th} / ${T.allProjectsLabel.zh}</option>` +
    allProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.label)}${p.active === false ? " (inactive)" : ""}</option>`).join("");
  switcher.value = selectedProjectScope;

  const cProject = document.getElementById("c-project");
  cProject.innerHTML = allProjects
    .filter((p) => p.active !== false)
    .map((p) => `<option value="${p.id}" data-label="${escapeHtml(p.label)}">${escapeHtml(p.label)}</option>`)
    .join("");

  renderProjectManageList();
}

function renderProjectManageList() {
  const el = document.getElementById("project-manage-list");
  el.innerHTML = allProjects
    .map(
      (p) => `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);">
      <span style="width:12px; height:12px; border-radius:50%; background:${p.color || "#2563eb"}; flex-shrink:0;"></span>
      <span style="flex:1;">${escapeHtml(p.label)}</span>
      <button class="btn btn-outline btn-sm toggle-proj-btn" data-id="${p.id}" data-active="${p.active !== false}">
        ${p.active === false ? "Enable / เปิดใช้งาน" : "Disable / ปิดใช้งาน"}
      </button>
    </div>`
    )
    .join("");
  el.querySelectorAll(".toggle-proj-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const active = btn.dataset.active === "true";
      await updateProject(btn.dataset.id, { active: !active });
      await refreshProjects();
    });
  });
}

function filteredClaims() {
  const status = document.getElementById("filter-status").value;
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  return allClaims.filter((c) => {
    if (selectedProjectScope && c.projectId !== selectedProjectScope) return false;
    if (status && c.status !== status) return false;
    if (search) {
      const hay = `${c.workItem || ""} ${c.claimId || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function render() {
  const list = filteredClaims();
  renderStats(list);
  renderTable(list);
}

function renderStats(list) {
  const total = list.reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const approved = list.filter((c) => c.status === CLAIM_STATUS.APPROVED).reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const pending = list.filter((c) => c.status === CLAIM_STATUS.PENDING).length;
  document.getElementById("stat-grid").innerHTML = `
    <div class="stat-card"><div class="num" style="color:#2563eb;">฿${formatMoney(total)}</div><div class="lbl">${T.totalClaimedLabel.th}</div></div>
    <div class="stat-card"><div class="num" style="color:#10b981;">฿${formatMoney(approved)}</div><div class="lbl">${T.totalApprovedLabel.th}</div></div>
    <div class="stat-card"><div class="num" style="color:#f59e0b;">${pending}</div><div class="lbl">${T.totalPendingLabel.th}</div></div>
  `;
}

function statusStyle(status) {
  const map = {
    "รอตรวจสอบ": { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
    "อนุมัติแล้ว": { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
    "ปฏิเสธ": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  };
  return map[status] || map["รอตรวจสอบ"];
}

function renderTable(list) {
  const tbody = document.getElementById("claims-tbody");
  const emptyState = document.getElementById("empty-table-state");
  if (!list.length) {
    tbody.innerHTML = "";
    emptyState.innerHTML = `<div class="hint" style="padding:20px; text-align:center;">${T.noClaimsYet.en} / ${T.noClaimsYet.th} / ${T.noClaimsYet.zh}</div>`;
    return;
  }
  emptyState.innerHTML = "";
  tbody.innerHTML = list
    .map((c) => {
      const style = statusStyle(c.status);
      const thumb = (c.images || [])[0]
        ? `<img class="table-thumb" data-id="${c.id}" src="${c.images[0].url}" title="${T.clickToViewPhoto.th}">`
        : `<div class="table-thumb-placeholder">🗂️</div>`;
      return `
      <tr data-id="${c.id}">
        <td>${thumb}</td>
        <td>${escapeHtml(c.claimId || "")}</td>
        <td>${escapeHtml(c.project || "")}</td>
        <td>${escapeHtml(c.workItem || "")}</td>
        <td>${c.progressPercent ?? 0}%</td>
        <td>฿${formatMoney(c.claimAmount)}</td>
        <td>${formatDateThai(c.claimDate)}</td>
        <td><span class="cat-badge" style="background:${style.bg}; color:${style.text};"><span class="dot" style="background:${style.dot};"></span>${claimStatusTri(c.status)}</span></td>
        <td>
          <button class="btn btn-outline btn-sm edit-claim-btn" data-id="${c.id}">✏️</button>
          ${c.status !== CLAIM_STATUS.APPROVED ? `<button class="btn btn-outline btn-sm approve-btn" data-id="${c.id}" title="${T.btnApprove.th}">✅</button>` : ""}
          ${c.status !== CLAIM_STATUS.REJECTED ? `<button class="btn btn-outline btn-sm reject-btn" data-id="${c.id}" title="${T.btnReject.th}">❌</button>` : ""}
          <button class="btn btn-outline btn-sm send-approval-link-btn" data-id="${c.id}" title="Send approval link to management / ส่งลิงก์อนุมัติให้ผู้บริหาร / 发送审批链接给管理层">🔗</button>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".table-thumb").forEach((img) => {
    img.addEventListener("click", () => {
      const c = allClaims.find((x) => x.id === img.dataset.id);
      openLightbox(c.images, 0);
    });
  });
  tbody.querySelectorAll(".edit-claim-btn").forEach((btn) => {
    btn.addEventListener("click", () => openClaimModal(allClaims.find((x) => x.id === btn.dataset.id)));
  });
  tbody.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", () => setStatus(btn.dataset.id, CLAIM_STATUS.APPROVED));
  });
  tbody.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => setStatus(btn.dataset.id, CLAIM_STATUS.REJECTED));
  });
  tbody.querySelectorAll(".send-approval-link-btn").forEach((btn) => {
    btn.addEventListener("click", () => showApprovalLink(btn.dataset.id));
  });
}

// ---------------- ลิงก์อนุมัติสำหรับผู้บริหาร (ไม่ต้องล็อกอิน) ----------------
function showApprovalLink(id) {
  const link = `${window.location.origin}${window.location.pathname.replace(/admin\.html$/, "")}approve.html?claim=${id}`;
  document.getElementById("claim-link-output").value = link;
  document.getElementById("claim-link-modal").style.display = "flex";
}
document.getElementById("close-claim-link-modal").addEventListener("click", () => {
  document.getElementById("claim-link-modal").style.display = "none";
});
document.getElementById("copy-claim-link-btn").addEventListener("click", async () => {
  const input = document.getElementById("claim-link-output");
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    document.execCommand("copy");
  }
  showToast("Link copied / คัดลอกลิงก์แล้ว / 已复制链接");
});

async function setStatus(id, status) {
  try {
    await updateClaim(id, { status }, currentAdmin?.name);
    showToast(T.msgSaved.th);
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  }
}

// ============================================================
//  ADD / EDIT MODAL
// ============================================================
let editingImages = [];

function openClaimModal(claim) {
  document.getElementById("claim-modal-title").textContent = claim
    ? `Edit Progress Claim / แก้ไขรายการเบิกงวดงาน / 编辑申请 (#${claim.claimId})`
    : `Add Progress Claim / เพิ่มรายการเบิกงวดงาน / 新增申请`;
  document.getElementById("c-id").value = claim ? claim.id : "";
  document.getElementById("c-claimId").value = claim ? claim.claimId : "(auto)";
  document.getElementById("c-project").value = claim ? claim.projectId : allProjects.find((p) => p.active !== false)?.id || "";
  document.getElementById("c-workItem").value = claim ? claim.workItem : "";
  document.getElementById("c-progress").value = claim ? claim.progressPercent : "";
  document.getElementById("c-amount").value = claim ? claim.claimAmount : "";
  document.getElementById("c-date").value = claim ? claim.claimDate : todayStr();
  document.getElementById("c-status").value = claim ? claim.status : CLAIM_STATUS.PENDING;
  document.getElementById("c-notes").value = claim ? claim.notes || "" : "";
  editingImages = claim ? [...(claim.images || [])] : [];
  renderImagePreviews();
  document.getElementById("claim-modal").style.display = "flex";
}
function closeClaimModal() {
  document.getElementById("claim-modal").style.display = "none";
  document.getElementById("c-images").value = "";
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  if (editingImages.length + files.length > MAX_IMAGES) {
    showToast(`Max ${MAX_IMAGES} images / สูงสุด ${MAX_IMAGES} รูป / 最多 ${MAX_IMAGES} 张`);
  }
  const room = Math.max(0, MAX_IMAGES - editingImages.length);
  for (const file of files.slice(0, room)) {
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) continue;
    try {
      const url = await compressImageToDataUrl(file);
      editingImages.push({ url });
    } catch (err) {
      console.error(err);
    }
  }
  renderImagePreviews();
  e.target.value = "";
}

function renderImagePreviews() {
  const el = document.getElementById("c-image-previews");
  el.innerHTML = editingImages
    .map(
      (img, i) => `
    <div style="position:relative;">
      <img src="${img.url}" style="width:64px; height:64px; object-fit:cover; border-radius:8px;">
      <button type="button" class="remove-img-btn" data-idx="${i}" style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:12px;">✕</button>
    </div>`
    )
    .join("");
  el.querySelectorAll(".remove-img-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingImages.splice(Number(btn.dataset.idx), 1);
      renderImagePreviews();
    });
  });
}

async function saveClaim() {
  const id = document.getElementById("c-id").value;
  const projectSel = document.getElementById("c-project");
  const projectId = projectSel.value;
  const project = projectSel.selectedOptions[0]?.dataset.label || "";
  const workItem = document.getElementById("c-workItem").value.trim();
  const progressPercent = document.getElementById("c-progress").value;
  const claimAmount = document.getElementById("c-amount").value;
  const claimDate = document.getElementById("c-date").value;
  const status = document.getElementById("c-status").value;
  const notes = document.getElementById("c-notes").value.trim();

  if (!projectId || !workItem || progressPercent === "" || claimAmount === "" || !claimDate) {
    showToast(T.msgFillRequired.th);
    return;
  }

  const payload = {
    projectId,
    project,
    workItem,
    progressPercent: Number(progressPercent),
    claimAmount: Number(claimAmount),
    claimDate,
    status,
    notes,
    images: editingImages,
  };

  try {
    if (id) {
      await updateClaim(id, payload, currentAdmin?.name);
    } else {
      await addClaim({ ...payload, updatedBy: currentAdmin?.name });
    }
    showToast(T.msgSaved.th);
    closeClaimModal();
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  }
}

// ============================================================
//  IMAGE LIGHTBOX
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

// ============================================================
//  EXPORT EXCEL
// ============================================================
async function exportExcel() {
  const list = filteredClaims();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Progress Claims");
  ws.columns = [
    { header: "Claim No.", key: "claimId", width: 20 },
    { header: "Project", key: "project", width: 24 },
    { header: "Work Item", key: "workItem", width: 40 },
    { header: "Progress %", key: "progressPercent", width: 12 },
    { header: "Amount (THB)", key: "claimAmount", width: 16 },
    { header: "Date", key: "claimDate", width: 14 },
    { header: "Status", key: "status", width: 16 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  list.forEach((c) => ws.addRow(c));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `progress-claims-${todayStr()}.xlsx`;
  a.click();
}

// ============================================================
//  EXPORT PDF (พิมพ์ผ่านเบราว์เซอร์ — เหมือน repair-app เพื่อรองรับไทย/จีนโดยไม่ต้องพึ่ง lib)
// ============================================================
function exportPdf() {
  const list = filteredClaims();
  const scopeProject = selectedProjectScope
    ? allProjects.find((p) => p.id === selectedProjectScope)?.label || ""
    : `${T.allProjectsLabel.th}`;
  const statusFilter = document.getElementById("filter-status").value;

  const rowsHtml = list
    .map((c) => {
      const img = (c.images || [])[0];
      return `
      <tr>
        <td>${img ? `<img class="print-thumb" src="${img.url}">` : `<div class="no-photo">${T.pdfNoPhoto ? T.pdfNoPhoto.th : "no photo"}</div>`}</td>
        <td>${escapeHtml(c.claimId || "")}</td>
        <td>${escapeHtml(c.project || "")}</td>
        <td class="desc-cell">${escapeHtml(c.workItem || "")}</td>
        <td>${c.progressPercent ?? 0}%</td>
        <td>฿${formatMoney(c.claimAmount)}</td>
        <td>${formatDateThai(c.claimDate)}</td>
        <td>${claimStatusTri(c.status)}</td>
      </tr>`;
    })
    .join("");

  const now = new Date().toLocaleString("th-TH");
  document.getElementById("print-report").innerHTML = `
    <div class="print-report-header">
      <img src="${COMPANY.logo}">
      <div class="titles">
        <h1>${T.pdfReportTitle.en} / ${T.pdfReportTitle.th} / ${T.pdfReportTitle.zh}</h1>
        <div class="sub">${COMPANY.nameTh} / ${COMPANY.nameEn}</div>
      </div>
    </div>
    <div class="print-report-meta">
      ${T.pdfGeneratedAtPrefix.th}: ${now}<br>
      Project / โปรเจกต์: ${escapeHtml(scopeProject)}<br>
      Status filter / กรองสถานะ: ${statusFilter ? claimStatusTri(statusFilter) : T.allStatusLabel.th}<br>
      ${T.totalClaimedLabel.th}: ฿${formatMoney(list.reduce((s, c) => s + (Number(c.claimAmount) || 0), 0))}
    </div>
    <table class="print-report-table">
      <thead>
        <tr>
          <th>Photo</th><th>Claim No.</th><th>Project</th><th>Work Item</th><th>Progress</th><th>Amount</th><th>Date</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  showToast(T.pdfPrintHint.th);
  setTimeout(() => window.print(), 300);
}
