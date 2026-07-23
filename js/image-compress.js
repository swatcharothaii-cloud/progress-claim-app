// บีบอัดรูปภาพฝั่งเบราว์เซอร์ก่อนเก็บเป็น base64 ใน Firestore
// (ไม่ใช้ Firebase Storage เพื่อเลี่ยงการต้องอัปเกรดเป็นแผนที่ต้องผูกบัตรเครดิต)
import { IMAGE_MAX_DIMENSION, IMAGE_TARGET_BASE64_BYTES } from "./config.js";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปภาพไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("โหลดรูปภาพไม่สำเร็จ"));
    img.src = src;
  });
}

/**
 * บีบอัดรูปภาพให้มีขนาด (base64) ไม่เกินเป้าหมาย โดยลดขนาดภาพและ/หรือคุณภาพ JPEG ลงเรื่อยๆ
 * @param {File} file
 * @returns {Promise<string>} data URL (image/jpeg;base64,...)
 */
export async function compressImageToDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(originalDataUrl);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.75;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  let attempts = 0;
  while (dataUrl.length > IMAGE_TARGET_BASE64_BYTES * 1.37 && attempts < 8) {
    if (quality > 0.35) {
      quality -= 0.12;
    } else {
      // คุณภาพต่ำสุดแล้ว ให้ลดขนาดภาพลงแทน
      width = Math.max(200, Math.round(width * 0.82));
      height = Math.max(200, Math.round(height * 0.82));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      quality = 0.6;
    }
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    attempts++;
  }

  return dataUrl;
}
