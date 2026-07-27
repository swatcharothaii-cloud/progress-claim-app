import { T } from "./i18n.js";

// แสดงแถบโลโก้+ชื่อบริษัทที่หัวหน้า (ใช้ทั้ง index.html และ admin.html)
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

// แสดงข้อมูลที่อยู่/เลขผู้เสียภาษีที่ท้ายหน้า (ใช้กับ index.html)
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

export function isOverdue(dueDate, status, doneStatusLabel) {
  if (!dueDate || status === doneStatusLabel) return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// เก็บ ticket id ที่ผู้ใช้เคยแจ้งไว้ใน localStorage ของอุปกรณ์นี้
const MY_TICKETS_KEY = "myRepairTickets";

export function saveMyTicket(id) {
  const list = getMyTickets();
  if (!list.includes(id)) {
    list.unshift(id);
    localStorage.setItem(MY_TICKETS_KEY, JSON.stringify(list.slice(0, 50)));
  }
}

export function getMyTickets() {
  try {
    return JSON.parse(localStorage.getItem(MY_TICKETS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function generateTicketId() {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RP-${datePart}-${rand}`;
}
