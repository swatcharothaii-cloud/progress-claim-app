// po-scan.js — สแกน PO จากรูปภาพ/PDF ด้วย OCR ฟรีในเบราว์เซอร์ (Tesseract.js) แล้วเดาฟิลด์ต่างๆ ให้อัตโนมัติ
// ทำงานทั้งหมดฝั่งเบราว์เซอร์ ไม่มี backend/server และไม่ใช้ AI API ใดๆ จึงไม่มีค่าใช้จ่ายเพิ่ม แต่แลกมาด้วย
// ความแม่นยำที่น้อยกว่า OCR ภาษาไทยจากรูปถ่าย/สแกน (โดยเฉพาะลายมือหรือภาพเอียง/เบลอ) มีโอกาสอ่านผิดได้
// พอสมควร — แอดมินต้องตรวจสอบ/แก้ไขฟิลด์ที่เดาไว้ในฟอร์ม "Add PO Manually" ก่อนกดบันทึกเสมอ (ดู admin.js)
//
// โหลดไลบรารีจาก CDN แบบ ESM ผ่าน jsDelivr (+esm) เพื่อไม่ต้องมีขั้นตอน build — สอดคล้องกับแนวทางเดิมของ
// โปรเจกต์นี้ที่ import Firebase SDK ตรงจาก CDN เช่นกัน (ดู firebase-init.js)

let tesseractPromise = null;
function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
  }
  return tesseractPromise;
}

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4/+esm").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ / Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// แปลงหน้าแรกของ PDF ให้เป็นรูปภาพ (data URL) เพื่อป้อนให้ Tesseract อ่าน (Tesseract อ่านได้แค่รูปภาพ ไม่ใช่ PDF โดยตรง)
async function pdfFirstPageToDataUrl(file) {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.2 }); // สเกลสูงหน่อยเพื่อให้ OCR อ่านตัวอักษรได้ชัดขึ้น
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/png");
}

// อ่านข้อความทั้งหมดจากรูป/PDF ด้วย OCR (ภาษาไทย+อังกฤษ)
// onProgress(percent|null, statusText) เรียกเป็นระยะระหว่างโหลด/สแกน ให้ UI แสดงสถานะได้
// คืนค่า { rawText, imageDataUrl } — imageDataUrl คือรูปที่ใช้ OCR จริง (หน้าแรกถ้าเป็น PDF) ใช้โชว์พรีวิวได้ด้วย
export async function ocrPoDocument(file, onProgress) {
  const isPdf = file.type === "application/pdf";
  if (onProgress) onProgress(null, isPdf ? "Rendering PDF page 1 / กำลังแปลงหน้า PDF" : "Loading image / กำลังโหลดรูป");
  const imageDataUrl = isPdf ? await pdfFirstPageToDataUrl(file) : await readFileAsDataUrl(file);

  const TesseractMod = await loadTesseract();
  const Tesseract = TesseractMod.default || TesseractMod;
  const result = await Tesseract.recognize(imageDataUrl, "tha+eng", {
    logger: (m) => {
      if (onProgress && m && m.status) {
        onProgress(m.progress != null ? Math.round(m.progress * 100) : null, m.status);
      }
    },
  });
  return { rawText: (result && result.data && result.data.text) || "", imageDataUrl, isPdf };
}

// ---------------- เดาฟิลด์ต่างๆ จากข้อความดิบที่ OCR อ่านได้ (best-effort เท่านั้น) ----------------
function toIsoDateGuess(dayRaw, monthRaw, yearRaw) {
  let year = parseInt(yearRaw, 10);
  if (!Number.isFinite(year)) return "";
  if (String(yearRaw).length <= 2) {
    // ปี พ.ศ. 2 หลัก เช่น "69" (หมายถึง 2569) → แปลงเป็น ค.ศ. (2569 - 543 = 2026)
    year = 2500 + year - 543;
  } else if (year > 2400) {
    // ปี พ.ศ. 4 หลัก → แปลงเป็น ค.ศ.
    year -= 543;
  }
  const month = parseInt(monthRaw, 10);
  const day = parseInt(dayRaw, 10);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(str) {
  const cleaned = (str || "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function amountAfterKeyword(lines, keywords) {
  for (const line of lines) {
    if (keywords.some((k) => line.includes(k))) {
      const matches = line.match(/[\d][\d,]*\.?\d*/g);
      if (matches && matches.length) {
        const amt = parseAmount(matches[matches.length - 1]);
        if (amt != null) return amt;
      }
    }
  }
  return null;
}

// guesses ที่คืนมา: poNumber, issueDate, vendorName, contractorNickname, totalAmount, vatAmount,
// whtAmount, netPayable, notes, project (เฉพาะฟิลด์ที่เดาได้ — ฟิลด์ที่เดาไม่ได้จะไม่มี key นั้นเลย)
// knownProjectLabels: รายชื่อโปรเจกต์ที่มีอยู่แล้วในระบบ (ใช้เทียบว่าข้อความมีชื่อโปรเจกต์ไหนอยู่บ้าง)
export function guessPoFieldsFromText(rawText, knownProjectLabels) {
  const text = rawText || "";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const guesses = {};

  // เลขที่ PO — รูปแบบที่พบบ่อยจาก PEAK เช่น "PO.L7-2607066"
  const poMatch = text.match(/PO[.\-\s]?[A-Z0-9][A-Z0-9\-.\/]{3,}/i);
  if (poMatch) guesses.poNumber = poMatch[0].replace(/\s+/g, "");

  // วันที่ — dd/mm/yy, dd/mm/yyyy, dd-mm-yy ฯลฯ
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dateMatch) {
    const iso = toIsoDateGuess(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (iso) guesses.issueDate = iso;
  }

  // ชื่อผู้ขาย/ผู้รับเหมา — บรรทัดที่ขึ้นต้นด้วยคำนำหน้าชื่อไทย
  const vendorMatch = text.match(/(นาย|นาง|นางสาว|น\.ส\.)\s?[ก-๙a-zA-Z\s]{2,40}/);
  if (vendorMatch) guesses.vendorName = vendorMatch[0].trim();

  // ชื่อเล่นช่าง — คำที่ขึ้นต้นด้วย "ช่าง"
  const nicknameMatch = text.match(/ช่าง[ก-๙a-zA-Z]{1,20}/);
  if (nicknameMatch) guesses.contractorNickname = nicknameMatch[0].trim();

  // ยอดเงินต่างๆ — หาเลขบนบรรทัดที่มีคำสำคัญที่เกี่ยวข้อง
  const total = amountAfterKeyword(lines, ["รวมเงิน", "มูลค่ารวม", "Total", "รวม"]);
  if (total != null) guesses.totalAmount = total;
  const vat = amountAfterKeyword(lines, ["ภาษีมูลค่าเพิ่ม", "VAT", "ภาษี"]);
  if (vat != null) guesses.vatAmount = vat;
  const wht = amountAfterKeyword(lines, ["หัก ณ ที่จ่าย", "WHT", "หักภาษี"]);
  if (wht != null) guesses.whtAmount = wht;
  const net = amountAfterKeyword(lines, ["สุทธิ", "Net", "ยอดชำระ", "ยอดจ่ายสุทธิ"]);
  if (net != null) guesses.netPayable = net;

  // หมายเหตุ/ข้อมูลบัญชีธนาคาร — รวมทุกบรรทัดที่พูดถึงธนาคาร/บัญชี
  const bankLines = lines.filter((l) => /ธนาคาร|บัญชี|Bank|SCB|Account/i.test(l));
  if (bankLines.length) guesses.notes = bankLines.join("\n");

  // โปรเจกต์ — เทียบว่าข้อความมีชื่อโปรเจกต์ที่มีอยู่แล้วในระบบไหม (ต้องตรงตัวเป๊ะ)
  if (Array.isArray(knownProjectLabels)) {
    const found = knownProjectLabels.find((label) => label && text.includes(label));
    if (found) guesses.project = found;
  }

  return guesses;
}
