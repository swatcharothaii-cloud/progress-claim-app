// i18n.js — ข้อความ 3 ภาษา (ไทย/อังกฤษ/จีน) แบบเดียวกับ repair-app
function tri(en, th, zh) {
  return { en, th, zh, toString: () => th };
}

export const T = {
  appTitleTrack: tri("Progress Claim Tracker", "ตรวจสอบสถานะเบิกงวดงาน", "工程款申请进度查询"),
  appTitleAdmin: tri("Progress Claim Admin", "ระบบเบิกงวดงาน (แอดมิน)", "工程款申请管理"),
  selectProjectLabel: tri("Select project", "เลือกโปรเจกต์", "选择项目"),
  selectProjectPlaceholder: tri("-- Select a project --", "-- เลือกโปรเจกต์ --", "-- 请选择项目 --"),
  noClaimsYet: tri("No progress claims for this project yet", "ยังไม่มีรายการเบิกงวดงานสำหรับโปรเจกต์นี้", "该项目暂无工程款申请记录"),
  workItemLabel: tri("Work item / BOQ ref", "รายการงาน / อ้างอิง BOQ", "工程项目 / BOQ 参考"),
  progressLabel: tri("Progress", "ความคืบหน้า", "进度"),
  claimAmountLabel: tri("Claim amount", "จำนวนเงินที่เบิก", "申请金额"),
  claimDateLabel: tri("Claim date", "วันที่เบิก", "申请日期"),
  statusLabel: tri("Status", "สถานะ", "状态"),
  notesLabel: tri("Notes", "หมายเหตุ", "备注"),
  photosLabel: tri("Site photos", "รูปภาพหน้างาน", "现场照片"),
  clickToViewPhoto: tri("Click to view full photo", "คลิกเพื่อดูรูปเต็มจอ", "点击查看完整照片"),
  taxIdLabel: tri("Tax ID", "เลขประจำตัวผู้เสียภาษี", "税号"),
  btnAddClaim: tri("+ Add progress claim", "+ เพิ่มรายการเบิกงวดงาน", "+ 新增工程款申请"),
  btnSave: tri("Save", "บันทึก", "保存"),
  btnCancel: tri("Cancel", "ยกเลิก", "取消"),
  btnEdit: tri("Edit", "แก้ไข", "编辑"),
  btnApprove: tri("Approve", "อนุมัติ", "批准"),
  btnReject: tri("Reject", "ปฏิเสธ", "拒绝"),
  btnExportExcel: tri("📊 Export Excel", "📊 ส่งออก Excel", "📊 导出 Excel"),
  btnExportPdf: tri("📄 Export PDF", "📄 ส่งออก PDF", "📄 导出 PDF"),
  totalClaimedLabel: tri("Total claimed", "ยอดเบิกรวม", "申请总额"),
  totalApprovedLabel: tri("Total approved", "ยอดอนุมัติรวม", "已批准总额"),
  totalPendingLabel: tri("Pending review", "รอตรวจสอบ", "待审核"),
  allProjectsLabel: tri("All projects", "ทุกโปรเจกต์", "全部项目"),
  allStatusLabel: tri("All statuses", "ทุกสถานะ", "全部状态"),
  msgSaved: tri("Saved", "บันทึกแล้ว", "已保存"),
  msgSavedFail: tri("Save failed, please try again", "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "保存失败，请重试"),
  msgFillRequired: tri("Please fill in all required fields", "กรุณากรอกข้อมูลที่จำเป็นให้ครบ", "请填写所有必填项"),
  msgConnectFailCheckInternet: tri("Connection failed, please check your internet", "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต", "连接失败，请检查网络"),
  loginPromptName: tri("Please select your name to continue", "กรุณาเลือกชื่อของคุณเพื่อใช้งาน", "请选择您的姓名以继续"),
  logoutBtn: tri("Switch user", "เปลี่ยนผู้ใช้งาน", "切换用户"),
  pdfReportTitle: tri("Progress Claim Report", "รายงานเบิกงวดงาน", "工程款申请报告"),
  pdfGeneratedAtPrefix: tri("Generated at", "สร้างรายงานเมื่อ", "生成时间"),
  pdfPrintHint: tri("Use your browser's print dialog to save as PDF", "ใช้หน้าต่างพิมพ์ของเบราว์เซอร์เพื่อบันทึกเป็น PDF", "请使用浏览器打印对话框另存为 PDF"),

  // ---------- งานที่ส่งให้ผู้รับเหมา (Contractor Jobs) — ข้อมูลจาก repair-app ----------
  noContractorJobsYet: tri("No contractor jobs yet", "ยังไม่มีงานที่ส่งให้ผู้รับเหมา", "暂无承包商工程"),
  btnSetPoNumber: tri("🧾 Set PO No.", "🧾 กรอกเลขที่ PO", "🧾 填写PO号"),
  promptSetPoNumber: tri("Enter PO number", "กรอกเลขที่ PO", "请输入PO号"),
  btnInspectionPass: tri("✅ Pass", "✅ ผ่าน", "✅ 合格"),
  btnInspectionFail: tri("❌ Fail", "❌ ไม่ผ่าน", "❌ 不合格"),
  promptInspectorName: tri("Inspector name", "ชื่อผู้ตรวจงาน", "验收人姓名"),
  promptInspectionFailNote: tri("Reason / what needs fixing", "เหตุผล / สิ่งที่ต้องแก้ไข", "原因／需修正事项"),
  msgInspectorNameRequired: tri("Please enter inspector name", "กรุณากรอกชื่อผู้ตรวจงาน", "请输入验收人姓名"),
  inspectionRoundLabel: tri("Inspection round", "ตรวจงานครั้งที่", "验收次数"),
  msgInspectionFailedResubmit: tri("Failed — awaiting contractor resubmission", "ตรวจไม่ผ่าน รอผู้รับเหมาส่งมอบงานใหม่", "验收不合格，等待承包商重新提交"),
  msgAwaitingDelivery: tri("Awaiting delivery", "ยังไม่ส่งมอบงาน", "尚未交付"),
  btnViewJob: tri("👁️ View", "👁️ ดูรายละเอียด", "👁️ 查看详情"),
  deliveryNoteTitle: tri("Job Delivery Note", "ใบส่งมอบงาน", "工程交付单"),
  btnPrintDeliveryNote: tri("🖨️ Print delivery note", "🖨️ พิมพ์ใบส่งมอบงาน", "🖨️ 打印交付单"),
};

export function claimStatusTri(status) {
  const map = {
    "รอตรวจสอบ": tri("Pending review", "รอตรวจสอบ", "待审核"),
    "อนุมัติแล้ว": tri("Approved", "อนุมัติแล้ว", "已批准"),
    "ปฏิเสธ": tri("Rejected", "ปฏิเสธ", "已拒绝"),
  };
  const t = map[status];
  if (!t) return status || "-";
  return `${t.en} / ${t.th} / ${t.zh}`;
}

// ---------- งานที่ส่งให้ผู้รับเหมา (Contractor Jobs) — ใช้ป้ายชุดเดียวกับ repair-app ----------
const CONTRACTOR_JOB_STATUS_TRI = {
  "รอผู้รับเหมาตอบรับ": tri("Waiting for contractor", "รอผู้รับเหมาตอบรับ", "等待承包商回复"),
  "ผู้รับเหมารับงานแล้ว": tri("Contractor confirmed", "ผู้รับเหมารับงานแล้ว", "承包商已确认"),
  "ผู้รับเหมาปฏิเสธ": tri("Contractor rejected", "ผู้รับเหมาปฏิเสธ", "承包商已拒绝"),
  "เสร็จสิ้น": tri("Completed", "เสร็จสิ้น", "已完成"),
};
export function contractorJobStatusTri(status) {
  const t = CONTRACTOR_JOB_STATUS_TRI[status];
  if (!t) return status || "-";
  return `${t.en} / ${t.th} / ${t.zh}`;
}
export function jobTypeTri(type) {
  const map = {
    quote: tri("New work (quote needed)", "งานใหม่ที่ต้องเสนอราคา", "新工程（需报价）"),
    defect: tri("Defect / failed inspection", "งานแก้ไขที่ตรวจไม่ผ่าน", "检验不合格返修"),
    fix: tri("Fix / repair work", "งานแก้ไข", "维修工程"),
  };
  const t = map[type] || map.fix;
  return `${t.en} / ${t.th} / ${t.zh}`;
}
