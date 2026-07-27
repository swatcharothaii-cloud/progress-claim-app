// ============================================================
//  ระบบ 3 ภาษา (อังกฤษ / ไทย / จีน) — แสดงพร้อมกันในบรรทัดเดียว
//  หมายเหตุสำคัญ: CATEGORY_TRI / STATUS_TRI / DEPARTMENT_TRI ใช้ "ข้อความภาษาไทยเดิม"
//  เป็น key เพราะค่านั้นคือค่าจริงที่บันทึกลง Firestore และใช้เทียบ/กรองข้อมูลอยู่แล้ว
//  ห้ามเปลี่ยนค่าที่เก็บจริง (ประเภทงานใน Firestore collection "categories" / STATUS/DEPARTMENTS ใน config.js) เป็น 3 ภาษา
//  เพราะจะทำให้ข้อมูลเก่าที่เคยบันทึกไว้ไม่ตรงกับตัวกรอง/ตัวเปรียบเทียบอีกต่อไป
// ============================================================

export function tri(en, th, zh) {
  return `${en} / ${th} / ${zh}`;
}

// ---------- ประเภทงาน (key = ค่า label ของแต่ละประเภทงานใน Firestore collection "categories") ----------
// เพิ่มคำแปล 3 ภาษาที่นี่เมื่อเพิ่มประเภทงานใหม่ที่ต้องการให้แปลครบ 3 ภาษา (ถ้าไม่เพิ่ม จะแสดงเป็น
// ภาษาไทยอย่างเดียวโดยอัตโนมัติ ไม่ error — ดู catTri() ด้านล่าง)
export const CATEGORY_TRI = {
  "งานประปา": tri("Plumbing", "งานประปา", "水管工程"),
  "งานไฟฟ้า": tri("Electrical", "งานไฟฟ้า", "电气工程"),
  "งานบิ้วอิน": tri("Built-in Furniture", "งานบิ้วอิน", "定制家具"),
  "งานแอร์": tri("Air Conditioning", "งานแอร์", "空调维修"),
  "งานสุขภัณฑ์": tri("Sanitary Ware", "งานสุขภัณฑ์", "卫浴设备"),
  "งานสี": tri("Painting", "งานสี", "油漆工程"),
  "งานกระจก": tri("Glass Work", "งานกระจก", "玻璃工程"),
  "งานม่าน": tri("Curtains", "งานม่าน", "窗帘工程"),
  "งานฝ้า": tri("Ceiling Work", "งานฝ้า", "天花板工程"),
  "งานผนัง": tri("Wall Work", "งานผนัง", "墙面工程"),
  "งานวอลเปเปอร์": tri("Wallpaper Work", "งานวอลเปเปอร์", "墙纸工程"),
  "งานทั่วไป": tri("General Work", "งานทั่วไป", "一般维修"),
  "อื่นๆ": tri("Other", "อื่นๆ", "其他"),
};

// ---------- สถานะงาน (key = STATUS.* เดิม) ----------
export const STATUS_TRI = {
  "รอแก้ไข": tri("Pending", "รอแก้ไข", "待处理"),
  "เสร็จแล้ว": tri("Completed", "เสร็จแล้ว", "已完成"),
  "ส่งต่อให้แผนกอื่นทำต่อ": tri("Forwarded to Another Dept.", "ส่งต่อให้แผนกอื่นทำต่อ", "转交其他部门处理"),
};

// ---------- แผนกที่ส่งต่อ (key = DEPARTMENTS[] เดิม) ----------
export const DEPARTMENT_TRI = {
  "ทีมประปา": tri("Plumbing Team", "ทีมประปา", "水管队"),
  "ทีมไฟฟ้า": tri("Electrical Team", "ทีมไฟฟ้า", "电气队"),
  "ทีมบิ้วอิน/ช่างไม้": tri("Built-in/Carpentry Team", "ทีมบิ้วอิน/ช่างไม้", "定制家具/木工队"),
  "ทีมแอร์": tri("Air Conditioning Team", "ทีมแอร์", "空调队"),
  "ทีมสุขภัณฑ์": tri("Sanitary Team", "ทีมสุขภัณฑ์", "卫浴队"),
  "ฝ่ายจัดซื้อ": tri("Procurement Dept.", "ฝ่ายจัดซื้อ", "采购部"),
  "ผู้รับเหมาภายนอก": tri("External Contractor", "ผู้รับเหมาภายนอก", "外部承包商"),
  "อื่นๆ": tri("Other", "อื่นๆ", "其他"),
};

// ---------- สถานะงานผู้รับเหมา (key = CONTRACTOR_JOB_STATUS.* ใน config.js) ----------
export const CONTRACTOR_JOB_STATUS_TRI = {
  "รอผู้รับเหมาตอบรับ": tri("Waiting for contractor", "รอผู้รับเหมาตอบรับ", "等待承包商回复"),
  "ผู้รับเหมารับงานแล้ว": tri("Contractor confirmed", "ผู้รับเหมารับงานแล้ว", "承包商已确认"),
  "ผู้รับเหมาปฏิเสธ": tri("Contractor rejected", "ผู้รับเหมาปฏิเสธ", "承包商已拒绝"),
  "เสร็จสิ้น": tri("Completed", "เสร็จสิ้น", "已完成"),
};

// ถ้าไม่พบใน dictionary (เช่นข้อมูลเก่า/ค่าที่ไม่คาดคิด) จะคืนค่าดั้งเดิมกลับไปแทนที่จะพัง
export function catTri(label) { return CATEGORY_TRI[label] || label; }
export function statusTri(label) { return STATUS_TRI[label] || label; }
export function deptTri(label) { return DEPARTMENT_TRI[label] || label; }
export function contractorJobStatusTri(label) { return CONTRACTOR_JOB_STATUS_TRI[label] || label; }
export function jobTypeTri(type) {
  if (type === "quote") return tri("New work (quote needed)", "งานใหม่ที่ต้องเสนอราคา", "新工程（需报价）");
  if (type === "defect") return tri("Defect / failed inspection", "งานแก้ไขที่ตรวจไม่ผ่าน", "检验不合格返修");
  return tri("Fix / repair work", "งานแก้ไข", "维修工程");
}

// ---------- ข้อความ UI ทั่วไป (static text) ----------
export const T = {
  // -------- ทั่วไป / ผู้แจ้ง (index.html) --------
  appTitleTag: tri("Repair Report Online", "แจ้งซ่อมออนไลน์", "在线报修"),
  appHeading: tri("🛠️ Repair Report", "🛠️ แจ้งซ่อมออนไลน์", "🛠️ 在线报修"),
  appSubtitle: tri("Report issues and track status easily in one place", "แจ้งปัญหา ติดตามสถานะ ได้ง่ายๆ ในที่เดียว", "轻松报修，一站式追踪进度"),
  tabReport: tri("📝 Report", "📝 แจ้งซ่อม", "📝 报修"),
  tabTrack: tri("🔍 Track Status", "🔍 ติดตามสถานะ", "🔍 追踪进度"),
  labelSiteName: tri("Site Name *", "ชื่อสถานที่ *", "地点名称 *"),
  placeholderSiteName: tri("e.g. Room 301, Building A", "เช่น ห้อง 301 อาคาร A", "例如：A栋301室"),
  labelLocation: tri("Location", "ตำแหน่งที่ตั้ง", "位置"),
  locTapToSelect: tri("Tap to select location on map", "แตะเพื่อระบุตำแหน่งบนแผนที่", "点击在地图上选择位置"),
  labelReporterName: tri("Reporter Name *", "ชื่อผู้แจ้ง *", "报修人姓名 *"),
  placeholderFullName: tri("Full Name", "ชื่อ-นามสกุล", "姓名"),
  labelProject: tri("Project *", "โปรเจกต์ *", "项目 *"),
  placeholderSelectProject: tri("-- Select a project --", "-- เลือกโปรเจกต์ --", "-- 请选择项目 --"),
  msgSelectProject: tri("Please select a project", "กรุณาเลือกโปรเจกต์", "请选择项目"),
  msgNoProjectsYet: tri(
    "No projects available yet. Please contact an admin to add one first",
    "ยังไม่มีโปรเจกต์ในระบบ กรุณาติดต่อแอดมินให้เพิ่มโปรเจกต์ก่อน",
    "系统中尚无项目，请先联系管理员添加项目"
  ),
  labelCategory: tri("Category *", "ประเภทงาน *", "维修类别 *"),
  placeholderCategoryOther: tri("Specify other category", "ระบุประเภทงานอื่นๆ", "请注明其他类别"),
  labelDescription: tri("Problem Description *", "รายละเอียดปัญหาที่พบ *", "问题详情 *"),
  placeholderDescription: tri("Describe the issue", "อธิบายอาการ/ปัญหาที่พบ", "请描述遇到的问题"),
  labelDateReported: tri("Date Reported *", "วันที่แจ้ง *", "报修日期 *"),
  labelDueDate: tri("Desired Completion Date *", "วันที่ต้องการให้แล้วเสร็จ *", "期望完成日期 *"),
  labelAttachPhotos: tri("Attach Photos (1–5 images)", "แนบรูปประกอบ (1–5 ภาพ)", "上传照片（1-5张）"),
  uploadTapToSelect: tri("📷 Tap to select photos", "📷 แตะเพื่อเลือกรูปภาพ", "📷 点击选择照片"),
  hintImageSupport: tri("Supports .jpg .png, max 5MB per image", "รองรับไฟล์ .jpg .png ขนาดไม่เกิน 5MB ต่อรูป", "支持 .jpg .png 格式，每张不超过5MB"),
  btnSubmit: tri("Submit Report", "ส่งแจ้งซ่อม", "提交报修"),
  labelSearchTicket: tri("Search by Ticket Number", "ค้นหาด้วยเลขที่แจ้งซ่อม", "按报修单号查询"),
  placeholderTicketNo: tri("Paste ticket number here", "วางเลขที่แจ้งซ่อมที่นี่", "在此粘贴报修单号"),
  btnSearch: tri("Search", "ค้นหา", "查询"),
  hintOwnTickets: tri("Or view your previously submitted reports on this device below", "หรือดูรายการที่คุณเคยแจ้งจากอุปกรณ์นี้ด้านล่าง", "或查看此设备曾提交过的报修记录"),
  adminEntryLink: tri("For Staff: Admin Login →", "สำหรับเจ้าหน้าที่: เข้าสู่ระบบแอดมิน →", "员工入口：管理后台登录 →"),
  mapModalHeader: tri("Select Location", "ระบุตำแหน่ง", "选择位置"),
  placeholderMapSearch: tri("Search location...", "ค้นหาสถานที่...", "搜索地点…"),
  btnMyLocation: tri("📍 My Location", "📍 ตำแหน่งฉัน", "📍 我的位置"),
  btnConfirmLocation: tri("Confirm This Location", "ยืนยันตำแหน่งนี้", "确认此位置"),
  successTitle: tri("Report Submitted Successfully!", "แจ้งซ่อมสำเร็จ!", "报修提交成功！"),
  successTicketLabel: tri("Your ticket number is", "เลขที่แจ้งซ่อมของคุณคือ", "您的报修单号是"),
  successSaveHint: tri("Please save this number to track status", "กรุณาบันทึกเลขที่นี้ไว้เพื่อติดตามสถานะ", "请保存此单号以便查询进度"),
  btnGotoTrack: tri("Go to Track Status", "ไปหน้าติดตามสถานะ", "前往查询进度"),
  btnNewReport: tri("Submit New Report", "แจ้งซ่อมรายการใหม่", "提交新的报修"),
  liffCloseWindow: tri("Close This Window", "ปิดหน้าต่างนี้", "关闭此窗口"),
  liffHello: tri("Hello", "สวัสดี", "你好"),

  // -------- ข้อความแจ้งเตือน / ข้อผิดพลาด (ผู้แจ้ง) --------
  msgSelectCategory: tri("Please select a category", "กรุณาเลือกประเภทงาน", "请选择维修类别"),
  msgDueBeforeReported: tri("Completion date cannot be before the reported date", "วันที่ต้องการให้แล้วเสร็จต้องไม่ก่อนวันที่แจ้ง", "完成日期不能早于报修日期"),
  msgCompressingImages: tri("Compressing images...", "กำลังบีบอัดรูปภาพ...", "正在压缩图片…"),
  msgSubmitting: tri("Submitting...", "กำลังส่งข้อมูล...", "正在提交…"),
  msgConnectFailRetry: tri("Unable to connect. Please check your internet and try again", "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง", "无法连接系统，请检查网络后重试"),
  msgSearchTicketRequired: tri("Please enter a ticket number", "กรุณากรอกเลขที่แจ้งซ่อม", "请输入报修单号"),
  msgConnectFailCheckInternet: tri("Unable to connect. Please check your internet", "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ต", "无法连接系统，请检查网络"),
  errorPrefix: tri("Error: ", "เกิดข้อผิดพลาด: ", "错误："),

  // -------- ติดตามสถานะ (track.js) --------
  projectPrefix: tri("Project", "โปรเจกต์", "项目"),
  ticketNoPrefix: tri("Ticket No.", "เลขที่", "单号"),
  reportedOnPrefix: tri("Reported on", "แจ้งเมื่อ", "报修时间"),
  desiredCompletionPrefix: tri("Desired completion", "ต้องการเสร็จ", "期望完成"),
  overdueSuffix: tri("(Overdue)", "(เกินกำหนด)", "（逾期）"),
  forwardedToPrefix: tri("Forwarded to", "ส่งต่อให้", "已转交至"),
  beforePhotosLabel: tri("📷 Before", "📷 ก่อนซ่อม", "📷 维修前"),
  afterPhotosLabel: tri("✅ After", "✅ หลังซ่อม", "✅ 维修后"),
  emptyOwnTickets: tri("No reports submitted from this device yet", "ยังไม่มีรายการแจ้งซ่อมจากอุปกรณ์นี้", "此设备尚未提交过报修记录"),

  // -------- แอดมิน (admin.html / admin.js) --------
  adminPageTitle: tri("Admin System - Repair Report Online", "ระบบแอดมิน - แจ้งซ่อมออนไลน์", "管理系统 - 在线报修"),
  chooseYourName: tri("👋 Select Your Name", "👋 เลือกชื่อของคุณ", "👋 请选择您的姓名"),
  chooseYourNameHint: tri(
    "Select your name before use. The system will record who edited each entry.",
    "เลือกชื่อก่อนเข้าใช้งาน ระบบจะบันทึกไว้ว่าใครเป็นคนแก้ไขข้อมูลแต่ละรายการ",
    "使用前请先选择您的姓名，系统会记录每笔资料的编辑者"
  ),
  dashboardHeading: tri("🛠️ Admin Dashboard", "🛠️ แดชบอร์ดแอดมิน", "🛠️ 管理后台"),
  btnSwitchUser: tri("Switch User", "เปลี่ยนผู้ใช้งาน", "切换用户"),
  periodDay: tri("Daily", "รายวัน", "每日"),
  periodWeek: tri("Weekly", "รายสัปดาห์", "每周"),
  periodMonth: tri("Monthly", "รายเดือน", "每月"),
  periodAll: tri("All", "ทั้งหมด", "全部"),
  chartTitle: tri("Summary by Category", "สรุปตามประเภทงาน", "按类别统计"),
  filterAllStatus: tri("All Statuses", "สถานะทั้งหมด", "全部状态"),
  filterAllCategory: tri("All Categories", "ประเภทงานทั้งหมด", "全部类别"),
  filterAllProjects: tri("All Projects", "ทุกโปรเจกต์", "全部项目"),
  unassignedProjectLabel: tri("(No project specified)", "(ไม่ระบุโปรเจกต์)", "（未指定项目）"),
  thProject: tri("Project", "โปรเจกต์", "项目"),
  labelProjectModal: tri("Project", "โปรเจกต์", "项目"),
  placeholderFilterSearch: tri("Search site / reporter / ticket no...", "ค้นหาสถานที่ / ผู้แจ้ง / เลขที่...", "搜索地点／报修人／单号…"),
  btnExportExcel: tri("📊 Export Excel", "📊 ส่งออก Excel", "📊 导出 Excel"),
  thTicketNo: tri("Ticket No.", "เลขที่", "单号"),
  thSite: tri("Site", "สถานที่", "地点"),
  thCategory: tri("Category", "ประเภทงาน", "类别"),
  thReporter: tri("Reporter", "ผู้แจ้ง", "报修人"),
  thDateReported: tri("Date Reported", "วันที่แจ้ง", "报修日期"),
  thDueDate: tri("Due Date", "กำหนดเสร็จ", "截止日期"),
  thStatus: tri("Status", "สถานะ", "状态"),
  statTotal: tri("Total Jobs", "งานทั้งหมด", "总工单数"),
  statForwarded: tri("Forwarded", "ส่งต่อแผนกอื่น", "已转交部门"),
  statOverdue: tri("Overdue", "เกินกำหนด", "逾期"),
  emptyTableState: tri("No records found", "ไม่พบรายการ", "未找到记录"),
  detailModalHeader: tri("Repair Details", "รายละเอียดงานซ่อม", "报修详情"),
  labelTicketId: tri("Ticket No.", "เลขที่แจ้งซ่อม", "报修单号"),
  labelSiteNameModal: tri("Site Name", "ชื่อสถานที่", "地点名称"),
  labelLocationModal: tri("Location", "ตำแหน่งที่ตั้ง", "位置"),
  noLocationSpecified: tri("No location specified", "ไม่ได้ระบุตำแหน่ง", "未指定位置"),
  openInGoogleMaps: tri("Open in Google Maps ↗", "เปิดใน Google Maps ↗", "在 Google 地图中打开 ↗"),
  labelReporterNameModal: tri("Reporter Name", "ชื่อผู้แจ้ง", "报修人姓名"),
  labelCategoryModal: tri("Category", "ประเภทงาน", "维修类别"),
  labelDescriptionModal: tri("Problem Description", "รายละเอียดปัญหา", "问题详情"),
  labelDateReportedModal: tri("Date Reported", "วันที่แจ้ง", "报修日期"),
  labelDueDateModal: tri("Desired Completion Date", "วันที่ต้องการเสร็จ", "期望完成日期"),
  labelStatusModal: tri("Status", "สถานะ", "状态"),
  labelForwardDept: tri("Forward to Department", "ส่งต่อให้แผนก", "转交部门"),
  labelBeforeImages: tri("📷 Before-Repair Photos", "📷 รูปภาพก่อนซ่อม (Before)", "📷 维修前照片"),
  labelAfterImages: tri("✅ After-Repair Photos", "✅ รูปภาพหลังซ่อม (After)", "✅ 维修后照片"),
  tapToAddAfterPhoto: tri("📷 Tap to add after-repair photo", "📷 แตะเพื่อเพิ่มรูปหลังซ่อม", "📷 点击添加维修后照片"),
  hintMaxAfterImages: tri("Attach up to 5 photos, used to compare before/after", "แนบได้สูงสุด 5 ภาพ ใช้เปรียบเทียบก่อน-หลังซ่อม", "最多可上传5张，用于对比维修前后"),
  noImagesAttached: tri("No photos attached", "ไม่มีรูปภาพแนบ", "暂无照片"),
  clickToViewPhoto: tri("Click to view full photo", "คลิกเพื่อดูรูปเต็มจอ", "点击查看完整照片"),
  noAfterImagesYet: tri("No after-repair photos yet", "ยังไม่มีรูปหลังซ่อม", "暂无维修后照片"),
  btnSaveChanges: tri("Save Changes", "บันทึกการแก้ไข", "保存修改"),
  btnCancel: tri("Cancel", "ยกเลิก", "取消"),
  msgSaving: tri("Saving...", "กำลังบันทึก...", "保存中…"),
  msgSaveSuccess: tri("Data saved successfully", "บันทึกข้อมูลเรียบร้อยแล้ว", "数据已成功保存"),
  msgGeneratingFile: tri("Generating file...", "กำลังสร้างไฟล์...", "正在生成文件…"),
  msgExcelToolLoadFail: tri("Unable to load Excel export tool. Please check your internet and try again", "ไม่สามารถโหลดเครื่องมือส่งออก Excel ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", "无法加载 Excel 导出工具，请检查网络后重试"),
  msgNoItemsToExport: tri("No records to export for the current filter", "ไม่มีรายการให้ส่งออกในตัวกรองปัจจุบัน", "当前筛选条件下没有可导出的记录"),
  msgExcelExportErrorPrefix: tri("Error generating Excel file: ", "เกิดข้อผิดพลาดระหว่างสร้างไฟล์ Excel: ", "生成 Excel 文件时出错："),
  btnExportPdf: tri("📄 Export PDF", "📄 ส่งออกไลน์งาน PDF", "📄 导出 PDF"),
  pdfReportTitle: tri("Job List / Work Order", "ไลน์งานซ่อม", "维修工单列表"),
  pdfGeneratedAtPrefix: tri("Generated on", "พิมพ์เมื่อ", "生成于"),
  pdfExportScopePrefix: tri("Scope", "ขอบเขต", "范围"),
  pdfNoPhoto: tri("No photo", "ไม่มีรูป", "无照片"),
  pdfPrintHint: tri("A print dialog will open — choose \"Save as PDF\" as the destination/printer to save this as a PDF file", "หน้าต่างสั่งพิมพ์จะเปิดขึ้น — เลือกปลายทาง/เครื่องพิมพ์เป็น \"Save as PDF\" เพื่อบันทึกเป็นไฟล์ PDF", "将打开打印对话框 — 请将目标/打印机选择为“另存为 PDF”以保存为 PDF 文件"),
  msgCompressFailPrefix: tri("Unable to compress image: ", "ไม่สามารถบีบอัดรูปภาพได้: ", "无法压缩图片："),
  lastEditedByPrefix: tri("Last edited by", "แก้ไขล่าสุดโดย", "最后编辑者"),
  connectFailTitle: tri("Unable to connect", "ไม่สามารถเชื่อมต่อระบบได้", "无法连接系统"),
  connectFailHint: tri("Please check your internet connection and refresh this page", "กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต แล้วรีเฟรชหน้านี้อีกครั้ง", "请检查网络连接后刷新此页面"),
  accessedViaLine: tri("Accessed via LINE: ", "เข้าถึงผ่าน LINE: ", "通过LINE访问："),

  // -------- จัดการประเภทงาน (แอดมิน) --------
  categoryManagerTitle: tri("🗂️ Manage Work Categories", "🗂️ จัดการประเภทงาน", "🗂️ 管理维修类别"),
  labelCategoryIcon: tri("Icon", "ไอคอน", "图标"),
  labelCategoryNameNew: tri("Category Name (Thai) *", "ชื่อประเภทงาน (ไทย) *", "类别名称（泰文）*"),
  placeholderCategoryNameNew: tri("e.g. AC Cleaning", "เช่น งานล้างแอร์", "例如：空调清洗"),
  labelCategoryColor: tri("Color", "สี", "颜色"),
  btnAddCategory: tri("+ Add", "+ เพิ่ม", "+ 添加"),
  hintCategoryManager: tri(
    "Note: The category name is saved in Thai as the actual stored value. Disabling a category hides it from the report form but keeps it visible in reports/filters, so old data is unaffected.",
    "หมายเหตุ: ชื่อประเภทงานจะถูกบันทึกเป็นภาษาไทยตามที่กรอกจริง การปิดใช้งานจะซ่อนจากฟอร์มแจ้งซ่อมใหม่ แต่ยังเห็นในรายงาน/ตัวกรองเหมือนเดิม เพื่อไม่กระทบข้อมูลเก่า",
    "注意：类别名称将以泰文实际填写内容保存。停用某类别只会将其从新报修表单中隐藏，仍会显示在报表／筛选中，不影响旧数据"
  ),
  btnCategorySave: tri("Save", "บันทึก", "保存"),
  btnCategoryDisable: tri("Disable", "ปิดใช้งาน", "停用"),
  btnCategoryEnable: tri("Enable", "เปิดใช้งาน", "启用"),
  badgeCategoryDisabled: tri("Disabled", "ปิดใช้งานอยู่", "已停用"),
  msgCategoryNameRequired: tri("Please enter a category name", "กรุณากรอกชื่อประเภทงาน", "请输入类别名称"),
  msgCategoryAdded: tri("Category added successfully", "เพิ่มประเภทงานสำเร็จ", "类别添加成功"),
  msgCategorySaved: tri("Category updated successfully", "บันทึกประเภทงานสำเร็จ", "类别已成功更新"),
  msgCategoryLoadFail: tri("Unable to load categories. Please refresh this page", "โหลดรายการประเภทงานไม่สำเร็จ กรุณารีเฟรชหน้านี้", "无法加载类别列表，请刷新此页面"),

  // -------- จัดการโปรเจกต์ (แอดมิน) --------
  labelProjectNameNew: tri("Project Name (Thai) *", "ชื่อโปรเจกต์ (ไทย) *", "项目名称（泰文）*"),
  btnAddProject: tri("+ Add", "+ เพิ่ม", "+ 添加"),
  btnProjectSave: tri("Save", "บันทึก", "保存"),
  btnProjectDisable: tri("Disable", "ปิดใช้งาน", "停用"),
  btnProjectEnable: tri("Enable", "เปิดใช้งาน", "启用"),
  badgeProjectDisabled: tri("Disabled", "ปิดใช้งานอยู่", "已停用"),
  msgProjectNameRequired: tri("Please enter a project name", "กรุณากรอกชื่อโปรเจกต์", "请输入项目名称"),
  msgProjectAdded: tri("Project added successfully", "เพิ่มโปรเจกต์สำเร็จ", "项目添加成功"),
  msgProjectSaved: tri("Project updated successfully", "บันทึกโปรเจกต์สำเร็จ", "项目已成功更新"),
  msgProjectLoadFail: tri("Unable to load projects. Please refresh this page", "โหลดรายการโปรเจกต์ไม่สำเร็จ กรุณารีเฟรชหน้านี้", "无法加载项目列表，请刷新此页面"),

  // -------- แผนที่ (map-picker.js) --------
  mapNoResults: tri("No location found", "ไม่พบสถานที่", "未找到地点"),
  mapLoadErrorLine1: tri("⚠️ Unable to load map", "⚠️ ไม่สามารถโหลดแผนที่ได้", "⚠️ 无法加载地图"),
  mapLoadErrorLine2: tri("Please check your internet connection", "กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต", "请检查网络连接"),

  // -------- ป้ายกำกับข้อมูลบริษัท (utils.js) --------
  taxIdLabel: tri("Tax ID", "เลขประจำตัวผู้เสียภาษี", "税号"),
  headOfficeLabel: tri("Head Office", "สำนักงานใหญ่", "总部"),

  // -------- ระบบส่งงานให้ผู้รับเหมา (contractor.html / contractor-page.js) --------
  contractorPageTitle: tri("Job details for contractor", "รายละเอียดงานสำหรับผู้รับเหมา", "承包商工程详情"),
  contractorJobNotFound: tri("Job not found or link expired", "ไม่พบข้อมูลงานนี้ หรือลิงก์ไม่ถูกต้อง", "未找到该工程或链接无效"),
  contractorSiteVisitDateLabel: tri("Site visit date", "วันที่เข้าหน้างาน", "现场勘查日期"),
  contractorRepairDaysLabel: tri("Number of days to complete", "จำนวนวันที่ใช้ซ่อม", "维修所需天数"),
  contractorSubmitBtn: tri("Submit", "ส่งข้อมูล", "提交"),
  contractorAcceptBtn: tri("Accept job", "รับงาน", "接受工程"),
  contractorRejectBtn: tri("Reject job", "ปฏิเสธงาน", "拒绝工程"),
  contractorQuoteDaysLabel: tri("Days needed", "จำนวนวันที่ใช้ทำงาน", "所需天数"),
  contractorQuotePriceLabel: tri("Quoted price (THB)", "ราคาที่เสนอ (บาท)", "报价（泰铢）"),
  contractorQuoteNoteLabel: tri("Additional notes", "หมายเหตุเพิ่มเติม", "备注"),
  contractorSubmittedThanks: tri("Submitted — thank you!", "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณครับ/ค่ะ", "已提交，谢谢！"),
  contractorRejectedMsg: tri("You have rejected this job", "คุณได้ปฏิเสธงานนี้แล้ว", "您已拒绝此工程"),
  btnAddContractorJob: tri("+ Send job to contractor", "+ ส่งงานให้ผู้รับเหมา", "+ 发送工程给承包商"),
  contractorJobTypeLabel: tri("Job type", "ประเภทงาน", "工程类型"),
  contractorLabel: tri("Contractor", "ผู้รับเหมา", "承包商"),
  copyLinkBtn: tri("📋 Copy link", "📋 คัดลอกลิงก์", "📋 复制链接"),
  linkCopiedMsg: tri("Link copied — paste it into LINE chat", "คัดลอกลิงก์แล้ว นำไปวางในแชทไลน์ได้เลย", "链接已复制，可粘贴到 LINE 聊天中"),
  manageContractorsTitle: tri("👷 Manage Contractors", "👷 จัดการรายชื่อผู้รับเหมา", "👷 管理承包商名单"),
  contractorNameLabel: tri("Contractor name *", "ชื่อผู้รับเหมา *", "承包商名称 *"),
  contractorLineContactLabel: tri("LINE contact (for reference)", "ช่องทางติดต่อไลน์ (สำหรับอ้างอิง)", "LINE 联系方式（仅供参考）"),
  contractorPhoneLabel: tri("Phone", "เบอร์โทร", "电话"),

  // -------- Defect / รอบตรวจไม่ผ่าน --------
  cjDefectRoundLabel: tri("Failed inspection round no.", "ไม่ผ่านการตรวจครั้งที่", "第几次检验不合格"),
  contractorDefectRoundPrefix: tri("Failed inspection round no.", "ไม่ผ่านการตรวจครั้งที่", "第几次检验不合格"),
  contractorAwaitingResponseMsg: tri("Please accept or reject this job below", "กรุณากดรับหรือปฏิเสธงานด้านล่างนี้", "请在下方接受或拒绝此工程"),
};

// ---------- ข้อความที่มีตัวแปรแทรก (parametrized) ----------
export function msgMaxImages(n) {
  return tri(`You can attach up to ${n} photos`, `แนบรูปได้สูงสุด ${n} ภาพ`, `最多可上传 ${n} 张照片`);
}
export function msgMaxAfterImages(n) {
  return tri(`You can attach up to ${n} after-repair photos`, `แนบรูปหลังซ่อมได้สูงสุด ${n} ภาพ`, `维修后照片最多可上传 ${n} 张`);
}
export function msgFileTooLarge(name, mb) {
  return tri(`File ${name} exceeds ${mb}MB`, `ไฟล์ ${name} มีขนาดเกิน ${mb}MB`, `文件 ${name} 超过 ${mb}MB`);
}
export function msgTicketNotFound(id) {
  return tri(`Ticket ${id} not found`, `ไม่พบข้อมูลเลขที่แจ้งซ่อม ${id}`, `未找到报修单号 ${id}`);
}
export function msgExportSuccess(n) {
  return tri(`Exported ${n} records successfully`, `ส่งออก ${n} รายการเรียบร้อยแล้ว`, `已成功导出 ${n} 条记录`);
}
export function idNumberLabel(id) {
  return tri(`ID ${id}`, `รหัส ${id}`, `编号 ${id}`);
}
