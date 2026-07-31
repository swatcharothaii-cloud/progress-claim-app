import {
  ADMINS, COMPANY, CLAIM_STATUS, MAX_IMAGES, MAX_IMAGE_MB,
  CONTRACTOR_JOB_TYPE, CONTRACTOR_JOB_TYPE_STYLE, CONTRACTOR_JOB_STATUS, CONTRACTOR_JOB_STATUS_STYLE,
  OTHER_APP_URL,
} from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, formatMoney, escapeHtml, todayStr } from "./utils.js";
import { T, claimStatusTri, jobTypeTri, contractorJobStatusTri } from "./i18n.js";
import { loadProjects, addProject, updateProject } from "./projects.js";
import { addClaim, updateClaim, watchAllClaims, deleteClaim } from "./claims.js";
import { watchAllContractorJobs, setPoNumber, passDeliveryInspection, failDeliveryInspection } from "./contractor-jobs.js";
import { importLegacyPurchaseOrders, watchAllLegacyPOs, reassignLegacyPoProject, deleteLegacyPo } from "./legacy-po.js";
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

// ============================================================
//  MAIN
// ============================================================
let allClaims = [];
let allProjects = [];
let allContractorJobs = [];
let allLegacyPOs = [];
let selectedProjectScope = localStorage.getItem("progressClaimProjectScope") || "";
let crossAppProjectApplied = false; // กันไม่ให้ ?project=... จาก URL ถูกใช้ซ้ำทุกครั้งที่ refreshProjects() รันใหม่
let unsubClaims = null;
let unsubContractorJobs = null;
let unsubLegacyPOs = null;
let mainStarted = false;

// เรียก showDashboard()/main() ตรงนี้ (หลังประกาศตัวแปร state ทั้งหมดข้างบนแล้ว) — ถ้าเรียกตอนที่ยังไม่ถึง
// บรรทัดประกาศ "let mainStarted" ฯลฯ ด้านบน จะเจอ ReferenceError "Cannot access ... before initialization"
// เพราะ main() อ้างถึงตัวแปรเหล่านี้ทันทีที่ถูกเรียก (เคสนี้เกิดขึ้นทุกครั้งที่แอดมินเคยเลือกชื่อไว้แล้วเปิดหน้าใหม่)
if (currentAdmin) {
  showDashboard();
} else {
  identityScreen.style.display = "flex";
}

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

  // งานผู้รับเหมา (PO / ส่งมอบงาน / ตรวจรับ) — อ่านจาก Firestore เดียวกับ repair-app แบบเรียลไทม์
  unsubContractorJobs = watchAllContractorJobs(
    (list) => {
      allContractorJobs = list;
      renderContractorJobsTable();
    },
    () => showToast(T.msgConnectFailCheckInternet.th)
  );

  // คลังใบสั่งซื้อเก่าจาก PEAK
  unsubLegacyPOs = watchAllLegacyPOs(
    (list) => {
      allLegacyPOs = list;
      renderLegacyPoTable();
    },
    () => showToast(T.msgConnectFailCheckInternet.th)
  );
  document.getElementById("import-legacy-po-btn").addEventListener("click", runLegacyPoImport);

  document.getElementById("project-switcher").addEventListener("change", (e) => {
    selectedProjectScope = e.target.value;
    localStorage.setItem("progressClaimProjectScope", selectedProjectScope);
    updateOtherAppLink();
    render();
  });
  document.getElementById("filter-status").addEventListener("change", render);
  document.getElementById("filter-search").addEventListener("input", render);

  document.getElementById("add-claim-btn").addEventListener("click", () => openClaimModal());
  document.getElementById("close-claim-modal").addEventListener("click", closeClaimModal);
  document.getElementById("cancel-claim-btn").addEventListener("click", closeClaimModal);
  document.getElementById("save-claim-btn").addEventListener("click", saveClaim);
  document.getElementById("c-source-job").addEventListener("change", applySourceJobSelection);
  document.getElementById("c-progress").addEventListener("input", recalcClaimAmount);
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

  // เชื่อมต่อ 2 ระบบ: ถ้าเปิดหน้านี้มาจากปุ่ม "🔗" ของ repair-app จะมี ?project=<ชื่อโปรเจกต์> ติดมาด้วย
  // (repair-app เก็บขอบเขตโปรเจกต์เป็น "ชื่อ" แต่ที่นี่เก็บเป็น "id" — ต้องหา id ที่ label ตรงกันก่อน)
  if (!crossAppProjectApplied) {
    crossAppProjectApplied = true;
    const urlProjectLabel = new URLSearchParams(location.search).get("project");
    if (urlProjectLabel) {
      const match = allProjects.find((p) => p.label === urlProjectLabel);
      if (match) {
        selectedProjectScope = match.id;
        localStorage.setItem("progressClaimProjectScope", selectedProjectScope);
      }
    }
  }

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
  updateOtherAppLink();
}

// อัปเดต href ของปุ่ม "🔗 Repair Report App" ให้พาไปที่โปรเจกต์เดียวกันที่กำลังดูอยู่ตอนนี้เสมอ
// (แปลง id ที่ใช้เก็บในระบบนี้ กลับเป็น "ชื่อโปรเจกต์" ก่อนส่งไป เพราะ repair-app ใช้ชื่อเป็นตัวอ้างอิง)
function updateOtherAppLink() {
  const btn = document.getElementById("link-other-app-btn");
  if (!btn) return;
  try {
    const url = new URL(OTHER_APP_URL);
    const project = allProjects.find((p) => p.id === selectedProjectScope);
    if (project) {
      url.searchParams.set("project", project.label);
    } else {
      url.searchParams.delete("project");
    }
    btn.href = url.toString();
  } catch (e) {
    // OTHER_APP_URL ยังไม่ได้ตั้งค่า/รูปแบบไม่ถูกต้อง — ปล่อยลิงก์ไว้เฉยๆ ไม่ต้อง throw
  }
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
  renderContractorJobsTable();
  renderLegacyPoTable();
}

function filteredContractorJobs() {
  return allContractorJobs.filter((j) => {
    if (selectedProjectScope && j.projectId !== selectedProjectScope) return false;
    return true;
  });
}

function filteredLegacyPOs() {
  return allLegacyPOs.filter((p) => {
    if (selectedProjectScope && p.projectId !== selectedProjectScope) return false;
    return true;
  });
}

function renderStats(list) {
  const total = list.reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const approved = list.filter((c) => c.status === CLAIM_STATUS.APPROVED).reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const pending = list.filter((c) => c.status === CLAIM_STATUS.PENDING).length;
  document.getElementById("stat-grid").innerHTML = `
    <div class="stat-card" style="--stat-color:#2563eb;"><div class="stat-icon">💰</div><div class="stat-body"><div class="num" style="color:#2563eb;">฿${formatMoney(total)}</div><div class="lbl">${T.totalClaimedLabel.th}</div></div></div>
    <div class="stat-card" style="--stat-color:#10b981;"><div class="stat-icon">✅</div><div class="stat-body"><div class="num" style="color:#10b981;">฿${formatMoney(approved)}</div><div class="lbl">${T.totalApprovedLabel.th}</div></div></div>
    <div class="stat-card" style="--stat-color:#f59e0b;"><div class="stat-icon">⏳</div><div class="stat-body"><div class="num" style="color:#f59e0b;">${pending}</div><div class="lbl">${T.totalPendingLabel.th}</div></div></div>
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
        <td>${
          c.poNumber || c.sourceJobNo
            ? `${c.poNumber ? `🧾 ${escapeHtml(c.poNumber)}` : ""}${c.poNumber && c.sourceJobNo ? "<br>" : ""}${c.sourceJobNo ? `📦 ${escapeHtml(c.sourceJobNo)}` : ""}`
            : `<span class="hint">-</span>`
        }</td>
        <td>${c.progressPercent ?? 0}%</td>
        <td>฿${formatMoney(c.claimAmount)}</td>
        <td>${formatDateThai(c.claimDate)}</td>
        <td><span class="cat-badge" style="background:${style.bg}; color:${style.text};"><span class="dot" style="background:${style.dot};"></span>${claimStatusTri(c.status)}</span></td>
        <td>
          <button class="btn btn-outline btn-sm edit-claim-btn" data-id="${c.id}">✏️</button>
          ${c.status !== CLAIM_STATUS.APPROVED ? `<button class="btn btn-outline btn-sm approve-btn" data-id="${c.id}" title="${T.btnApprove.th}">✅</button>` : ""}
          ${c.status !== CLAIM_STATUS.REJECTED ? `<button class="btn btn-outline btn-sm reject-btn" data-id="${c.id}" title="${T.btnReject.th}">❌</button>` : ""}
          <button class="btn btn-outline btn-sm send-approval-link-btn" data-id="${c.id}" title="Send approval link to management / ส่งลิงก์อนุมัติให้ผู้บริหาร / 发送审批链接给管理层">🔗</button>
          <button class="btn btn-sm delete-claim-btn" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;" data-id="${c.id}" title="Delete permanently / ลบถาวร / 永久删除">🗑️</button>
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
  tbody.querySelectorAll(".delete-claim-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteClaimRow(btn.dataset.id));
  });
}

// ============================================================
//  CONTRACTOR JOBS (PO / DELIVERY / INSPECTION) — ข้อมูลจาก repair-app โดยตรง
//  อ่าน+แก้ไข collection "contractorJobs" เดียวกัน ไม่มีการกรอกข้อมูลซ้ำ
// ============================================================
function renderContractorJobsTable() {
  const tbody = document.getElementById("cj-tbody");
  const emptyState = document.getElementById("empty-cj-state");
  if (!tbody) return; // กันพลาดถ้า main() ยังไม่ได้เริ่ม/องค์ประกอบยังไม่พร้อม
  const list = filteredContractorJobs();
  if (!list.length) {
    tbody.innerHTML = "";
    emptyState.innerHTML = `<div class="hint" style="padding:16px; text-align:center;">${T.noContractorJobsYet.en} / ${T.noContractorJobsYet.th} / ${T.noContractorJobsYet.zh}</div>`;
    return;
  }
  emptyState.innerHTML = "";
  tbody.innerHTML = list
    .map((j) => {
      const style = CONTRACTOR_JOB_STATUS_STYLE[j.status] || CONTRACTOR_JOB_STATUS_STYLE[CONTRACTOR_JOB_STATUS.WAITING];
      const typeStyle = CONTRACTOR_JOB_TYPE_STYLE[j.type] || CONTRACTOR_JOB_TYPE_STYLE[CONTRACTOR_JOB_TYPE.FIX];
      const typeBadge = `<span class="cat-badge" style="background:${typeStyle.bg}; color:${typeStyle.text}; border:1px solid ${typeStyle.border}; font-weight:600;">${typeStyle.icon} ${jobTypeTri(j.type)}</span>${
        j.type === CONTRACTOR_JOB_TYPE.DEFECT && j.defectRound
          ? `<div class="hint" style="color:#991b1b; font-weight:700; margin-top:2px;">⚠️ ครั้งที่ ${escapeHtml(String(j.defectRound))}</div>`
          : ""
      }`;

      let deliveryCell = `<span class="hint">-</span>`;
      if (j.status === CONTRACTOR_JOB_STATUS.CONFIRMED || j.status === CONTRACTOR_JOB_STATUS.DONE) {
        const poLine = j.poNumber
          ? `<div class="hint" style="font-weight:600;">🧾 ${escapeHtml(j.poNumber)} <button class="btn btn-outline btn-sm cj-set-po-btn" data-id="${j.id}" style="padding:1px 6px; font-size:11px;">✏️</button></div>`
          : `<button class="btn btn-outline btn-sm cj-set-po-btn" data-id="${j.id}">${T.btnSetPoNumber.en} / ${T.btnSetPoNumber.th}</button>`;
        const photoCountBadge = (j.deliveryImages || []).length ? ` 🖼️${j.deliveryImages.length}` : "";
        const roundBadge = j.inspectionRound
          ? `<div class="hint" style="margin-top:2px;">🔍 ${T.inspectionRoundLabel.th} ${j.inspectionRound}${j.lastInspectionResult === "failed" ? " ❌" : ""}</div>`
          : "";
        let deliveryLine = `<div class="hint" style="margin-top:4px;">- ${T.msgAwaitingDelivery.th}</div>`;
        if (j.deliveryAccepted) {
          deliveryLine = `<div class="hint" style="margin-top:4px; color:#1e40af; font-weight:600;">✅ ${formatDateThai(j.deliveryDate)}${photoCountBadge}</div>${roundBadge}`;
        } else if (j.deliverySubmitted) {
          deliveryLine = `
            <div class="hint" style="margin-top:4px; color:#92400e;">⏳ ${formatDateThai(j.deliveryDate)}${photoCountBadge}</div>${roundBadge}
            <div style="display:flex; gap:4px; margin-top:4px;">
              <button class="btn btn-sm cj-pass-delivery-btn" data-id="${j.id}" style="background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; padding:2px 6px; font-size:11px;">${T.btnInspectionPass.th}</button>
              <button class="btn btn-sm cj-fail-delivery-btn" data-id="${j.id}" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:2px 6px; font-size:11px;">${T.btnInspectionFail.th}</button>
            </div>`;
        } else if (j.inspectionRound > 0) {
          deliveryLine = `<div class="hint" style="margin-top:4px; color:#991b1b;">❌ ${T.msgInspectionFailedResubmit.th}</div>${roundBadge}`;
        }
        deliveryCell = poLine + deliveryLine;
      }

      return `
      <tr>
        <td>${escapeHtml(j.jobId || "")}</td>
        <td>${typeBadge}</td>
        <td>${escapeHtml(j.project || "")}</td>
        <td>${escapeHtml(j.contractorName || "")}</td>
        <td><span class="cat-badge" style="background:${style.bg}; color:${style.text};"><span class="dot" style="background:${style.dot};"></span>${contractorJobStatusTri(j.status)}</span></td>
        <td>${deliveryCell}</td>
        <td><button class="btn btn-outline btn-sm cj-view-btn" data-id="${j.id}" title="${T.btnViewJob.th}">👁️</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".cj-set-po-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const j = allContractorJobs.find((x) => x.id === id);
      if (!j) return;
      const poNumber = prompt(`${T.promptSetPoNumber.en} / ${T.promptSetPoNumber.th}`, j.poNumber || "");
      if (poNumber === null) return;
      try {
        await setPoNumber(id, poNumber);
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
    });
  });
  tbody.querySelectorAll(".cj-pass-delivery-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const j = allContractorJobs.find((x) => x.id === id);
      if (!j) return;
      const inspectorName = prompt(`${T.promptInspectorName.en} / ${T.promptInspectorName.th}`, currentAdmin?.name || "");
      if (inspectorName === null) return;
      if (!inspectorName.trim()) {
        showToast(T.msgInspectorNameRequired.th);
        return;
      }
      if (!confirm(`Confirm delivery passed for job "${j.jobId || id}"? / ยืนยันว่างาน "${j.jobId || id}" ตรวจผ่านแล้ว?`)) return;
      try {
        const round = (j.inspectionRound || 0) + 1;
        await passDeliveryInspection(id, { round, inspectorName });
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
    });
  });
  tbody.querySelectorAll(".cj-fail-delivery-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const j = allContractorJobs.find((x) => x.id === id);
      if (!j) return;
      const inspectorName = prompt(`${T.promptInspectorName.en} / ${T.promptInspectorName.th}`, currentAdmin?.name || "");
      if (inspectorName === null) return;
      if (!inspectorName.trim()) {
        showToast(T.msgInspectorNameRequired.th);
        return;
      }
      const note = prompt(`${T.promptInspectionFailNote.en} / ${T.promptInspectionFailNote.th}`, "") || "";
      if (!confirm(`Mark delivery as failed for job "${j.jobId || id}"? Contractor will need to resubmit. / ยืนยันว่างาน "${j.jobId || id}" ตรวจไม่ผ่าน? ผู้รับเหมาต้องส่งมอบงานใหม่`)) return;
      try {
        const round = (j.inspectionRound || 0) + 1;
        await failDeliveryInspection(id, { round, inspectorName, note });
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
    });
  });
  tbody.querySelectorAll(".cj-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openContractorJobView(btn.dataset.id));
  });
}

// ---------------- ใบส่งมอบงาน (dn-doc) — ใช้ร่วมกันทั้ง modal ดูบนหน้าจอ และตอนพิมพ์ ----------------
function formatTs(ts) {
  const dash = `<span class="dn-empty-note">-</span>`;
  if (!ts) return dash;
  const d = typeof ts.toDate === "function" ? ts.toDate() : ts.value ? ts.value : ts;
  const out = formatDateThai(d);
  return out && out !== "-" ? out : dash;
}

// ตั้งค่าขนาด/แนวกระดาษสำหรับการพิมพ์แบบไดนามิก — ต้องกำหนดใหม่ทุกครั้งก่อนสั่งพิมพ์ เพราะ #print-report
// ใช้ซ้ำทั้งกับ "ใบส่งมอบงาน" (เอกสารเดี่ยว เหมาะกับแนวตั้ง A4) และ "รายงานตาราง" (หลายคอลัมน์ เหมาะกับแนวนอน A4)
function setPrintPage(orientation, marginMm = 10) {
  let styleEl = document.getElementById("dynamic-print-page-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-page-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: ${marginMm}mm; } }`;
}

function buildDeliveryNoteHtml(j) {
  const typeStyle = CONTRACTOR_JOB_TYPE_STYLE[j.type] || CONTRACTOR_JOB_TYPE_STYLE[CONTRACTOR_JOB_TYPE.FIX];
  const statusStyle = CONTRACTOR_JOB_STATUS_STYLE[j.status] || CONTRACTOR_JOB_STATUS_STYLE[CONTRACTOR_JOB_STATUS.WAITING];
  const dash = `<span class="dn-empty-note">-</span>`;
  const val = (v) => (v === null || v === undefined || v === "" ? dash : escapeHtml(String(v)));

  const repairDaysVal = j.repairDays ?? j.quoteDays;
  const repairDaysDisplay = repairDaysVal != null ? `${escapeHtml(String(repairDaysVal))} วัน` : dash;

  const priceValue =
    j.type === CONTRACTOR_JOB_TYPE.QUOTE
      ? `฿${Number(j.quotePrice || 0).toLocaleString("th-TH")}`
      : j.type === CONTRACTOR_JOB_TYPE.FIX && j.repairPrice != null
      ? `฿${Number(j.repairPrice || 0).toLocaleString("th-TH")}`
      : dash;

  const inspectionResultHtml =
    j.lastInspectionResult === "passed"
      ? `<b style="color:#065f46;">✅ Passed / ผ่าน</b>`
      : j.lastInspectionResult === "failed"
      ? `<b style="color:#991b1b;">❌ Failed / ไม่ผ่าน (ต้องแก้ไข)</b>`
      : dash;

  const row2 = (labelA, valueA, labelB, valueB) => `
    <tr>
      <td class="dn-label">${labelA}</td>
      <td class="dn-value">${valueA}</td>
      <td class="dn-label-2">${labelB}</td>
      <td class="dn-value">${valueB}</td>
    </tr>`;
  const rowFull = (label, value) => `
    <tr>
      <td class="dn-label">${label}</td>
      <td class="dn-value dn-full" colspan="3">${value}</td>
    </tr>`;

  const photosSection = (j.deliveryImages || []).length
    ? `<div class="dn-section-title">📷 Delivery photos / ภาพส่งมอบงาน</div>
       <div class="dn-photos-wrap">
         <div class="dn-photos-grid">
           ${(j.deliveryImages || []).map((img) => `<img class="print-thumb" src="${img.url}">`).join("")}
         </div>
       </div>`
    : "";

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
          ${T.deliveryNoteTitle.en} / ${T.deliveryNoteTitle.th}
          <span class="sub">${typeStyle.icon} ${jobTypeTri(j.type)}${j.type === CONTRACTOR_JOB_TYPE.DEFECT && j.defectRound ? ` (ครั้งที่ ${escapeHtml(String(j.defectRound))})` : ""}</span>
        </div>
        <div class="dn-doc-no">
          Job No. / เลขที่งาน
          <b>${escapeHtml(j.jobId || "-")}</b>
          <span class="dn-status-badge" style="background:${statusStyle.bg}; color:${statusStyle.text};">${contractorJobStatusTri(j.status)}</span>
        </div>
      </div>

      <div class="dn-section-title">🗂️ Job Information / ข้อมูลงาน</div>
      <table class="dn-table">
        ${row2("PO Number<br>เลขที่ PO", `<b>${val(j.poNumber)}</b>`, "Project<br>โปรเจกต์", val(j.project))}
        ${row2("Site<br>สถานที่", val(j.siteName), "Contractor<br>ผู้รับเหมา", val(j.contractorName))}
        ${rowFull("Description<br>รายละเอียดงาน", val(j.description))}
      </table>

      <div class="dn-section-title">📅 Schedule &amp; Price / กำหนดการและราคา</div>
      <table class="dn-table">
        ${row2("Site visit date<br>วันเข้าหน้างาน", j.siteVisitDate ? formatDateThai(j.siteVisitDate) : dash, "Repair days<br>จำนวนวันซ่อม", repairDaysDisplay)}
        ${rowFull("Price<br>ราคา", `<b>${priceValue}</b>`)}
      </table>

      <div class="dn-section-title">📦 Delivery / การส่งมอบงาน</div>
      <table class="dn-table">
        ${row2("Delivery date<br>วันส่งมอบงาน", j.deliveryDate ? formatDateThai(j.deliveryDate) : dash, "Supervisor<br>ผู้ดูแลงาน", val(j.supervisorName))}
        ${rowFull("Delivery note<br>หมายเหตุส่งมอบ", val(j.deliveryNote))}
      </table>

      <div class="dn-section-title">🔍 Inspection &amp; Acceptance / การตรวจรับงาน</div>
      <table class="dn-table">
        ${row2("Inspection round<br>ตรวจงานครั้งที่", val(j.inspectionRound), "Inspection result<br>ผลตรวจล่าสุด", inspectionResultHtml)}
        ${row2("Inspector<br>ผู้ตรวจงาน", val(j.lastInspectionBy), "Inspected date<br>วันที่ตรวจ", formatTs(j.lastInspectionAt))}
        ${j.lastInspectionNote ? rowFull("Inspection note<br>หมายเหตุการตรวจ", val(j.lastInspectionNote)) : ""}
      </table>

      ${photosSection}

      <div class="dn-sign-grid">
        <div class="dn-sign-block">
          <div class="dn-sign-line">${j.supervisorName ? escapeHtml(j.supervisorName) : "&nbsp;"}</div>
          <div class="dn-sign-role">ผู้ส่งมอบงาน / Delivered by</div>
        </div>
        <div class="dn-sign-block">
          <div class="dn-sign-line">${j.lastInspectionBy ? escapeHtml(j.lastInspectionBy) : "&nbsp;"}</div>
          <div class="dn-sign-role">ผู้ตรวจรับงาน / Inspected by</div>
        </div>
        <div class="dn-sign-block">
          <div class="dn-sign-line">&nbsp;</div>
          <div class="dn-sign-role">ผู้อนุมัติ / Approved by</div>
        </div>
      </div>
    </div>
  `;
}

let cjViewingId = null;
function openContractorJobView(id) {
  const j = allContractorJobs.find((x) => x.id === id);
  if (!j) return;
  cjViewingId = id;
  document.getElementById("cj-view-title").textContent = `${T.deliveryNoteTitle.en} / ${T.deliveryNoteTitle.th} — ${j.jobId || ""}`;
  document.getElementById("cj-view-body").innerHTML = buildDeliveryNoteHtml(j);
  document.getElementById("cj-view-modal").style.display = "flex";
  document.querySelectorAll("#cj-view-body .print-thumb").forEach((img, idx) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openLightbox(j.deliveryImages, idx));
  });
}
function closeContractorJobView() {
  document.getElementById("cj-view-modal").style.display = "none";
  cjViewingId = null;
}
document.getElementById("close-cj-view-modal").addEventListener("click", closeContractorJobView);
document.getElementById("cj-view-close-btn").addEventListener("click", closeContractorJobView);
document.getElementById("cj-view-print-btn").addEventListener("click", () => {
  if (!cjViewingId) return;
  const j = allContractorJobs.find((x) => x.id === cjViewingId);
  if (!j) return;
  document.getElementById("print-report").innerHTML = buildDeliveryNoteHtml(j);
  setPrintPage("portrait", 10); // ใบส่งมอบงาน = เอกสารเดี่ยว พิมพ์แนวตั้ง A4
  showToast(T.pdfPrintHint.th);
  setTimeout(() => window.print(), 300);
});

// ============================================================
//  LEGACY PURCHASE ORDER ARCHIVE (นำเข้าจาก PEAK ครั้งเดียว)
// ============================================================
async function runLegacyPoImport() {
  const btn = document.getElementById("import-legacy-po-btn");
  const statusEl = document.getElementById("legacy-po-import-status");
  btn.disabled = true;
  try {
    statusEl.textContent = "กำลังนำเข้า... / Importing...";
    const result = await importLegacyPurchaseOrders((done, total) => {
      statusEl.textContent = `กำลังนำเข้า ${done}/${total}... / Importing ${done}/${total}...`;
    });
    await refreshProjects(); // อาจมีการสร้างโปรเจกต์ใหม่ระหว่างนำเข้า
    statusEl.textContent = `เสร็จแล้ว: นำเข้าใหม่ ${result.created} รายการ, ข้ามที่มีอยู่แล้ว ${result.skipped} รายการ (รวม ${result.total}) / Done: ${result.created} imported, ${result.skipped} skipped (already imported), of ${result.total} total.`;
    showToast(T.msgSaved.th);
  } catch (e) {
    console.error(e);
    statusEl.textContent = "นำเข้าไม่สำเร็จ / Import failed: " + e.message;
    showToast(T.msgSavedFail.th);
  } finally {
    btn.disabled = false;
  }
}

function renderLegacyPoTable() {
  const tbody = document.getElementById("legacy-po-tbody");
  const emptyState = document.getElementById("empty-legacy-po-state");
  if (!tbody) return;
  const list = filteredLegacyPOs();
  if (!list.length) {
    tbody.innerHTML = "";
    emptyState.innerHTML = `<div class="hint" style="padding:16px; text-align:center;">No legacy purchase orders yet — click "Import from PEAK" above / ยังไม่มีข้อมูล กดปุ่ม "นำเข้าจาก PEAK" ด้านบน / 暂无数据，请点击上方"从PEAK导入"</div>`;
    return;
  }
  emptyState.innerHTML = "";
  tbody.innerHTML = list
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.poNumber || "")}</td>
      <td>${formatDateThai(p.issueDate)}</td>
      <td>${escapeHtml(p.project || "")}</td>
      <td>${escapeHtml(p.contractorNickname || "")}</td>
      <td>${escapeHtml(p.vendorName || "")}</td>
      <td>฿${formatMoney(p.totalAmount)}</td>
      <td><span class="cat-badge" style="background:#f1f5f9; color:#334155;">${escapeHtml(p.status || "")}</span></td>
      <td><button class="btn btn-outline btn-sm legacy-po-view-btn" data-id="${p.id}" title="View / ดู / 查看">👁️</button></td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll(".legacy-po-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openLegacyPoView(btn.dataset.id));
  });
}

let legacyPoViewingId = null;
function buildLegacyPoDetailHtml(p) {
  const lineRows = (p.lineItems || [])
    .map(
      (li) => `
    <tr>
      <td>${escapeHtml(li.desc || "")}</td>
      <td style="text-align:right;">${li.qty ?? "-"}</td>
      <td style="text-align:right;">${li.price != null ? Number(li.price).toLocaleString("th-TH") : "-"}</td>
      <td style="text-align:right;">${li.amountBeforeTax != null ? Number(li.amountBeforeTax).toLocaleString("th-TH") : "-"}</td>
    </tr>`
    )
    .join("");
  return `
    <div class="dn-doc">
      <div class="dn-doc-title-bar">
        <div class="dn-doc-title">
          Purchase Order / ใบสั่งซื้อ
          <span class="sub">${escapeHtml(p.contractorNickname || "")} — ${escapeHtml(p.vendorName || "")}</span>
        </div>
        <div class="dn-doc-no">
          PO No. / เลขที่เอกสาร
          <b>${escapeHtml(p.poNumber || "-")}</b>
          <span class="dn-status-badge" style="background:#e2e8f0; color:#1f2937;">${escapeHtml(p.status || "")}</span>
        </div>
      </div>
      <div class="dn-section-title">🗂️ Document Info / ข้อมูลเอกสาร</div>
      <table class="dn-table">
        <tr>
          <td class="dn-label">Issue date<br>วันที่ออก</td>
          <td class="dn-value">${formatDateThai(p.issueDate)}</td>
          <td class="dn-label-2">Project<br>โปรเจกต์</td>
          <td class="dn-value">${escapeHtml(p.project || "-")}</td>
        </tr>
      </table>
      <div class="dn-section-title">📋 Line Items / รายการ</div>
      <div style="padding:14px;">
        <table class="print-report-table" style="font-size:13px;">
          <thead><tr><th>Description / รายละเอียด</th><th style="width:70px;">Qty</th><th style="width:100px;">Price</th><th style="width:120px;">Amount</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </div>
      <div class="dn-section-title">💰 Totals / ยอดรวม</div>
      <table class="dn-table">
        <tr>
          <td class="dn-label">Total<br>มูลค่ารวม</td>
          <td class="dn-value"><b>฿${p.totalAmount != null ? Number(p.totalAmount).toLocaleString("th-TH") : "-"}</b></td>
          <td class="dn-label-2">Net payable<br>ต้องชำระ</td>
          <td class="dn-value"><b>฿${p.netPayable != null ? Number(p.netPayable).toLocaleString("th-TH") : "-"}</b></td>
        </tr>
        <tr>
          <td class="dn-label">VAT<br>ภาษีมูลค่าเพิ่ม</td>
          <td class="dn-value">฿${p.vatAmount != null ? Number(p.vatAmount).toLocaleString("th-TH") : "-"}</td>
          <td class="dn-label-2">WHT<br>หัก ณ ที่จ่าย</td>
          <td class="dn-value">฿${p.whtAmount != null ? Number(p.whtAmount).toLocaleString("th-TH") : "-"}</td>
        </tr>
      </table>
      ${
        p.notes
          ? `<div class="dn-section-title">📝 Notes / หมายเหตุ (รวมข้อมูลบัญชีธนาคาร)</div>
             <div style="padding:14px; white-space:pre-wrap; font-size:13px; color:#334155;">${escapeHtml(p.notes)}</div>`
          : ""
      }
    </div>
  `;
}
function openLegacyPoView(id) {
  const p = allLegacyPOs.find((x) => x.id === id);
  if (!p) return;
  legacyPoViewingId = id;
  document.getElementById("legacy-po-view-title").textContent = `Purchase Order / ใบสั่งซื้อ — ${p.poNumber || ""}`;
  document.getElementById("legacy-po-view-body").innerHTML = buildLegacyPoDetailHtml(p);
  const select = document.getElementById("legacy-po-reassign-select");
  select.innerHTML = allProjects.map((proj) => `<option value="${proj.id}">${escapeHtml(proj.label)}</option>`).join("");
  select.value = p.projectId || "";
  document.getElementById("legacy-po-view-modal").style.display = "flex";
}
function closeLegacyPoView() {
  document.getElementById("legacy-po-view-modal").style.display = "none";
  legacyPoViewingId = null;
}
document.getElementById("close-legacy-po-view-modal").addEventListener("click", closeLegacyPoView);
document.getElementById("legacy-po-view-close-btn").addEventListener("click", closeLegacyPoView);
document.getElementById("legacy-po-reassign-select").addEventListener("change", async (e) => {
  if (!legacyPoViewingId) return;
  const proj = allProjects.find((p) => p.id === e.target.value);
  if (!proj) return;
  try {
    await reassignLegacyPoProject(legacyPoViewingId, proj.id, proj.label);
    showToast(T.msgSaved.th);
  } catch (err) {
    console.error(err);
    showToast(T.msgSavedFail.th);
  }
});
document.getElementById("legacy-po-delete-btn").addEventListener("click", async () => {
  if (!legacyPoViewingId) return;
  const p = allLegacyPOs.find((x) => x.id === legacyPoViewingId);
  if (!p) return;
  if (!confirm(`Delete PO "${p.poNumber || legacyPoViewingId}" permanently? This cannot be undone.\nลบใบสั่งซื้อ "${p.poNumber || legacyPoViewingId}" ถาวร? กู้คืนไม่ได้`)) return;
  try {
    await deleteLegacyPo(legacyPoViewingId);
    showToast(T.msgSaved.th);
    closeLegacyPoView();
  } catch (err) {
    console.error(err);
    showToast(T.msgSavedFail.th);
  }
});

// ลบรายการเบิกงวดงานถาวร (ตามคำขอ) — เตือนก่อนกดลบจริงเสมอ กู้คืนไม่ได้หลังลบแล้ว
async function deleteClaimRow(id) {
  const c = allClaims.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Delete claim "${c.claimId || id}" permanently? This cannot be undone.\nลบรายการเบิกงวดงาน "${c.claimId || id}" ถาวร? กู้คืนไม่ได้`)) {
    return;
  }
  try {
    await deleteClaim(id);
    showToast(T.msgSaved.th);
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  }
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
// ยอดเงินเต็มตาม PO ของงานที่เลือกอ้างอิงอยู่ในฟอร์มตอนนี้ (null = ไม่ได้อ้างอิง PO ใดๆ หรืองานนั้นยังไม่มีราคา)
// ใช้คำนวณ "ยอดเบิก" อัตโนมัติ = ยอดเงิน PO × % ความคืบหน้า ทุกครั้งที่แก้ % หรือเลือก PO ใหม่
let sourceJobPoAmount = null;

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
  refreshSourceJobOptions(claim ? claim.sourceJobId || "" : "");
  document.getElementById("c-po-number").value = claim ? claim.poNumber || "" : "";
  document.getElementById("c-job-no").value = claim ? claim.sourceJobNo || "" : "";
  sourceJobPoAmount = claim && claim.poAmount != null ? Number(claim.poAmount) : null;
  document.getElementById("c-po-amount").value = sourceJobPoAmount != null ? `฿${formatMoney(sourceJobPoAmount)}` : "";
  editingImages = claim ? [...(claim.images || [])] : [];
  renderImagePreviews();
  document.getElementById("claim-modal").style.display = "flex";
}

// ยอดเงินเต็มของงาน — งานประเภท "เสนอราคา" ใช้ quotePrice, "งานแก้ไข" ใช้ repairPrice, ประเภทอื่น (เช่นงานแก้ตำหนิ) ไม่มีราคา
function jobFullAmount(job) {
  if (!job) return null;
  if (job.type === CONTRACTOR_JOB_TYPE.QUOTE && job.quotePrice != null) return Number(job.quotePrice);
  if (job.type === CONTRACTOR_JOB_TYPE.FIX && job.repairPrice != null) return Number(job.repairPrice);
  return null;
}

// คำนวณ "ยอดเบิก" ใหม่ = ยอดเงิน PO เต็ม × (% ความคืบหน้า / 100) — ทำงานเฉพาะตอนมี PO อ้างอิงอยู่เท่านั้น
// (ถ้าไม่ได้อ้างอิง PO ใดๆ ช่องยอดเบิกยังกรอกเองได้ตามปกติ ไม่ถูกคำนวณทับ)
function recalcClaimAmount() {
  if (sourceJobPoAmount == null) return;
  const progress = Number(document.getElementById("c-progress").value);
  if (!Number.isFinite(progress)) return;
  const amount = Math.round(sourceJobPoAmount * (progress / 100) * 100) / 100;
  document.getElementById("c-amount").value = amount;
}

// รายชื่องานผู้รับเหมาที่ "มีเลขที่ PO แล้ว" เท่านั้น — ใช้เป็นตัวเลือกให้ผูกรายการเบิกงวดกับ PO/ใบส่งมอบงาน
// (ข้อมูลชุดเดียวกับที่ repair-app สร้างไว้ อ่านแบบเรียลไทม์ผ่าน allContractorJobs ที่ subscribe ไว้ตั้งแต่ main())
function jobsWithPO() {
  return allContractorJobs.filter((j) => (j.poNumber || "").trim());
}

function refreshSourceJobOptions(selectedJobId) {
  const sel = document.getElementById("c-source-job");
  const jobs = jobsWithPO();
  sel.innerHTML =
    `<option value="">— No reference / ไม่อ้างอิง / 不关联 —</option>` +
    jobs
      .map(
        (j) =>
          `<option value="${j.id}">🧾 ${escapeHtml(j.poNumber)} · 📦 ${escapeHtml(j.jobId || "")} · ${escapeHtml(j.project || "")} — ${escapeHtml((j.description || "").slice(0, 40))}</option>`
      )
      .join("");
  sel.value = selectedJobId && jobs.some((j) => j.id === selectedJobId) ? selectedJobId : "";
}

// เลือกงานจาก dropdown แล้วดึงเลขที่ PO / เลขที่ใบส่งมอบงานมาเติมอัตโนมัติ พร้อมช่วยเติมโปรเจกต์ให้ตรงกัน
// และเติม "รายการงาน" ให้ถ้ายังไม่ได้พิมพ์อะไรไว้ (ไม่ทับของที่ผู้ใช้พิมพ์เองแล้ว)
function applySourceJobSelection() {
  const jobId = document.getElementById("c-source-job").value;
  if (!jobId) {
    document.getElementById("c-po-number").value = "";
    document.getElementById("c-job-no").value = "";
    document.getElementById("c-po-amount").value = "";
    sourceJobPoAmount = null;
    return;
  }
  const job = allContractorJobs.find((j) => j.id === jobId);
  if (!job) return;
  document.getElementById("c-po-number").value = job.poNumber || "";
  document.getElementById("c-job-no").value = job.jobId || "";
  const projectSel = document.getElementById("c-project");
  if (job.projectId && Array.from(projectSel.options).some((o) => o.value === job.projectId)) {
    projectSel.value = job.projectId;
  }
  const workItemEl = document.getElementById("c-workItem");
  if (!workItemEl.value.trim() && job.description) {
    workItemEl.value = job.description;
  }
  sourceJobPoAmount = jobFullAmount(job);
  document.getElementById("c-po-amount").value = sourceJobPoAmount != null ? `฿${formatMoney(sourceJobPoAmount)}` : "— ไม่มีข้อมูลราคาในงานนี้ / No price on this job —";
  recalcClaimAmount();
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
  const sourceJobId = document.getElementById("c-source-job").value;
  const poNumber = document.getElementById("c-po-number").value.trim();
  const sourceJobNo = document.getElementById("c-job-no").value.trim();

  if (!projectId || !workItem || progressPercent === "" || claimAmount === "" || !claimDate) {
    showToast(T.msgFillRequired.th);
    return;
  }

  const payload = {
    projectId,
    project,
    workItem,
    poNumber,
    sourceJobId,
    sourceJobNo,
    poAmount: sourceJobPoAmount,
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
  setPrintPage("landscape", 8); // รายงานตารางหลายคอลัมน์ = พิมพ์แนวนอน A4
  showToast(T.pdfPrintHint.th);
  setTimeout(() => window.print(), 300);
}
