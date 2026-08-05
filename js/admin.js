import {
  COMPANY, CLAIM_STATUS, MAX_IMAGES, MAX_IMAGE_MB,
  CONTRACTOR_JOB_TYPE, CONTRACTOR_JOB_TYPE_STYLE, CONTRACTOR_JOB_STATUS, CONTRACTOR_JOB_STATUS_STYLE,
  OTHER_APP_URL,
} from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, formatMoney, escapeHtml, todayStr } from "./utils.js";
import { loadAdmins, addAdmin, updateAdmin } from "./admins.js";
import { T, claimStatusTri, jobTypeTri, contractorJobStatusTri } from "./i18n.js";
import { loadProjects, addProject, updateProject } from "./projects.js";
import { addClaim, resubmitClaim, watchAllClaims, deleteClaim, approveClaimStep, rejectClaimStep } from "./claims.js";
import { watchAllContractorJobs, setPoNumber, approveJobDeliveryStep, rejectJobDeliveryStep } from "./contractor-jobs.js";
import {
  importLegacyPurchaseOrders,
  importLegacyPurchaseOrderRecords,
  addLegacyPoManual,
  findExistingLegacyPo,
  watchAllLegacyPOs,
  reassignLegacyPoProject,
  deleteLegacyPo,
  updateLegacyPoContractorName,
  bulkUpdateLegacyPoContractorNameByNickname,
} from "./legacy-po.js";
import { compressImageToDataUrl } from "./image-compress.js";
import { ensureApproval, renderApprovalStepper, APPROVAL_STATUS, APPROVAL_STEP_DEFS } from "./approval.js";

renderCompanyBrandBar("brand-bar", COMPANY);

// ============================================================
//  ระบุตัวตนด้วยการ "เลือกชื่อ" — เหมือน repair-app (ไม่ใช่ระบบล็อกอินจริง)
//  รายชื่อแอดมิน (admins) โหลดจาก Firestore ผ่าน js/admins.js — ใช้ collection เดียวกับ repair-app
//  (เพิ่ม/แก้ไข/ปิดใช้งานได้เองจากหัวข้อ "จัดการรายชื่อแอดมิน" ในแดชบอร์ด มีผลกับทั้งสองระบบทันที)
// ============================================================
const IDENTITY_KEY = "progressClaimAdminIdentity";
let admins = [];
function getIdentity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
    if (parsed && admins.some((a) => a.id === parsed.id)) return parsed;
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

function renderIdGrid() {
  const activeAdmins = admins.filter((a) => a.active !== false);
  idGrid.innerHTML = activeAdmins.map(
    (a) => `<button type="button" class="admin-chip" data-id="${a.id}"><span class="id-num">${escapeHtml(a.id)}</span>${escapeHtml(a.name)}</button>`
  ).join("");
  idGrid.querySelectorAll(".admin-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const found = admins.find((a) => a.id === btn.dataset.id);
      if (found) {
        setIdentity(found);
        showDashboard();
      }
    });
  });
}
document.getElementById("switch-user-btn").addEventListener("click", () => {
  clearIdentity();
  identityScreen.style.display = "flex";
  dashboard.style.display = "none";
});

let currentAdmin = null;
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

// โหลดรายชื่อแอดมินจาก Firestore ก่อน แล้วค่อยตัดสินใจว่าจะโชว์แดชบอร์ดเลย (ถ้าเคยเลือกชื่อไว้แล้ว) หรือ
// โชว์หน้าเลือกชื่อ — ต้องรอโหลดเสร็จก่อนเพราะต้องเอารายชื่อจริงมาตรวจสอบ identity ที่จำไว้ใน localStorage
// (เรียกหลังประกาศตัวแปร state ทั้งหมดข้างบนแล้ว เหตุผลเดียวกับที่เคยเป็นคอมเมนต์ตรงนี้เดิม)
(async function initIdentity() {
  try {
    admins = await loadAdmins();
  } catch (e) {
    console.warn("โหลดรายชื่อแอดมินไม่สำเร็จ", e);
    showToast(T.msgAdminLoadFail.th, 4000);
  }
  renderIdGrid();
  const stored = getIdentity();
  if (stored) {
    currentAdmin = stored;
    showDashboard();
  } else {
    identityScreen.style.display = "flex";
  }
})();

async function main() {
  if (mainStarted) return;
  mainStarted = true;

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
  // ตอนนี้ยอดเงิน PO แก้ไขเองได้แล้ว (ไม่ใช่แค่ดึงอัตโนมัติจากรายการที่อ้างอิง) — พิมพ์แก้เองก็คำนวณยอดเบิกใหม่ให้ทันที
  document.getElementById("c-po-amount").addEventListener("input", recalcClaimAmount);
  // เปลี่ยนโปรเจกต์ในฟอร์ม → รายการ PO/ใบส่งมอบงานด้านล่างต้องกรองใหม่ตามโปรเจกต์นั้น และเคลียร์การอ้างอิง PO เดิมทิ้ง
  // (เพราะ PO เดิมอาจไม่ได้อยู่ในโปรเจกต์ใหม่ที่เพิ่งเลือก)
  document.getElementById("c-project").addEventListener("change", (e) => {
    refreshSourceJobOptions("", "", e.target.value);
    document.getElementById("c-po-number").value = "";
    document.getElementById("c-job-no").value = "";
    document.getElementById("c-po-amount").value = "";
    sourceJobPoAmount = null;
  });
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

  document.getElementById("admin-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("admin-name");
    const name = nameInput.value.trim();
    if (!name) {
      showToast(T.msgAdminNameRequired.th);
      return;
    }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const newId = await addAdmin({ name }, admins);
      admins.push({ id: newId, name, active: true, order: parseInt(newId, 10) });
      renderAdminManageList();
      renderIdGrid();
      nameInput.value = "";
      showToast(T.msgSaved.th);
    } catch (err) {
      console.error(err);
      showToast(T.msgSavedFail.th);
    } finally {
      submitBtn.disabled = false;
    }
  });
  renderAdminManageList();

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
    <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);" data-proj-id="${p.id}">
      <input type="color" class="proj-color-input" value="${p.color || "#4f46e5"}" data-field="color" style="width:34px; height:30px; padding:2px; flex-shrink:0;">
      <input type="text" class="proj-label-input" value="${escapeHtml(p.label)}" data-field="label" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border); border-radius:8px;">
      <button class="btn btn-outline btn-sm save-proj-btn" data-id="${p.id}">Save / บันทึก / 保存</button>
      <button class="btn btn-outline btn-sm toggle-proj-btn" data-id="${p.id}" data-active="${p.active !== false}">
        ${p.active === false ? "Enable / เปิดใช้งาน" : "Disable / ปิดใช้งาน"}
      </button>
    </div>`
    )
    .join("");
  el.querySelectorAll(".save-proj-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = el.querySelector(`[data-proj-id="${btn.dataset.id}"]`);
      const label = row.querySelector('[data-field="label"]').value.trim();
      const color = row.querySelector('[data-field="color"]').value;
      if (!label) {
        showToast(T.msgFillRequired.th);
        return;
      }
      try {
        await updateProject(btn.dataset.id, { label, color });
        await refreshProjects();
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
    });
  });
  el.querySelectorAll(".toggle-proj-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const active = btn.dataset.active === "true";
      await updateProject(btn.dataset.id, { active: !active });
      await refreshProjects();
    });
  });
}

function renderAdminManageList() {
  const el = document.getElementById("admin-manage-list");
  if (!el) return;
  const sorted = [...admins].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.name || "").localeCompare(b.name || "", "th"));
  el.innerHTML = sorted
    .map(
      (a) => `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);" data-admin-id="${a.id}">
      <span class="id-num" style="flex:0 0 auto;">${escapeHtml(a.id)}</span>
      <input type="text" class="admin-name-input" value="${escapeHtml(a.name || "")}" data-field="name" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border); border-radius:8px;">
      ${a.active === false ? `<span class="badge" style="background:#fee2e2; color:#991b1b;">Disabled / ปิดใช้งานอยู่ / 已停用</span>` : ""}
      <button class="btn btn-outline btn-sm save-admin-btn" data-id="${a.id}">Save / บันทึก / 保存</button>
      <button class="btn ${a.active === false ? "btn-secondary" : "btn-outline"} btn-sm toggle-admin-btn" data-id="${a.id}" data-active="${a.active !== false}">
        ${a.active === false ? "Enable / เปิดใช้งาน" : "Disable / ปิดใช้งาน"}
      </button>
    </div>`
    )
    .join("");
  el.querySelectorAll(".save-admin-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = el.querySelector(`[data-admin-id="${btn.dataset.id}"]`);
      const name = row.querySelector('[data-field="name"]').value.trim();
      if (!name) {
        showToast(T.msgAdminNameRequired.th);
        return;
      }
      try {
        await updateAdmin(btn.dataset.id, { name });
        const a = admins.find((x) => x.id === btn.dataset.id);
        if (a) a.name = name;
        renderAdminManageList();
        renderIdGrid();
        if (currentAdmin && currentAdmin.id === btn.dataset.id) {
          currentAdmin = { ...currentAdmin, name };
          setIdentity(currentAdmin);
          whoamiEl.textContent = `👤 ${currentAdmin.name}`;
        }
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
    });
  });
  el.querySelectorAll(".toggle-admin-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const active = btn.dataset.active === "true";
      try {
        await updateAdmin(btn.dataset.id, { active: !active });
        const a = admins.find((x) => x.id === btn.dataset.id);
        if (a) a.active = !active;
        renderAdminManageList();
        renderIdGrid();
        showToast(T.msgSaved.th);
      } catch (e) {
        console.error(e);
        showToast(T.msgSavedFail.th);
      }
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
    <div class="stat-card" style="--stat-color:#4f46e5;"><div class="stat-icon">💰</div><div class="stat-body"><div class="num" style="color:#4f46e5;">฿${formatMoney(total)}</div><div class="lbl">${T.totalClaimedLabel.th}</div></div></div>
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
      const approval = ensureApproval(c.approval);
      const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
      const stepHint =
        approval.status === APPROVAL_STATUS.IN_PROGRESS
          ? `<div class="hint" style="margin-top:2px;">${stepDef?.icon || ""} ${approval.currentStep}/4 ${escapeHtml(stepDef?.labelTh || "")}</div>`
          : "";
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
        <td><span class="cat-badge" style="background:${style.bg}; color:${style.text};"><span class="dot" style="background:${style.dot};"></span>${claimStatusTri(c.status)}</span>${stepHint}</td>
        <td>
          <button class="btn btn-outline btn-sm edit-claim-btn" data-id="${c.id}">✏️</button>
          ${approval.status === APPROVAL_STATUS.IN_PROGRESS ? `<button class="btn btn-outline btn-sm approve-btn" data-id="${c.id}" title="${T.btnApprove.th}">✅</button>` : ""}
          ${approval.status === APPROVAL_STATUS.IN_PROGRESS ? `<button class="btn btn-outline btn-sm reject-btn" data-id="${c.id}" title="${T.btnReject.th}">❌</button>` : ""}
          <button class="btn btn-outline btn-sm send-approval-link-btn" data-id="${c.id}" title="Send approval link / ส่งลิงก์อนุมัติ / 发送审批链接">🔗</button>
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
    btn.addEventListener("click", () => approveClaimRow(btn.dataset.id));
  });
  tbody.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => rejectClaimRow(btn.dataset.id));
  });
  tbody.querySelectorAll(".send-approval-link-btn").forEach((btn) => {
    btn.addEventListener("click", () => showApprovalLink(btn.dataset.id));
  });
  tbody.querySelectorAll(".delete-claim-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteClaimRow(btn.dataset.id));
  });
}

// อนุมัติ/ปฏิเสธ "ขั้นตอนปัจจุบัน" ของ chain 4 ขั้น — ใครก็ได้ที่ล็อกอินอยู่ (currentAdmin) กดแทนขั้นตอนไหนก็ได้
async function approveClaimRow(id) {
  const c = allClaims.find((x) => x.id === id);
  if (!c) return;
  const approval = ensureApproval(c.approval);
  const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
  if (!confirm(`Approve step ${approval.currentStep}/4 (${stepDef?.labelTh}) as "${currentAdmin?.name}"? / ยืนยันอนุมัติขั้นตอนที่ ${approval.currentStep}/4 (${stepDef?.labelTh}) ในนาม "${currentAdmin?.name}"?`)) return;
  try {
    await approveClaimStep(id, currentAdmin?.name, "");
    showToast(T.msgSaved.th);
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  }
}

async function rejectClaimRow(id) {
  const c = allClaims.find((x) => x.id === id);
  if (!c) return;
  const approval = ensureApproval(c.approval);
  const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
  const note = prompt(`Reason for rejection (optional) / เหตุผลที่ปฏิเสธ (ถ้ามี):`, "") || "";
  if (!confirm(`Reject step ${approval.currentStep}/4 (${stepDef?.labelTh}) as "${currentAdmin?.name}"? This ends the approval process immediately — the claim must be edited and resubmitted from step 1. / ยืนยันปฏิเสธขั้นตอนที่ ${approval.currentStep}/4 (${stepDef?.labelTh})? กระบวนการจะจบทันที ต้องแก้ไขแล้วส่งใหม่ตั้งแต่ขั้นตอนที่ 1`)) return;
  try {
    await rejectClaimStep(id, currentAdmin?.name, note);
    showToast(T.msgSaved.th);
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  }
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
        const jobApproval = ensureApproval(j.approval);
        const jobStepDef = APPROVAL_STEP_DEFS.find((d) => d.step === jobApproval.currentStep);
        const stepHint =
          j.deliverySubmitted && !j.deliveryAccepted && jobApproval.status === APPROVAL_STATUS.IN_PROGRESS
            ? `<div class="hint" style="margin-top:2px;">${jobStepDef?.icon || ""} ${jobApproval.currentStep}/4 ${escapeHtml(jobStepDef?.labelTh || "")}</div>`
            : "";
        let deliveryLine = `<div class="hint" style="margin-top:4px;">- ${T.msgAwaitingDelivery.th}</div>`;
        if (j.deliveryAccepted) {
          deliveryLine = `<div class="hint" style="margin-top:4px; color:#1e40af; font-weight:600;">✅ ${formatDateThai(j.deliveryDate)}${photoCountBadge}</div>${roundBadge}`;
        } else if (j.deliverySubmitted) {
          deliveryLine = `
            <div class="hint" style="margin-top:4px; color:#92400e;">⏳ ${formatDateThai(j.deliveryDate)}${photoCountBadge}</div>${roundBadge}${stepHint}
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
      const approval = ensureApproval(j.approval);
      const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
      if (!confirm(`Approve step ${approval.currentStep}/4 (${stepDef?.labelTh}) for job "${j.jobId || id}" as "${currentAdmin?.name}"? / ยืนยันอนุมัติขั้นตอนที่ ${approval.currentStep}/4 (${stepDef?.labelTh}) ของงาน "${j.jobId || id}" ในนาม "${currentAdmin?.name}"?`)) return;
      try {
        await approveJobDeliveryStep(id, currentAdmin?.name, "");
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
      const approval = ensureApproval(j.approval);
      const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === approval.currentStep);
      const note = prompt(`${T.promptInspectionFailNote.en} / ${T.promptInspectionFailNote.th}`, "") || "";
      if (!confirm(`Reject step ${approval.currentStep}/4 (${stepDef?.labelTh}) for job "${j.jobId || id}" as "${currentAdmin?.name}"? Contractor will need to resubmit. / ยืนยันปฏิเสธขั้นตอนที่ ${approval.currentStep}/4 (${stepDef?.labelTh}) ของงาน "${j.jobId || id}"? ผู้รับเหมาต้องส่งมอบงานใหม่`)) return;
      try {
        await rejectJobDeliveryStep(id, currentAdmin?.name, note);
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

      <div class="dn-section-title">✍️ Acceptance / การตรวจรับ (4 ขั้นตอน)</div>
      ${renderApprovalStepper(ensureApproval(j.approval), { lang: "all", escapeHtml })}
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

// ============================================================
//  IMPORT FROM EXCEL — ให้แอดมินอัปโหลดไฟล์ .xlsx เองได้ (ไม่ต้องรอให้โปรแกรมเมอร์เตรียมไฟล์ JSON ให้)
//  ขั้นตอน: เลือกไฟล์ → จับคู่คอลัมน์กับฟิลด์ที่ระบบต้องการ → ดูตัวอย่าง → ยืนยันนำเข้า
// ============================================================
const LEGACY_PO_TARGET_FIELDS = [
  { key: "poNumber", label: "PO Number / เลขที่ PO / PO单号", required: true },
  { key: "project", label: "Project / โปรเจกต์ / 项目", required: true },
  { key: "contractorNickname", label: "Contractor nickname / ชื่อเล่นช่าง / 承包商昵称", required: false },
  { key: "vendorName", label: "Vendor name / ชื่อผู้ขาย / 供应商名称", required: false },
  { key: "issueDate", label: "Issue date / วันที่ออกเอกสาร / 开单日期", required: false },
  { key: "status", label: "Status / สถานะ / 状态", required: false },
  { key: "totalAmount", label: "Total amount / ยอดรวม / 总金额", required: false },
  { key: "vatAmount", label: "VAT amount / ภาษีมูลค่าเพิ่ม / 增值税", required: false },
  { key: "whtAmount", label: "WHT amount / หัก ณ ที่จ่าย / 预扣税", required: false },
  { key: "netPayable", label: "Net payable / ยอดสุทธิ / 净应付金额", required: false },
  { key: "notes", label: "Notes / หมายเหตุ / 备注", required: false },
];
const LEGACY_PO_FIELD_GUESS_PATTERNS = {
  poNumber: ["po", "เลขที่"],
  project: ["project", "โปรเจกต์", "site", "ไซต์"],
  contractorNickname: ["contractor", "ช่าง", "nickname", "ชื่อเล่น"],
  vendorName: ["vendor", "ผู้ขาย", "supplier"],
  issueDate: ["date", "วันที่"],
  status: ["status", "สถานะ"],
  totalAmount: ["total", "รวม"],
  vatAmount: ["vat", "ภาษีมูลค่าเพิ่ม"],
  whtAmount: ["wht", "หัก"],
  netPayable: ["net", "สุทธิ"],
  notes: ["note", "หมายเหตุ", "remark"],
};

function cellToString(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "object") {
    if (v.text != null) return String(v.text).trim();
    if (v.richText) return v.richText.map((t) => t.text || "").join("").trim();
    if (v.result != null) return String(v.result).trim();
    return "";
  }
  return String(v).trim();
}
function cellToNumber(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return null;
  if (typeof v === "object" && v.result != null) v = v.result;
  const n = Number(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}
function guessColumnForField(headers, fieldKey) {
  const patterns = LEGACY_PO_FIELD_GUESS_PATTERNS[fieldKey] || [];
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase();
    if (patterns.some((p) => h.includes(p.toLowerCase()))) return i;
  }
  return null;
}

let excelImportHeaders = [];
let excelImportDataRows = [];
let excelImportRecords = [];

function openExcelImportModal() {
  excelImportHeaders = [];
  excelImportDataRows = [];
  excelImportRecords = [];
  document.getElementById("excel-import-file-input").value = "";
  document.getElementById("excel-import-progress-status").textContent = "";
  showExcelImportStep("file");
  document.getElementById("excel-import-modal").style.display = "flex";
}
function closeExcelImportModal() {
  document.getElementById("excel-import-modal").style.display = "none";
}
function showExcelImportStep(step) {
  document.getElementById("excel-import-step-file").style.display = step === "file" ? "" : "none";
  document.getElementById("excel-import-step-map").style.display = step === "map" ? "" : "none";
  document.getElementById("excel-import-step-preview").style.display = step === "preview" ? "" : "none";
}
function renderExcelImportMapFields() {
  const container = document.getElementById("excel-import-map-fields");
  container.innerHTML = LEGACY_PO_TARGET_FIELDS.map((f) => {
    const guessedIdx = guessColumnForField(excelImportHeaders, f.key);
    const options = [`<option value="">— ไม่ใช้ / Not mapped —</option>`]
      .concat(
        excelImportHeaders.map(
          (h, i) => `<option value="${i}" ${i === guessedIdx ? "selected" : ""}>${escapeHtml(h)}</option>`
        )
      )
      .join("");
    return `
    <div class="field" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <label style="min-width:260px; margin-bottom:0;">${f.label}${f.required ? " *" : ""}</label>
      <select class="excel-map-select" data-field="${f.key}" style="flex:1;">${options}</select>
    </div>`;
  }).join("");
}
function buildRecordsFromExcelMapping(mapping) {
  const records = [];
  let skippedMissing = 0;
  for (const row of excelImportDataRows) {
    const poNumber = mapping.poNumber != null ? cellToString(row[mapping.poNumber]) : "";
    const project = mapping.project != null ? cellToString(row[mapping.project]) : "";
    if (!poNumber || !project) {
      skippedMissing++;
      continue;
    }
    records.push({
      poNumber,
      project,
      rawProjectText: project,
      contractorNickname: mapping.contractorNickname != null ? cellToString(row[mapping.contractorNickname]) : "",
      vendorName: mapping.vendorName != null ? cellToString(row[mapping.vendorName]) : "",
      issueDate: mapping.issueDate != null ? cellToString(row[mapping.issueDate]) : "",
      status: mapping.status != null ? cellToString(row[mapping.status]) : "",
      totalAmount: mapping.totalAmount != null ? cellToNumber(row[mapping.totalAmount]) : null,
      vatAmount: mapping.vatAmount != null ? cellToNumber(row[mapping.vatAmount]) : null,
      whtAmount: mapping.whtAmount != null ? cellToNumber(row[mapping.whtAmount]) : null,
      netPayable: mapping.netPayable != null ? cellToNumber(row[mapping.netPayable]) : null,
      notes: mapping.notes != null ? cellToString(row[mapping.notes]) : "",
      lineItems: [],
    });
  }
  return { records, skippedMissing };
}
function renderExcelImportPreviewTable(records) {
  const tbody = document.getElementById("excel-import-preview-tbody");
  const shown = records.slice(0, 50);
  tbody.innerHTML =
    shown
      .map(
        (r) => `
    <tr>
      <td>${escapeHtml(r.poNumber)}</td>
      <td>${escapeHtml(r.project)}</td>
      <td>${escapeHtml(r.contractorNickname)}</td>
      <td>${escapeHtml(r.vendorName)}</td>
      <td>${escapeHtml(r.issueDate)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td style="text-align:right;">${r.totalAmount != null ? Number(r.totalAmount).toLocaleString("th-TH") : "-"}</td>
    </tr>`
      )
      .join("") +
    (records.length > 50
      ? `<tr><td colspan="7" class="hint" style="text-align:center;">...และอีก ${records.length - 50} แถว / and ${records.length - 50} more rows...</td></tr>`
      : "");
}

document.getElementById("import-legacy-po-excel-btn").addEventListener("click", openExcelImportModal);
document.getElementById("close-excel-import-modal").addEventListener("click", closeExcelImportModal);
document.getElementById("excel-import-back-to-file-btn").addEventListener("click", () => showExcelImportStep("file"));
document.getElementById("excel-import-back-to-map-btn").addEventListener("click", () => showExcelImportStep("map"));

document.getElementById("excel-import-file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("ไม่พบชีทข้อมูลในไฟล์ / No sheet found in file");
    const headerRow = ws.getRow(1);
    const colCount = Math.max(ws.columnCount || 0, headerRow.cellCount || 0);
    const headers = [];
    for (let c = 1; c <= colCount; c++) {
      const v = headerRow.getCell(c).value;
      headers.push(cellToString(v) || `Column ${c}`);
    }
    const dataRows = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = [];
      for (let c = 1; c <= colCount; c++) cells.push(row.getCell(c).value);
      if (cells.every((v) => v == null || v === "")) return;
      dataRows.push(cells);
    });
    if (!dataRows.length) {
      throw new Error("ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางแถวแรก และมีข้อมูลอย่างน้อย 1 แถว) / No data rows found");
    }
    excelImportHeaders = headers;
    excelImportDataRows = dataRows;
    renderExcelImportMapFields();
    showExcelImportStep("map");
  } catch (err) {
    console.error(err);
    showToast("อ่านไฟล์ไม่สำเร็จ / Failed to read file: " + err.message);
  }
});

document.getElementById("excel-import-preview-btn").addEventListener("click", () => {
  const mapping = {};
  document.querySelectorAll(".excel-map-select").forEach((s) => {
    if (s.value !== "") mapping[s.dataset.field] = Number(s.value);
  });
  if (mapping.poNumber == null || mapping.project == null) {
    showToast("กรุณาจับคู่คอลัมน์ 'เลขที่ PO' และ 'โปรเจกต์' อย่างน้อย / Please map PO Number and Project at least");
    return;
  }
  const { records, skippedMissing } = buildRecordsFromExcelMapping(mapping);
  excelImportRecords = records;
  document.getElementById("excel-import-preview-summary").textContent =
    `พบข้อมูล ${excelImportDataRows.length} แถว, พร้อมนำเข้า ${records.length} แถว, ข้าม ${skippedMissing} แถว (ไม่มีเลขที่ PO หรือโปรเจกต์) / ${excelImportDataRows.length} rows detected, ${records.length} ready to import, ${skippedMissing} skipped (missing PO number or project).`;
  renderExcelImportPreviewTable(records);
  showExcelImportStep("preview");
});

document.getElementById("excel-import-confirm-btn").addEventListener("click", async () => {
  const btn = document.getElementById("excel-import-confirm-btn");
  const statusEl = document.getElementById("excel-import-progress-status");
  if (!excelImportRecords.length) {
    showToast("ไม่มีรายการที่จะนำเข้า / Nothing to import");
    return;
  }
  btn.disabled = true;
  try {
    statusEl.textContent = "กำลังนำเข้า... / Importing...";
    const importBatch = "excel_" + todayStr();
    const result = await importLegacyPurchaseOrderRecords(
      excelImportRecords,
      (done, total) => {
        statusEl.textContent = `กำลังนำเข้า ${done}/${total}... / Importing ${done}/${total}...`;
      },
      importBatch
    );
    await refreshProjects();
    statusEl.textContent = `เสร็จแล้ว: นำเข้าใหม่ ${result.created} รายการ, ข้ามที่มีอยู่แล้ว ${result.skipped} รายการ / Done: ${result.created} imported, ${result.skipped} skipped (already imported).`;
    showToast(T.msgSaved.th);
    setTimeout(closeExcelImportModal, 1400);
  } catch (e) {
    console.error(e);
    statusEl.textContent = "นำเข้าไม่สำเร็จ / Import failed: " + e.message;
    showToast(T.msgSavedFail.th);
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
//  ADD PO MANUALLY — เพิ่มใบสั่งซื้อเก่าทีละใบ (เช่น อ่านค่าจากไฟล์ PDF แล้วพิมพ์กรอกเอง)
// ============================================================
function openManualPoModal() {
  document.getElementById("mp-po-number").value = "";
  document.getElementById("mp-project").value = "";
  document.getElementById("mp-contractor").value = "";
  document.getElementById("mp-vendor").value = "";
  document.getElementById("mp-date").value = "";
  document.getElementById("mp-status").value = "";
  document.getElementById("mp-total").value = "";
  document.getElementById("mp-vat").value = "";
  document.getElementById("mp-wht").value = "";
  document.getElementById("mp-net").value = "";
  document.getElementById("mp-notes").value = "";
  document.getElementById("mp-project-options").innerHTML = allProjects
    .map((p) => `<option value="${escapeHtml(p.label)}"></option>`)
    .join("");
  document.getElementById("manual-po-modal").style.display = "flex";
}
function closeManualPoModal() {
  document.getElementById("manual-po-modal").style.display = "none";
}
document.getElementById("add-legacy-po-manual-btn").addEventListener("click", openManualPoModal);
document.getElementById("close-manual-po-modal").addEventListener("click", closeManualPoModal);
document.getElementById("cancel-manual-po-btn").addEventListener("click", closeManualPoModal);

document.getElementById("save-manual-po-btn").addEventListener("click", async () => {
  const poNumber = document.getElementById("mp-po-number").value.trim();
  const project = document.getElementById("mp-project").value.trim();
  const contractorNickname = document.getElementById("mp-contractor").value.trim();
  if (!poNumber || !project) {
    showToast("กรุณากรอกเลขที่ PO และโปรเจกต์ / Please fill in PO Number and Project");
    return;
  }
  const existing = await findExistingLegacyPo(poNumber, contractorNickname);
  if (existing) {
    const proceed = confirm(
      `พบใบสั่งซื้อเลขที่ "${poNumber}" ของช่าง "${contractorNickname || "-"}" อยู่แล้วในระบบ ต้องการเพิ่มซ้ำหรือไม่?\nA PO with this number and contractor already exists — add a duplicate anyway?`
    );
    if (!proceed) return;
  }
  const btn = document.getElementById("save-manual-po-btn");
  btn.disabled = true;
  try {
    await addLegacyPoManual({
      poNumber,
      project,
      contractorNickname,
      vendorName: document.getElementById("mp-vendor").value.trim(),
      issueDate: document.getElementById("mp-date").value,
      status: document.getElementById("mp-status").value.trim(),
      totalAmount: document.getElementById("mp-total").value !== "" ? Number(document.getElementById("mp-total").value) : null,
      vatAmount: document.getElementById("mp-vat").value !== "" ? Number(document.getElementById("mp-vat").value) : null,
      whtAmount: document.getElementById("mp-wht").value !== "" ? Number(document.getElementById("mp-wht").value) : null,
      netPayable: document.getElementById("mp-net").value !== "" ? Number(document.getElementById("mp-net").value) : null,
      notes: document.getElementById("mp-notes").value.trim(),
    });
    await refreshProjects();
    showToast(T.msgSaved.th);
    closeManualPoModal();
  } catch (e) {
    console.error(e);
    showToast(T.msgSavedFail.th);
  } finally {
    btn.disabled = false;
  }
});

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
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm legacy-po-view-btn" data-id="${p.id}" title="View / ดู / 查看">👁️</button><br>
        <a class="btn btn-outline btn-sm" href="delivery-notes-list.html?poId=${p.id}" target="_blank" rel="noopener" title="Delivery notes / ใบส่งมอบงาน (ส่งได้หลายใบ) / 交付单" style="white-space:nowrap; margin-top:4px; display:inline-block;">📦 ใบส่งมอบงาน${p.deliveryNoteCount ? ` (${p.deliveryNoteCount})` : ""}</a>
      </td>
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

  // เติมช่องแก้ไขชื่อผู้รับเหมา — และถ้ามีรายการอื่นที่ชื่อเล่นเดียวกันอยู่ ให้โชว์ตัวเลือก "แก้ไขทั้งหมดด้วย"
  document.getElementById("legacy-po-edit-nickname").value = p.contractorNickname || "";
  document.getElementById("legacy-po-edit-vendorname").value = p.vendorName || "";
  const applyAllWrap = document.getElementById("legacy-po-edit-applyall-wrap");
  const applyAllCheckbox = document.getElementById("legacy-po-edit-applyall");
  applyAllCheckbox.checked = false;
  const sameNicknameCount = allLegacyPOs.filter((x) => (x.contractorNickname || "") === (p.contractorNickname || "")).length;
  if (p.contractorNickname && sameNicknameCount > 1) {
    document.getElementById("legacy-po-edit-applyall-label").textContent =
      `Apply to all ${sameNicknameCount} POs with nickname "${p.contractorNickname}" too / แก้ไขให้ทุกใบสั่งซื้อ (${sameNicknameCount} รายการ) ที่มีชื่อเล่น "${p.contractorNickname}" ด้วย / 同时应用于所有相同昵称的${sameNicknameCount}张采购单`;
    applyAllWrap.style.display = "flex";
  } else {
    applyAllWrap.style.display = "none";
  }

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
document.getElementById("legacy-po-save-name-btn").addEventListener("click", async () => {
  if (!legacyPoViewingId) return;
  const p = allLegacyPOs.find((x) => x.id === legacyPoViewingId);
  if (!p) return;
  const newNickname = document.getElementById("legacy-po-edit-nickname").value.trim();
  const newVendorName = document.getElementById("legacy-po-edit-vendorname").value.trim();
  const applyAll = document.getElementById("legacy-po-edit-applyall").checked;
  const btn = document.getElementById("legacy-po-save-name-btn");
  btn.disabled = true;
  try {
    if (applyAll) {
      // ใช้ชื่อเล่น "เดิม" (จาก p ที่โหลดไว้ตอนเปิด modal นี้) เป็นตัวจับคู่รายการอื่น ไม่ใช่ค่าที่เพิ่งพิมพ์ใหม่
      const count = await bulkUpdateLegacyPoContractorNameByNickname(p.contractorNickname || "", newNickname, newVendorName);
      showToast(`${T.msgSaved.th} (${count} รายการ / ${count} records)`);
    } else {
      await updateLegacyPoContractorName(legacyPoViewingId, newNickname, newVendorName);
      showToast(T.msgSaved.th);
    }
    closeLegacyPoView();
  } catch (err) {
    console.error(err);
    showToast(T.msgSavedFail.th);
  } finally {
    btn.disabled = false;
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

// หมายเหตุ: เดิมมี setStatus(id, status) ให้แก้สถานะตรงๆ แบบไม่มีการตรวจสอบ — ถูกแทนที่ด้วย
// approveClaimRow/rejectClaimRow ด้านบนซึ่งใช้ระบบอนุมัติ 4 ขั้นตอนแทน (ปิดช่องโหว่การแก้สถานะเอง)

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
  const claimIdInput = document.getElementById("c-claimId");
  claimIdInput.value = claim ? claim.claimId : "(auto)";
  // เลขที่เบิกสร้างอัตโนมัติตอนสร้างรายการใหม่เท่านั้น (ยังไม่มีให้แก้ตอนนั้น) แต่แก้ไขเองได้ภายหลังจากรายการที่มีอยู่แล้ว
  claimIdInput.disabled = !claim;
  const claimIdHint = document.getElementById("c-claimId-hint");
  if (claimIdHint) claimIdHint.style.display = claim ? "none" : "block";
  const openProjectId = claim ? claim.projectId : allProjects.find((p) => p.active !== false)?.id || "";
  document.getElementById("c-project").value = openProjectId;
  document.getElementById("c-workItem").value = claim ? claim.workItem : "";
  document.getElementById("c-progress").value = claim ? claim.progressPercent : "";
  document.getElementById("c-amount").value = claim ? claim.claimAmount : "";
  document.getElementById("c-date").value = claim ? claim.claimDate : todayStr();
  document.getElementById("c-notes").value = claim ? claim.notes || "" : "";
  const approvalPreviewEl = document.getElementById("c-approval-preview");
  if (approvalPreviewEl) {
    if (claim) {
      approvalPreviewEl.innerHTML = renderApprovalStepper(ensureApproval(claim.approval), { lang: "all", escapeHtml });
      const warnEl = document.getElementById("c-approval-resubmit-warn");
      if (warnEl) warnEl.style.display = "block";
    } else {
      approvalPreviewEl.innerHTML = "";
      const warnEl = document.getElementById("c-approval-resubmit-warn");
      if (warnEl) warnEl.style.display = "none";
    }
  }
  // ต้องเลือกโปรเจกต์ก่อนเสมอ แล้วรายการ PO/ใบส่งมอบงานด้านล่างจะกรองเฉพาะโปรเจกต์นั้น
  // claim เก่าก่อนรองรับ PEAK (ไม่มีฟิลด์ sourceType) แต่มี sourceJobId แล้ว ให้ถือว่าอ้างอิงจาก "งานผู้รับเหมา" ตามเดิม
  const openSourceType = claim ? claim.sourceType || (claim.sourceJobId ? "job" : "") : "";
  refreshSourceJobOptions(openSourceType, claim ? claim.sourceJobId || "" : "", openProjectId);
  document.getElementById("c-po-number").value = claim ? claim.poNumber || "" : "";
  document.getElementById("c-job-no").value = claim ? claim.sourceJobNo || "" : "";
  sourceJobPoAmount = claim && claim.poAmount != null ? Number(claim.poAmount) : null;
  document.getElementById("c-po-amount").value = sourceJobPoAmount != null ? sourceJobPoAmount : "";
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

// อ่านยอดเงิน PO ปัจจุบันจากช่องกรอกโดยตรง (ตอนนี้แก้ไขเองได้แล้ว ไม่ได้ล็อกตามที่เลือกจาก dropdown
// เพียงอย่างเดียวอีกต่อไป) — ตัดสัญลักษณ์ ฿ / คอมมา ออกก่อนแปลงเป็นตัวเลข
function getPoAmountFromField() {
  const raw = document.getElementById("c-po-amount").value;
  if (raw === "" || raw == null) return null;
  const num = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

// คำนวณ "ยอดเบิก" ใหม่ = ยอดเงิน PO เต็ม (จากช่องกรอก ไม่ว่าจะดึงอัตโนมัติหรือพิมพ์เอง) × (% ความคืบหน้า / 100)
// — ทำงานเฉพาะตอนมียอดเงิน PO อยู่ในช่องเท่านั้น (ถ้าว่างไว้ ช่องยอดเบิกยังกรอกเองได้ตามปกติ ไม่ถูกคำนวณทับ)
function recalcClaimAmount() {
  const poAmt = getPoAmountFromField();
  if (poAmt == null) return;
  const progress = Number(document.getElementById("c-progress").value);
  if (!Number.isFinite(progress)) return;
  const amount = Math.round(poAmt * (progress / 100) * 100) / 100;
  document.getElementById("c-amount").value = amount;
}

// รายชื่องานผู้รับเหมาที่ "มีเลขที่ PO แล้ว" เท่านั้น — ใช้เป็นตัวเลือกให้ผูกรายการเบิกงวดกับ PO/ใบส่งมอบงาน
// (ข้อมูลชุดเดียวกับที่ repair-app สร้างไว้ อ่านแบบเรียลไทม์ผ่าน allContractorJobs ที่ subscribe ไว้ตั้งแต่ main())
// กรองเฉพาะโปรเจกต์ที่เลือกไว้ในฟอร์ม (projectId) เท่านั้น — ไม่งั้นรายการ PO จากทุกโปรเจกต์จะปนกันจนหาไม่เจอ
function jobsWithPO(projectId) {
  return allContractorJobs.filter((j) => (j.poNumber || "").trim() && j.projectId === projectId);
}

// รายการ PO เก่าที่นำเข้าจาก PEAK เฉพาะของโปรเจกต์ที่เลือกไว้ (allLegacyPOs — subscribe ไว้ตั้งแต่ main() เช่นกัน)
function legacyPOsList(projectId) {
  return allLegacyPOs.filter((p) => p.projectId === projectId);
}

// dropdown เลือกอ้างอิง รองรับ 2 แหล่ง: งานผู้รับเหมาในระบบ (job:<id>) และ PO เก่าจาก PEAK (legacy:<id>)
// ใช้ prefix แยกแหล่งข้อมูลเพราะ id ของทั้งสอง collection ไม่เกี่ยวข้องกัน อาจซ้ำกันได้โดยบังเอิญ
// ต้องเลือกโปรเจกต์ (projectId) ก่อนเสมอ — ถ้ายังไม่เลือก จะปิดการใช้งาน dropdown นี้ไว้ก่อน
function refreshSourceJobOptions(selectedType, selectedId, projectId) {
  const sel = document.getElementById("c-source-job");
  if (!projectId) {
    sel.innerHTML = `<option value="">— Select a project first / กรุณาเลือกโปรเจกต์ก่อน / 请先选择项目 —</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const jobs = jobsWithPO(projectId);
  const legacy = legacyPOsList(projectId);
  let html = `<option value="">— No reference / ไม่อ้างอิง / 不关联 —</option>`;
  if (jobs.length) {
    html +=
      `<optgroup label="📦 จากงานผู้รับเหมาในระบบ / From contractor job / 来自承包商工作">` +
      jobs
        .map(
          (j) =>
            `<option value="job:${j.id}">🧾 ${escapeHtml(j.poNumber)} · 📦 ${escapeHtml(j.jobId || "")} · ${escapeHtml(j.project || "")} — ${escapeHtml((j.description || "").slice(0, 40))}</option>`
        )
        .join("") +
      `</optgroup>`;
  }
  if (legacy.length) {
    html +=
      `<optgroup label="🗂️ จาก PEAK (คลังใบสั่งซื้อเก่า) / From PEAK import / 来自PEAK导入">` +
      legacy
        .map(
          (p) =>
            `<option value="legacy:${p.id}">🧾 ${escapeHtml(p.poNumber)} · 👷 ${escapeHtml(p.contractorNickname || "")} · ${escapeHtml(p.project || "")} — ฿${formatMoney(p.totalAmount ?? p.netPayable ?? 0)}</option>`
        )
        .join("") +
      `</optgroup>`;
  }
  sel.innerHTML = html;
  const wantValue = selectedType && selectedId ? `${selectedType}:${selectedId}` : "";
  sel.value = Array.from(sel.options).some((o) => o.value === wantValue) ? wantValue : "";
}

// เลือกรายการจาก dropdown แล้วดึงเลขที่ PO / เลขที่ใบส่งมอบงาน / ยอดเงินมาเติมอัตโนมัติ
// (ไม่ต้องเติมโปรเจกต์ให้อีกต่อไป เพราะรายการใน dropdown นี้กรองมาจากโปรเจกต์ที่เลือกไว้แล้วตั้งแต่ต้น)
// และเติม "รายการงาน" ให้ถ้ายังไม่ได้พิมพ์อะไรไว้ (ไม่ทับของที่ผู้ใช้พิมพ์เองแล้ว) — รองรับทั้งงานผู้รับเหมาในระบบและ PO เก่าจาก PEAK
function applySourceJobSelection() {
  const raw = document.getElementById("c-source-job").value;
  if (!raw) {
    document.getElementById("c-po-number").value = "";
    document.getElementById("c-job-no").value = "";
    document.getElementById("c-po-amount").value = "";
    sourceJobPoAmount = null;
    return;
  }
  const sepIdx = raw.indexOf(":");
  const type = raw.slice(0, sepIdx);
  const id = raw.slice(sepIdx + 1);

  if (type === "job") {
    const job = allContractorJobs.find((j) => j.id === id);
    if (!job) return;
    document.getElementById("c-po-number").value = job.poNumber || "";
    document.getElementById("c-job-no").value = job.jobId || "";
    const workItemEl = document.getElementById("c-workItem");
    if (!workItemEl.value.trim() && job.description) {
      workItemEl.value = job.description;
    }
    sourceJobPoAmount = jobFullAmount(job);
  } else if (type === "legacy") {
    const po = allLegacyPOs.find((p) => p.id === id);
    if (!po) return;
    document.getElementById("c-po-number").value = po.poNumber || "";
    document.getElementById("c-job-no").value = ""; // PO เก่าจาก PEAK ไม่มีเลขที่ใบส่งมอบงานในระบบนี้
    const workItemEl = document.getElementById("c-workItem");
    if (!workItemEl.value.trim() && po.contractorNickname) {
      workItemEl.value = `งานผู้รับเหมา: ${po.contractorNickname}`;
    }
    sourceJobPoAmount = po.totalAmount != null ? Number(po.totalAmount) : po.netPayable != null ? Number(po.netPayable) : null;
  }

  document.getElementById("c-po-amount").value = sourceJobPoAmount != null ? sourceJobPoAmount : "";
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
  const notes = document.getElementById("c-notes").value.trim();
  const rawSource = document.getElementById("c-source-job").value;
  const sourceSepIdx = rawSource.indexOf(":");
  const sourceType = sourceSepIdx > -1 ? rawSource.slice(0, sourceSepIdx) : ""; // "job" | "legacy" | ""
  const sourceJobId = sourceSepIdx > -1 ? rawSource.slice(sourceSepIdx + 1) : "";
  const poNumber = document.getElementById("c-po-number").value.trim();
  const sourceJobNo = document.getElementById("c-job-no").value.trim();
  const poAmount = getPoAmountFromField();

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
    sourceType,
    poAmount,
    progressPercent: Number(progressPercent),
    claimAmount: Number(claimAmount),
    claimDate,
    notes,
    images: editingImages,
  };

  // เลขที่เบิก (claimId) แก้ไขเองได้แล้ว (เฉพาะรายการที่มีอยู่แล้ว) — เช็คซ้ำกับรายการอื่นก่อนบันทึกกันสับสน/หาไม่เจอ
  if (id) {
    const claimId = document.getElementById("c-claimId").value.trim();
    if (!claimId) {
      showToast("Please enter a Claim No. / กรุณากรอกเลขที่เบิก / 请输入单号");
      return;
    }
    const dup = allClaims.find((c) => c.id !== id && (c.claimId || "").trim() === claimId);
    if (dup) {
      if (!confirm(`Claim No. "${claimId}" is already used by another record — save anyway? / เลขที่เบิก "${claimId}" ถูกใช้กับรายการอื่นอยู่แล้ว ยืนยันบันทึกทับหรือไม่?`)) {
        return;
      }
    }
    payload.claimId = claimId;
  }

  try {
    if (id) {
      // แก้ไขรายการที่มีอยู่แล้ว = ส่งใหม่ — รีเซ็ตกระบวนการอนุมัติกลับไปขั้นตอนที่ 1 เสมอ (ตามที่ตกลงกันไว้)
      await resubmitClaim(id, payload, currentAdmin?.name);
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
