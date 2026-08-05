// delivery-notes-list.js — รายการใบส่งมอบงานทั้งหมดของ PO เก่าใบหนึ่ง (ส่งได้หลายใบ/หลายงวด)
// เปิดจากลิงก์ 📦 ในหน้า Purchase Order Archive (admin.html)
import { ADMINS, COMPANY } from "./config.js";
import { renderCompanyBrandBar, showToast, formatDateThai, formatMoney, escapeHtml } from "./utils.js";
import { getLegacyPoById, listDeliveryNotesForPo, createDeliveryNoteForPo, deleteDeliveryNote } from "./legacy-po.js";
import { ensureApproval, APPROVAL_STATUS, APPROVAL_STEP_DEFS } from "./approval.js";

renderCompanyBrandBar("brand-bar", COMPANY);

// ต้องเลือกตัวตน (identity) จากหน้า admin.html มาก่อนเสมอ — ใช้ localStorage เดียวกัน
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

const poId = new URLSearchParams(location.search).get("poId");
let po = null;
let notes = [];

function approvalStatusLabel(approval) {
  const a = ensureApproval(approval);
  if (a.status === APPROVAL_STATUS.APPROVED) return `<b style="color:#065f46;">✅ อนุมัติครบแล้ว</b>`;
  if (a.status === APPROVAL_STATUS.REJECTED) return `<b style="color:#991b1b;">❌ ถูกปฏิเสธ (ต้องแก้ไข)</b>`;
  const stepDef = APPROVAL_STEP_DEFS.find((d) => d.step === a.currentStep);
  return `⏳ กำลังอนุมัติ ${a.currentStep}/4 (${escapeHtml(stepDef?.labelTh || "")})`;
}

async function init() {
  if (!currentAdmin) return;
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
  await reloadNotes();
  renderHeader();
  document.getElementById("loading-state").style.display = "none";
  document.getElementById("dnl-body").style.display = "block";
}

async function reloadNotes() {
  try {
    notes = await listDeliveryNotesForPo(poId);
  } catch (e) {
    console.error(e);
    showToast("โหลดรายการไม่สำเร็จ / Failed to load list / 加载列表失败");
    notes = [];
  }
  renderTable();
}

function renderHeader() {
  document.title = `Delivery Notes / รายการใบส่งมอบงาน — ${po.poNumber || ""}`;
  document.getElementById("dnl-subtitle").textContent = `${po.contractorNickname || ""} — ${po.vendorName || ""}`;
  document.getElementById("dnl-po-number").textContent = po.poNumber || "-";
  document.getElementById("dnl-project").textContent = po.project || "-";
  document.getElementById("dnl-total").innerHTML = `<b>฿${po.totalAmount != null ? Number(po.totalAmount).toLocaleString("th-TH") : "-"}</b>`;
}

function renderTable() {
  const tbody = document.getElementById("dnl-tbody");
  const emptyState = document.getElementById("dnl-empty-state");
  const table = document.getElementById("dnl-table");
  if (!notes.length) {
    tbody.innerHTML = "";
    table.style.display = "none";
    emptyState.style.display = "block";
    return;
  }
  table.style.display = "table";
  emptyState.style.display = "none";
  tbody.innerHTML = notes
    .map(
      (n, i) => `
    <tr>
      <td>#${notes.length - i}</td>
      <td>${n.deliveryDate ? formatDateThai(n.deliveryDate) : `<span class="hint">ยังไม่ระบุ</span>`}</td>
      <td>${(n.deliveryPhotos || []).length ? `🖼️ ${(n.deliveryPhotos || []).length} รูป` : `<span class="hint">ยังไม่มีรูป</span>`}</td>
      <td>${approvalStatusLabel(n.approval)}</td>
      <td>${escapeHtml(n.createdBy || "-")}</td>
      <td style="white-space:nowrap;">
        <a class="btn btn-outline btn-sm" href="delivery-note.html?noteId=${n.id}" target="_blank" rel="noopener">👁️ ดู/แก้ไข</a>
        <button class="btn btn-sm dnl-delete-btn" data-id="${n.id}" style="background:#fee2e2; color:#991b1b;">🗑️ ลบใบนี้</button>
      </td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll(".dnl-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!confirm("ลบใบส่งมอบงานนี้ถาวร? กู้คืนไม่ได้ / Delete this delivery note permanently? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await deleteDeliveryNote(id, poId);
        showToast("ลบแล้ว / Deleted / 已删除");
        await reloadNotes();
      } catch (e) {
        console.error(e);
        showToast("ลบไม่สำเร็จ / Delete failed / 删除失败");
        btn.disabled = false;
      }
    });
  });
}

document.getElementById("dnl-create-btn").addEventListener("click", async () => {
  const btn = document.getElementById("dnl-create-btn");
  btn.disabled = true;
  try {
    const newId = await createDeliveryNoteForPo(po, currentAdmin?.name);
    location.href = `delivery-note.html?noteId=${newId}`;
  } catch (e) {
    console.error(e);
    showToast("สร้างใบใหม่ไม่สำเร็จ / Failed to create / 创建失败");
    btn.disabled = false;
  }
});

init();
