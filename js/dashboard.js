// dashboard.js — แดชบอร์ดสรุปข้อมูลภาพรวมทั้งระบบ (ทุกโปรเจกต์) แบบเรียลไทม์
// รวมข้อมูลจาก 4 แหล่ง: progressClaims, legacyPurchaseOrders, legacyPoDeliveryNotes, contractorJobs
// เข้าถึงได้จากหน้าแอดมิน (admin.html) เท่านั้น — ใช้ identity เดียวกัน (localStorage) ไม่มีฟอร์มล็อกอินซ้ำ
import { ADMINS, COMPANY, CLAIM_STATUS } from "./config.js";
import { renderCompanyBrandBar, formatMoney, escapeHtml } from "./utils.js";
import { T, claimStatusTri, contractorJobStatusTri } from "./i18n.js";
import { watchAllClaims } from "./claims.js";
import { watchAllContractorJobs } from "./contractor-jobs.js";
import { watchAllLegacyPOs, watchAllDeliveryNotes } from "./legacy-po.js";
import { ensureApproval, APPROVAL_STATUS, APPROVAL_STEP_DEFS } from "./approval.js";

renderCompanyBrandBar("brand-bar", COMPANY);

// ต้องเลือกตัวตน (identity) จากหน้า admin.html มาก่อนเสมอ — ใช้ localStorage เดียวกันทุกหน้าในระบบนี้
const IDENTITY_KEY = "progressClaimAdminIdentity";
function getIdentity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
    if (parsed && ADMINS.some((a) => a.id === parsed.id)) return parsed;
  } catch (e) {}
  return null;
}
if (!getIdentity()) {
  location.href = "admin.html";
}

let allClaims = [];
let allContractorJobs = [];
let allLegacyPOs = [];
let allDeliveryNotes = [];
let loadedFlags = { claims: false, jobs: false, pos: false, notes: false };

function maybeReveal() {
  if (Object.values(loadedFlags).every(Boolean)) {
    document.getElementById("loading-state").style.display = "none";
    document.getElementById("dash-body").style.display = "block";
  }
}

function render() {
  renderKpis();
  renderProjectChart();
  renderMonthlyChart();
  renderApprovalPipelineChart();
  renderPoSummary();
  renderContractorJobSummary();
}

// ============================================================
//  1) การ์ดสรุปยอดรวม
// ============================================================
function renderKpis() {
  const totalClaimed = allClaims.reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const totalApproved = allClaims
    .filter((c) => c.status === CLAIM_STATUS.APPROVED)
    .reduce((s, c) => s + (Number(c.claimAmount) || 0), 0);
  const pendingCount = allClaims.filter((c) => c.status === CLAIM_STATUS.PENDING).length;
  const poTotalValue = allLegacyPOs.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);

  document.getElementById("dash-stat-grid").innerHTML = `
    <div class="stat-card" style="--stat-color:#4f46e5;"><div class="stat-icon">💰</div><div class="stat-body"><div class="num" style="color:#4f46e5;">฿${formatMoney(totalClaimed)}</div><div class="lbl">ยอดเบิกรวมทุกโปรเจกต์ / Total claimed</div></div></div>
    <div class="stat-card" style="--stat-color:#10b981;"><div class="stat-icon">✅</div><div class="stat-body"><div class="num" style="color:#10b981;">฿${formatMoney(totalApproved)}</div><div class="lbl">ยอดอนุมัติรวม / Total approved</div></div></div>
    <div class="stat-card" style="--stat-color:#f59e0b;"><div class="stat-icon">⏳</div><div class="stat-body"><div class="num" style="color:#f59e0b;">${pendingCount}</div><div class="lbl">รายการรอตรวจสอบ / Pending claims</div></div></div>
    <div class="stat-card" style="--stat-color:#0891b2;"><div class="stat-icon">🧾</div><div class="stat-body"><div class="num" style="color:#0891b2;">${allLegacyPOs.length}</div><div class="lbl">PO เก่าทั้งหมด (฿${formatMoney(poTotalValue)}) / Legacy POs</div></div></div>
    <div class="stat-card" style="--stat-color:#7c3aed;"><div class="stat-icon">📦</div><div class="stat-body"><div class="num" style="color:#7c3aed;">${allDeliveryNotes.length}</div><div class="lbl">ใบส่งมอบงาน PO เก่า / Delivery notes</div></div></div>
    <div class="stat-card" style="--stat-color:#d97706;"><div class="stat-icon">🔧</div><div class="stat-body"><div class="num" style="color:#d97706;">${allContractorJobs.length}</div><div class="lbl">งานผู้รับเหมาทั้งหมด / Contractor jobs</div></div></div>
  `;
}

// เก็บ instance ของทุกกราฟไว้ทำลายทิ้งก่อนวาดใหม่ (Chart.js ต้อง destroy ก่อน ไม่งั้นจะซ้อนทับกัน)
const chartInstances = {};
function upsertChart(canvasId, config) {
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, config);
}

const STATUS_COLORS = {
  [CLAIM_STATUS.PENDING]: "#f59e0b",
  [CLAIM_STATUS.APPROVED]: "#10b981",
  [CLAIM_STATUS.REJECTED]: "#ef4444",
};

// ============================================================
//  2) ยอดเบิกงวดงาน แยกตามโปรเจกต์และสถานะ (stacked bar)
// ============================================================
function renderProjectChart() {
  const canvas = document.getElementById("chart-by-project");
  const empty = document.getElementById("chart-by-project-empty");
  if (!allClaims.length) {
    canvas.style.display = "none";
    empty.style.display = "block";
    if (chartInstances["chart-by-project"]) { chartInstances["chart-by-project"].destroy(); delete chartInstances["chart-by-project"]; }
    return;
  }
  canvas.style.display = "block";
  empty.style.display = "none";

  const projectLabels = [...new Set(allClaims.map((c) => c.project || "(ไม่ระบุโปรเจกต์)"))];
  const statuses = [CLAIM_STATUS.PENDING, CLAIM_STATUS.APPROVED, CLAIM_STATUS.REJECTED];
  const datasets = statuses.map((status) => ({
    label: claimStatusTri(status).toString(),
    backgroundColor: STATUS_COLORS[status],
    data: projectLabels.map((proj) =>
      allClaims
        .filter((c) => (c.project || "(ไม่ระบุโปรเจกต์)") === proj && c.status === status)
        .reduce((s, c) => s + (Number(c.claimAmount) || 0), 0)
    ),
  }));

  upsertChart("chart-by-project", {
    type: "bar",
    data: { labels: projectLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: (v) => "฿" + Number(v).toLocaleString("th-TH") } },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ฿${formatMoney(ctx.raw)}` } },
      },
    },
  });
}

// ============================================================
//  3) แนวโน้มยอดเบิกงวดงานรายเดือน (line chart)
// ============================================================
function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "short" });
}

function renderMonthlyChart() {
  const canvas = document.getElementById("chart-monthly");
  const empty = document.getElementById("chart-monthly-empty");
  const withMonth = allClaims.map((c) => ({ ...c, __month: monthKey(c.claimDate) })).filter((c) => c.__month);
  if (!withMonth.length) {
    canvas.style.display = "none";
    empty.style.display = "block";
    if (chartInstances["chart-monthly"]) { chartInstances["chart-monthly"].destroy(); delete chartInstances["chart-monthly"]; }
    return;
  }
  canvas.style.display = "block";
  empty.style.display = "none";

  const months = [...new Set(withMonth.map((c) => c.__month))].sort();
  const totalPerMonth = months.map((m) => withMonth.filter((c) => c.__month === m).reduce((s, c) => s + (Number(c.claimAmount) || 0), 0));
  const approvedPerMonth = months.map((m) =>
    withMonth.filter((c) => c.__month === m && c.status === CLAIM_STATUS.APPROVED).reduce((s, c) => s + (Number(c.claimAmount) || 0), 0)
  );

  upsertChart("chart-monthly", {
    type: "line",
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: "ยอดเบิกทั้งหมด / Total claimed", data: totalPerMonth, borderColor: "#4f46e5", backgroundColor: "#4f46e533", tension: 0.25, fill: true },
        { label: "ยอดอนุมัติแล้ว / Approved", data: approvedPerMonth, borderColor: "#10b981", backgroundColor: "#10b98133", tension: 0.25, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { ticks: { callback: (v) => "฿" + Number(v).toLocaleString("th-TH") } } },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ฿${formatMoney(ctx.raw)}` } },
      },
    },
  });
}

// ============================================================
//  4) สถานะขั้นตอนอนุมัติ รวมทุกประเภทเอกสาร (stacked bar, x = ขั้นตอน, สี = ประเภทเอกสาร)
// ============================================================
function approvalBucket(approval) {
  const a = ensureApproval(approval);
  if (a.status === APPROVAL_STATUS.APPROVED) return "approved";
  if (a.status === APPROVAL_STATUS.REJECTED) return "rejected";
  return `step${a.currentStep}`;
}
const PIPELINE_BUCKETS = ["step1", "step2", "step3", "step4", "approved", "rejected"];
function pipelineBucketLabel(bucket) {
  if (bucket === "approved") return "✅ อนุมัติครบแล้ว";
  if (bucket === "rejected") return "❌ ถูกปฏิเสธ";
  const step = Number(bucket.replace("step", ""));
  const def = APPROVAL_STEP_DEFS.find((d) => d.step === step);
  return `${def?.icon || ""} ขั้นที่ ${step}: ${def?.labelTh || ""}`;
}

function renderApprovalPipelineChart() {
  const canvas = document.getElementById("chart-approval");
  const empty = document.getElementById("chart-approval-empty");
  const docTypes = [
    { key: "claims", label: "ใบเบิกงวดงาน / Progress Claims", color: "#4f46e5", items: allClaims },
    { key: "notes", label: "ใบส่งมอบงาน PO / Delivery Notes", color: "#0891b2", items: allDeliveryNotes },
    { key: "jobs", label: "งานผู้รับเหมา / Contractor Jobs", color: "#d97706", items: allContractorJobs },
  ];
  const totalItems = docTypes.reduce((s, d) => s + d.items.length, 0);
  if (!totalItems) {
    canvas.style.display = "none";
    empty.style.display = "block";
    if (chartInstances["chart-approval"]) { chartInstances["chart-approval"].destroy(); delete chartInstances["chart-approval"]; }
    return;
  }
  canvas.style.display = "block";
  empty.style.display = "none";

  const datasets = docTypes.map((dt) => ({
    label: dt.label,
    backgroundColor: dt.color,
    data: PIPELINE_BUCKETS.map((bucket) => dt.items.filter((item) => approvalBucket(item.approval) === bucket).length),
  }));

  upsertChart("chart-approval", {
    type: "bar",
    data: { labels: PIPELINE_BUCKETS.map(pipelineBucketLabel), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: "bottom" } },
    },
  });
}

// ============================================================
//  5) PO เก่า + ใบส่งมอบงาน — การ์ดสรุป + ตารางแยกตามสถานะ
// ============================================================
function renderPoSummary() {
  const poCount = allLegacyPOs.length;
  const poTotalValue = allLegacyPOs.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
  const noteCount = allDeliveryNotes.length;
  const noteApprovedCount = allDeliveryNotes.filter((n) => ensureApproval(n.approval).status === APPROVAL_STATUS.APPROVED).length;
  const noteInProgressCount = allDeliveryNotes.filter((n) => ensureApproval(n.approval).status === APPROVAL_STATUS.IN_PROGRESS).length;
  const noteRejectedCount = allDeliveryNotes.filter((n) => ensureApproval(n.approval).status === APPROVAL_STATUS.REJECTED).length;

  document.getElementById("po-summary-grid").innerHTML = `
    <div class="stat-card" style="--stat-color:#0891b2;"><div class="stat-icon">🧾</div><div class="stat-body"><div class="num" style="color:#0891b2;">${poCount}</div><div class="lbl">PO เก่าทั้งหมด / Total legacy POs</div></div></div>
    <div class="stat-card" style="--stat-color:#0891b2;"><div class="stat-icon">💰</div><div class="stat-body"><div class="num" style="color:#0891b2;">฿${formatMoney(poTotalValue)}</div><div class="lbl">มูลค่า PO รวม / Total PO value</div></div></div>
    <div class="stat-card" style="--stat-color:#7c3aed;"><div class="stat-icon">📦</div><div class="stat-body"><div class="num" style="color:#7c3aed;">${noteCount}</div><div class="lbl">ใบส่งมอบงานทั้งหมด / Total delivery notes</div></div></div>
    <div class="stat-card" style="--stat-color:#10b981;"><div class="stat-icon">✅</div><div class="stat-body"><div class="num" style="color:#10b981;">${noteApprovedCount}</div><div class="lbl">อนุมัติครบแล้ว / Fully approved</div></div></div>
    <div class="stat-card" style="--stat-color:#f59e0b;"><div class="stat-icon">⏳</div><div class="stat-body"><div class="num" style="color:#f59e0b;">${noteInProgressCount}</div><div class="lbl">กำลังอนุมัติ / In progress</div></div></div>
    <div class="stat-card" style="--stat-color:#ef4444;"><div class="stat-icon">❌</div><div class="stat-body"><div class="num" style="color:#ef4444;">${noteRejectedCount}</div><div class="lbl">ถูกปฏิเสธ / Rejected</div></div></div>
  `;

  const byStatus = {};
  allLegacyPOs.forEach((p) => {
    const key = p.status || "(ไม่ระบุสถานะ)";
    if (!byStatus[key]) byStatus[key] = { count: 0, total: 0 };
    byStatus[key].count++;
    byStatus[key].total += Number(p.totalAmount) || 0;
  });
  const rows = Object.entries(byStatus).sort((a, b) => b[1].total - a[1].total);
  document.getElementById("po-status-tbody").innerHTML = rows.length
    ? rows
        .map(
          ([status, agg]) => `
      <tr>
        <td>${escapeHtml(status)}</td>
        <td style="text-align:right;">${agg.count}</td>
        <td style="text-align:right;">฿${formatMoney(agg.total)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="hint" style="text-align:center; padding:16px;">No data yet / ยังไม่มีข้อมูล / 暂无数据</td></tr>`;
}

// ============================================================
//  6) งานผู้รับเหมา — การ์ดสรุปแยกตามสถานะ
// ============================================================
function renderContractorJobSummary() {
  const grid = document.getElementById("cj-summary-grid");
  if (!allContractorJobs.length) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">No data yet / ยังไม่มีข้อมูล / 暂无数据</div>`;
    return;
  }
  const statusColors = { bg: "#dbeafe", text: "#1e40af" };
  const byStatus = {};
  allContractorJobs.forEach((j) => {
    const key = j.status || "(ไม่ระบุสถานะ)";
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  grid.innerHTML = Object.entries(byStatus)
    .map(
      ([status, count]) => `
    <div class="stat-card" style="--stat-color:#d97706;"><div class="stat-icon">🔧</div><div class="stat-body"><div class="num" style="color:#d97706;">${count}</div><div class="lbl">${escapeHtml(contractorJobStatusTri(status).toString())}</div></div></div>`
    )
    .join("");
}

// ============================================================
//  เริ่มติดตามข้อมูลแบบเรียลไทม์ — ต้องอยู่ล่างสุดของไฟล์ (หลังประกาศฟังก์ชัน/ตัวแปรทั้งหมดด้านบน)
//  เพราะ onSnapshot ของ Firestore (และ mock ที่ใช้ตอนทดสอบ) อาจเรียก callback แรกแบบ synchronous
//  ทันทีที่ subscribe — ถ้า watch* อยู่เหนือ const/function ที่ยังไม่ถูกประกาศ (เช่น STATUS_COLORS,
//  chartInstances) จะชน temporal dead zone ("Cannot access '...' before initialization")
// ============================================================
watchAllClaims((list) => {
  allClaims = list;
  loadedFlags.claims = true;
  maybeReveal();
  render();
});
watchAllContractorJobs((list) => {
  allContractorJobs = list;
  loadedFlags.jobs = true;
  maybeReveal();
  render();
});
watchAllLegacyPOs((list) => {
  allLegacyPOs = list;
  loadedFlags.pos = true;
  maybeReveal();
  render();
});
watchAllDeliveryNotes((list) => {
  allDeliveryNotes = list;
  loadedFlags.notes = true;
  maybeReveal();
  render();
});
