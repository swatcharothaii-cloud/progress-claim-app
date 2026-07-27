import { STATUS_STYLE, STATUS } from "./config.js";
import { getMyTickets, formatDateThai, isOverdue, showToast } from "./utils.js";
import { T, statusTri, deptTri, catTri, msgTicketNotFound } from "./i18n.js";

const ticketListEl = document.getElementById("ticket-list");
const unsubscribers = new Map();

// โหลด firebase-init.js แบบ dynamic import เมื่อจำเป็นต้องใช้จริงเท่านั้น
let firebasePromise = null;
function loadFirebase() {
  if (!firebasePromise) firebasePromise = import("./firebase-init.js");
  return firebasePromise;
}

function renderTicketCard(id, data) {
  let card = document.getElementById(`ticket-${id}`);
  if (!card) {
    card = document.createElement("div");
    card.id = `ticket-${id}`;
    card.className = "ticket-card";
    ticketListEl.appendChild(card);
  }

  if (!data) {
    card.innerHTML = `<div class="meta">${msgTicketNotFound(id)}</div>`;
    return;
  }

  const style = STATUS_STYLE[data.status] || STATUS_STYLE[STATUS.PENDING];
  const overdue = isOverdue(data.dueDate, data.status, STATUS.DONE);
  const beforeImgsHtml = (data.images || [])
    .map((img) => `<img src="${img.url}">`)
    .join("");
  const afterImgsHtml = (data.afterImages || [])
    .map((img) => `<img src="${img.url}">`)
    .join("");

  card.style.borderLeftColor = style.dot;
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="site">${escapeHtml(data.siteName || "-")}</div>
        <div class="meta">${T.ticketNoPrefix}: ${data.ticketId} · ${escapeHtml(catTri(data.category) || "")}</div>
        ${data.project ? `<div class="meta">${T.projectPrefix}: ${escapeHtml(data.project)}</div>` : ""}
      </div>
      <span class="badge" style="background:${style.bg}; color:${style.text};">
        <span class="dot" style="background:${style.dot};"></span>${statusTri(data.status)}
      </span>
    </div>
    <div class="desc">${escapeHtml(data.description || "")}</div>
    <div class="meta" style="margin-top:8px;">
      ${T.reportedOnPrefix} ${formatDateThai(data.dateReported)} · ${T.desiredCompletionPrefix}
      <span class="${overdue ? "overdue" : ""}">${formatDateThai(data.dueDate)}${overdue ? " " + T.overdueSuffix : ""}</span>
    </div>
    ${data.status === STATUS.FORWARDED && data.forwardDept ? `<div class="meta">${T.forwardedToPrefix}: ${escapeHtml(deptTri(data.forwardDept))}</div>` : ""}
    ${beforeImgsHtml ? `<div class="meta" style="margin-top:8px;">${T.beforePhotosLabel}</div><div class="ticket-thumbs">${beforeImgsHtml}</div>` : ""}
    ${afterImgsHtml ? `<div class="meta" style="margin-top:8px;">${T.afterPhotosLabel}</div><div class="ticket-thumbs">${afterImgsHtml}</div>` : ""}
  `;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

async function watchTicket(id) {
  if (unsubscribers.has(id)) return;
  unsubscribers.set(id, true); // reserve immediately to avoid duplicate concurrent calls
  try {
    const { db, doc, onSnapshot } = await loadFirebase();
    const unsub = onSnapshot(
      doc(db, "repairRequests", id),
      (snap) => renderTicketCard(id, snap.exists() ? snap.data() : null),
      (err) => console.error(err)
    );
    unsubscribers.set(id, unsub);
  } catch (e) {
    console.error(e);
    showToast(T.msgConnectFailCheckInternet);
    unsubscribers.delete(id);
  }
}

function loadMyTickets() {
  const ids = getMyTickets();
  if (ids.length === 0) {
    ticketListEl.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>${T.emptyOwnTickets}</div>`;
    return;
  }
  ticketListEl.innerHTML = "";
  ids.forEach(watchTicket);
}

document.getElementById("search-btn").addEventListener("click", () => {
  const id = document.getElementById("search-ticket").value.trim().toUpperCase();
  if (!id) {
    showToast(T.msgSearchTicketRequired);
    return;
  }
  ticketListEl.innerHTML = "";
  watchTicket(id);
});

window.addEventListener("refresh-tickets", loadMyTickets);

document.querySelector('[data-tab="track"]').addEventListener("click", loadMyTickets);

// initial load if track tab happens to be active
if (document.getElementById("tab-track").style.display !== "none") loadMyTickets();
