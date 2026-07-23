import { T } from "./i18n.js";

// แสดงแถบโลโก้+ชื่อบริษัทที่หัว (ใช้ทั้ง index.html และ admin.html) — เหมือน repair-app
export function renderCompanyBrandBar(containerId, company) {
  const el = document.getElementById(containerId);
  if (!el || !company) return;
  el.innerHTML = `
    <img src="${company.logo}" alt="โลโก้บริษัท" class="brand-logo">
    <div class="brand-text">
      <div class="brand-name-th">${company.nameTh}</div>
      <div class="brand-name-en">${company.nameEn}</div>
    </div>
  `;
}

export function renderCompanyFooter(containerId, company) {
  const el = document.getElementById(containerId);
  if (!el || !company) return;
  const addressRows = company.addresses
    .map(
      (a) => `
      <div class="footer-address-row">
        <span class="footer-address-label">${a.labelTh} / ${a.labelEn}</span>
        <span>${a.th}</span>
        <span class="footer-address-en">${a.en}</span>
      </div>`
    )
    .join("");
  el.innerHTML = `
    <div class="footer-tax">${T.taxIdLabel}: ${company.taxId}</div>
    ${addressRows}
  `;
}

export function showToast(msg, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function formatDateThai(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

// PC-YYYYMMDD-XXXX (รูปแบบเดียวกับ generateTicketId ของ repair-app)
export function generateClaimId() {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PC-${datePart}-${rand}`;
}
