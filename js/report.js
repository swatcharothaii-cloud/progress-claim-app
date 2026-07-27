import { CATEGORIES_SEED, STATUS, MAX_IMAGES, MAX_IMAGE_MB } from "./config.js";
import { showToast, todayStr, saveMyTicket, generateTicketId } from "./utils.js";
import { MapPicker } from "./map-picker.js";
import { compressImageToDataUrl } from "./image-compress.js";
import { T, catTri, msgMaxImages, msgFileTooLarge } from "./i18n.js";

// โหลด firebase-init.js แบบ dynamic import ตอนใช้งานจริงเท่านั้น (ไม่ใช่ตอนโหลดหน้าเว็บ)
// เพื่อไม่ให้ทั้งฟอร์ม (เลือกประเภทงาน/แนบรูป/เลือกตำแหน่ง) ใช้งานไม่ได้ หากเชื่อมต่อ Firebase CDN ไม่สำเร็จชั่วคราว
let firebasePromise = null;
function loadFirebase() {
  if (!firebasePromise) firebasePromise = import("./firebase-init.js");
  return firebasePromise;
}

// ---------- Category chips ----------
// ประเภทงานตอนนี้จัดการได้เองที่หน้าแอดมิน (เพิ่ม/แก้ไข/ปิดใช้งาน) ไม่ได้ตายตัวในโค้ดอีกต่อไป
// แสดงชุดเริ่มต้น (CATEGORIES_SEED) ไปก่อนทันที เพื่อให้ฟอร์มใช้งานได้ทันทีแม้โหลดข้อมูลจริงจาก
// Firestore ช้า/ไม่สำเร็จชั่วคราว แล้วค่อยสลับเป็นรายการล่าสุด (รวมประเภทงานที่แอดมินเพิ่มเอง) เมื่อโหลดเสร็จ
let selectedCategory = null;
const categoryGrid = document.getElementById("category-grid");
renderCategoryChips([...CATEGORIES_SEED].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
loadLiveCategories();

async function loadLiveCategories() {
  try {
    const { loadCategories } = await import("./categories.js");
    const cats = await loadCategories();
    const active = cats.filter((c) => c.active !== false);
    if (active.length) renderCategoryChips(active);
  } catch (e) {
    console.warn("โหลดประเภทงานล่าสุดจากระบบไม่สำเร็จ ใช้ประเภทงานเริ่มต้นแทนไปก่อน", e);
  }
}

function renderCategoryChips(cats) {
  const prevSelectedId = selectedCategory?.id;
  categoryGrid.innerHTML = "";
  cats.forEach((cat) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.id = cat.id;
    chip.innerHTML = `<span class="chip-icon">${cat.icon}</span>${catTri(cat.label)}`;
    if (cat.id === prevSelectedId) {
      chip.classList.add("selected");
      selectedCategory = cat;
    }
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      selectedCategory = cat;
      document.getElementById("categoryOther").style.display = cat.id === "other" ? "block" : "none";
    });
    categoryGrid.appendChild(chip);
  });
}

// ---------- Project select ----------
// โปรเจกต์ต้องสร้างโดยแอดมินก่อน (ไม่มีชุดข้อมูลเริ่มต้นตายตัวเหมือนประเภทงาน) ผู้แจ้งเลือกจากรายการ
// ที่มีอยู่เท่านั้น เพื่อให้แยกขอบเขตรายการแจ้งซ่อมตามโปรเจกต์ได้ถูกต้อง ไม่ปนกันจากการพิมพ์ชื่อเอง
let projectsList = [];
loadLiveProjects();

async function loadLiveProjects() {
  try {
    const { loadProjects } = await import("./projects.js");
    projectsList = (await loadProjects()).filter((p) => p.active !== false);
  } catch (e) {
    console.warn("โหลดรายการโปรเจกต์ไม่สำเร็จ", e);
    projectsList = [];
  }
  renderProjectOptions();
}

function renderProjectOptions() {
  const select = document.getElementById("projectSelect");
  const placeholder = `<option value="">${T.placeholderSelectProject}</option>`;
  select.innerHTML = placeholder + projectsList.map((p) => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join("");
  const emptyHint = document.getElementById("project-empty-hint");
  if (emptyHint) emptyHint.style.display = projectsList.length ? "none" : "block";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ---------- Default dates ----------
document.getElementById("dateReported").value = todayStr();
document.getElementById("dueDate").min = todayStr();

// ---------- LINE LIFF profile: เติมชื่อผู้แจ้งอัตโนมัติถ้าเปิดผ่าน LINE ----------
function applyLiffProfile(profile) {
  if (!profile) return;
  const nameInput = document.getElementById("reporterName");
  if (nameInput && !nameInput.value.trim()) nameInput.value = profile.displayName || "";
}
if (window.liffReady && window.liffProfile) applyLiffProfile(window.liffProfile);
document.addEventListener("liff-profile-ready", (e) => applyLiffProfile(e.detail));

// ---------- Image upload ----------
const MAX_BYTES = MAX_IMAGE_MB * 1024 * 1024;
let selectedImages = []; // File[]
const uploadBox = document.getElementById("upload-box");
const imageInput = document.getElementById("imageInput");
const previewGrid = document.getElementById("img-preview-grid");

uploadBox.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (selectedImages.length >= MAX_IMAGES) {
      showToast(msgMaxImages(MAX_IMAGES));
      break;
    }
    if (f.size > MAX_BYTES) {
      showToast(msgFileTooLarge(f.name, MAX_IMAGE_MB));
      continue;
    }
    selectedImages.push(f);
  }
  imageInput.value = "";
  renderPreviews();
});

function renderPreviews() {
  previewGrid.innerHTML = "";
  selectedImages.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement("div");
    div.className = "img-preview";
    div.innerHTML = `<img src="${url}"><button type="button" class="remove-btn" data-idx="${idx}">✕</button>`;
    previewGrid.appendChild(div);
  });
  previewGrid.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedImages.splice(Number(btn.dataset.idx), 1);
      renderPreviews();
    });
  });
  uploadBox.style.display = selectedImages.length >= MAX_IMAGES ? "none" : "block";
}

// ---------- Map picker ----------
let currentLocation = null;
const mapModal = document.getElementById("map-modal");
let mapPicker = null;

document.getElementById("location-box").addEventListener("click", async () => {
  mapModal.style.display = "flex";
  if (!mapPicker) {
    mapPicker = new MapPicker({
      mapElId: "map-picker",
      searchInputEl: document.getElementById("map-search"),
      onLocationChange: (loc) => {
        currentLocation = loc;
        document.getElementById("map-selected-address").textContent = loc.address;
      },
    });
    await mapPicker.init(currentLocation);
  } else {
    setTimeout(() => mapPicker.resize(), 100);
  }
});

document.getElementById("close-map-modal").addEventListener("click", () => (mapModal.style.display = "none"));
document.getElementById("use-current-loc").addEventListener("click", () => mapPicker && mapPicker.panToCurrentLocation());

document.getElementById("confirm-location").addEventListener("click", () => {
  if (!currentLocation) {
    showToast("กรุณาเลือกตำแหน่งบนแผนที่ก่อน");
    return;
  }
  document.getElementById("loc-title-text").textContent = "ตำแหน่งที่เลือกแล้ว";
  document.getElementById("loc-address").textContent = currentLocation.address;
  document.getElementById("loc-lat").value = currentLocation.lat;
  document.getElementById("loc-lng").value = currentLocation.lng;
  mapModal.style.display = "none";
});

// ---------- Submit ----------
const form = document.getElementById("report-form");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const projectId = document.getElementById("projectSelect").value;
  const selectedProject = projectsList.find((p) => p.id === projectId);
  if (!selectedProject) {
    showToast(T.msgSelectProject);
    return;
  }
  if (!selectedCategory) {
    showToast(T.msgSelectCategory);
    return;
  }
  const dateReported = document.getElementById("dateReported").value;
  const dueDate = document.getElementById("dueDate").value;
  if (dueDate < dateReported) {
    showToast(T.msgDueBeforeReported);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> ${T.msgSubmitting}`;

  try {
    const { db, doc, setDoc, serverTimestamp } = await loadFirebase();
    const ticketId = generateTicketId();

    // บีบอัดรูปภาพฝั่งเบราว์เซอร์แล้วเก็บเป็น base64 ตรงใน Firestore (ไม่ใช้ Firebase Storage)
    if (selectedImages.length > 0) {
      submitBtn.innerHTML = `<span class="spinner"></span> ${T.msgCompressingImages}`;
    }
    const imageUrls = [];
    for (let i = 0; i < selectedImages.length; i++) {
      const dataUrl = await compressImageToDataUrl(selectedImages[i]);
      imageUrls.push({ url: dataUrl });
    }
    submitBtn.innerHTML = `<span class="spinner"></span> ${T.msgSubmitting}`;

    const data = {
      ticketId,
      siteName: document.getElementById("siteName").value.trim(),
      location: currentLocation
        ? { lat: currentLocation.lat, lng: currentLocation.lng, address: currentLocation.address }
        : null,
      reporterName: document.getElementById("reporterName").value.trim(),
      project: selectedProject.label,
      projectId: selectedProject.id,
      category: selectedCategory.label,
      categoryId: selectedCategory.id,
      categoryOther: selectedCategory.id === "other" ? document.getElementById("categoryOther").value.trim() : "",
      description: document.getElementById("description").value.trim(),
      dateReported,
      dueDate,
      images: imageUrls,
      status: STATUS.PENDING,
      forwardDept: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: "",
      // ข้อมูลจากโปรไฟล์ LINE (มีค่าเฉพาะเมื่อเปิดผ่าน LINE Mini App เท่านั้น ไว้ให้แอดมินอ้างอิงเพิ่มเติม)
      lineUserId: window.liffProfile?.userId || "",
      lineDisplayName: window.liffProfile?.displayName || "",
      linePictureUrl: window.liffProfile?.pictureUrl || "",
    };

    await setDoc(doc(db, "repairRequests", ticketId), data);

    saveMyTicket(ticketId);
    document.getElementById("success-ticket-id").textContent = ticketId;
    document.getElementById("success-modal").style.display = "flex";
    showLiffCloseButtonIfNeeded();
    form.reset();
    selectedImages = [];
    renderPreviews();
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
    selectedCategory = null;
    currentLocation = null;
    document.getElementById("loc-title-text").textContent = "แตะเพื่อระบุตำแหน่งบนแผนที่";
    document.getElementById("loc-address").textContent = "";
    document.getElementById("dateReported").value = todayStr();
  } catch (err) {
    console.error(err);
    const msg = /dynamically imported module|fetch/i.test(err.message)
      ? T.msgConnectFailRetry
      : T.errorPrefix + err.message;
    showToast(msg, 4000);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = T.btnSubmit;
  }
});

document.getElementById("close-success-btn").addEventListener("click", () => {
  document.getElementById("success-modal").style.display = "none";
});
document.getElementById("goto-track-btn").addEventListener("click", () => {
  document.getElementById("success-modal").style.display = "none";
  window.switchToTrackTab();
  window.dispatchEvent(new CustomEvent("refresh-tickets"));
});

// ถ้าเปิดอยู่ในแอป LINE ให้มีปุ่ม "ปิดหน้าต่าง" เพิ่ม (ใช้ liff.closeWindow กลับไปที่แชท)
function showLiffCloseButtonIfNeeded() {
  if (!window.liffReady || typeof liff === "undefined" || !liff.isInClient()) return;
  if (document.getElementById("liff-close-btn")) return;
  const sheet = document.querySelector("#success-modal .modal-sheet");
  if (!sheet) return;
  const btn = document.createElement("button");
  btn.id = "liff-close-btn";
  btn.className = "btn btn-outline btn-block";
  btn.style.marginTop = "10px";
  btn.textContent = T.liffCloseWindow;
  btn.addEventListener("click", () => liff.closeWindow());
  sheet.appendChild(btn);
}
