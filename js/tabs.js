import { LIFF_ID, COMPANY } from "./config.js";
import { renderCompanyBrandBar, renderCompanyFooter } from "./utils.js";
import { T } from "./i18n.js";

renderCompanyBrandBar("brand-bar", COMPANY);
renderCompanyFooter("app-footer", COMPANY);

// สลับแท็บ
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-report").style.display = tab === "report" ? "block" : "none";
    document.getElementById("tab-track").style.display = tab === "track" ? "block" : "none";
  });
});

window.switchToTrackTab = function () {
  document.querySelector('[data-tab="track"]').click();
};

// ============================================================
//  LINE LIFF — ถ้าไม่ได้ตั้งค่า LIFF_ID ไว้ใน config.js จะข้ามส่วนนี้ทั้งหมด
//  และแอปทำงานเป็นเว็บแอปปกติทันที (เปิดผ่านเบราว์เซอร์ได้ตามปกติ)
// ============================================================
window.liffReady = false;
window.liffProfile = null;

(async function initLiff() {
  if (!LIFF_ID) return;
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      // ยังไม่ได้ล็อกอิน LINE → ให้ล็อกอินก่อน แล้วจะ redirect กลับมาหน้านี้อัตโนมัติ
      liff.login({ redirectUri: window.location.href });
      return;
    }

    const profile = await liff.getProfile();
    window.liffProfile = profile; // { userId, displayName, pictureUrl, statusMessage }
    window.liffReady = true;
    renderLiffBar(profile);
    document.dispatchEvent(new CustomEvent("liff-profile-ready", { detail: profile }));
  } catch (e) {
    // เชื่อมต่อ LIFF ไม่สำเร็จ (เช่น เปิดนอกแอป LINE โดยไม่ผ่านลิงก์ที่ถูกต้อง) — ให้ทำงานเป็นเว็บแอปปกติต่อไป ไม่บล็อกผู้ใช้
    console.warn("LIFF init failed, running as normal web app:", e);
  }
})();

function renderLiffBar(profile) {
  if (!profile) return;
  const header = document.querySelector(".app-header");
  if (!header) return;
  const bar = document.createElement("div");
  bar.className = "liff-user-bar";
  bar.innerHTML = `
    ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="">` : `<span class="liff-avatar-fallback">🙂</span>`}
    <span>${T.liffHello}, ${escapeHtmlLocal(profile.displayName || "")}</span>
  `;
  header.appendChild(bar);
}

function escapeHtmlLocal(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
