// أنواع TypeScript المطابقة لسكيما قاعدة البيانات (supabase/schema.sql)

export type UserRole = 'admin' | 'engineer' | 'technician' | 'viewer';

export type BuildingStatus = 'ready' | 'watch' | 'fault' | 'unknown';
export type BuildingCriticality = 'normal' | 'critical';

export type EquipmentType =
  | 'generator' | 'ats' | 'ups' | 'transformer' | 'switchgear' | 'rmu'
  | 'main_distribution_board' | 'sub_main_distribution_board'
  | 'synchronizing_panel' | 'battery_bank' | 'pdu' | 'pdm' | 'other';

export type EquipmentStatus =
  | 'available' | 'running' | 'standby' | 'under_maintenance' | 'fault' | 'out_of_service';

export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical';

export type TestResult = 'passed' | 'passed_with_observation' | 'failed' | 'not_completed';

export type FaultPriority = 'low' | 'medium' | 'high' | 'critical';

export type FaultStatus =
  | 'open' | 'assigned' | 'in_progress' | 'waiting_for_spare_parts' | 'resolved' | 'closed';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  building_number: string;
  name: string;
  department: string | null;
  location: string | null;
  station: string;
  latitude: number | null;
  longitude: number | null;
  responsible_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  description: string | null;
  status: BuildingStatus;
  criticality: BuildingCriticality;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // حقول محسوبة تُضاف من الاستعلامات (ليست في الجدول الفعلي)
  equipment_count?: number;
  last_test_date?: string | null;
  last_maintenance_date?: string | null;
}

export interface Equipment {
  id: string;
  asset_id: string;
  name: string;
  type: EquipmentType;
  building_id: string;
  location_in_building: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  manufacturing_year: number | null;
  installation_date: string | null;
  status: EquipmentStatus;
  criticality: CriticalityLevel;
  image_url: string | null;
  manual_file_url: string | null;
  datasheet_file_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Fault {
  id: string;
  fault_number: string;
  building_id: string;
  equipment_id: string | null;
  reported_at: string;
  reported_by: string | null;
  description: string;
  priority: FaultPriority;
  impact: string | null;
  status: FaultStatus;
  responsible_engineer: string | null;
  responsible_technician: string | null;
  root_cause: string | null;
  temporary_action: string | null;
  final_resolution: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ProfileDirectoryEntry {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface TestRecord {
  id: string;
  test_number: string;
  test_type: string;
  building_id: string;
  equipment_id: string | null;
  test_date: string;
  responsible_person: string | null;
  result: TestResult;
  next_test_date: string | null;
  notes: string | null;
}

export interface MaintenanceRecord {
  id: string;
  maintenance_number: string;
  building_id: string;
  equipment_id: string | null;
  maintenance_type: string | null;
  category: 'preventive' | 'corrective';
  maintenance_date: string;
  work_description: string | null;
  technician_name: string | null;
  engineer_name: string | null;
  next_maintenance_date: string | null;
  schedule_id?: string | null;
}

export interface SparePart {
  id: string;
  part_name: string;
  part_number: string | null;
  manufacturer: string | null;
  compatible_equipment_type: EquipmentType | null;
  quantity_available: number;
  minimum_stock: number;
  storage_location: string | null;
  supplier: string | null;
  price: number | null;
  purchase_date?: string | null;
  expiry_date?: string | null;
  // الضمان (أضيفت في patch_2026_08_features.sql)
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  warranty_provider?: string | null;
  notes?: string | null;
}

export type WarrantyStatus = 'none' | 'valid' | 'expiring_soon' | 'expired';

/** يوم التنبيه المبكر قبل انتهاء الضمان — نفس القيمة المستخدمة في v_spare_parts_warranty */
export const WARRANTY_WARNING_DAYS = 30;

export function warrantyStatus(endDate: string | null | undefined): WarrantyStatus {
  if (!endDate) return 'none';
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= WARRANTY_WARNING_DAYS) return 'expiring_soon';
  return 'valid';
}

export function warrantyDaysLeft(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

export type ScheduleFrequency = 'days' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface MaintenanceSchedule {
  id: string;
  title: string;
  building_id: string;
  equipment_id: string | null;
  category: 'preventive' | 'corrective';
  maintenance_type: string | null;
  work_description: string | null;
  technician_name: string | null;
  engineer_name: string | null;
  frequency: ScheduleFrequency;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  last_generated_date: string | null;
  number_prefix: string;
  auto_generate: boolean;
  is_active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

// ترجمات عربية للعرض في الواجهة
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  generator: 'مولد',
  ats: 'ATS',
  ups: 'UPS',
  transformer: 'محول',
  switchgear: 'سويتش قير',
  rmu: 'RMU',
  main_distribution_board: 'لوحة التوزيع الرئيسية',
  sub_main_distribution_board: 'لوحة التوزيع الفرعية',
  synchronizing_panel: 'لوحة المزامنة',
  battery_bank: 'بنك البطاريات',
  pdu: 'PDU',
  pdm: 'PDM',
  other: 'أخرى',
};

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: 'متاح',
  running: 'يعمل',
  standby: 'استعداد',
  under_maintenance: 'تحت الصيانة',
  fault: 'يوجد عطل',
  out_of_service: 'خارج الخدمة',
};

export const BUILDING_CRITICALITY_LABELS: Record<BuildingCriticality, string> = {
  normal: 'عادي',
  critical: 'حرج',
};

export const BUILDING_STATUS_LABELS: Record<BuildingStatus, string> = {
  ready: 'جاهز',
  watch: 'يحتاج متابعة',
  fault: 'يوجد عطل',
  unknown: 'بيانات غير كافية',
};

export const FAULT_STATUS_LABELS: Record<FaultStatus, string> = {
  open: 'مفتوح',
  assigned: 'تم الإسناد',
  in_progress: 'قيد المعالجة',
  waiting_for_spare_parts: 'بانتظار قطع الغيار',
  resolved: 'تم الحل',
  closed: 'مغلق',
};

export const FAULT_PRIORITY_LABELS: Record<FaultPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير النظام',
  engineer: 'مهندس',
  technician: 'فني',
  viewer: 'مشاهدة فقط',
};

export type TestType =
  | 'generator_operational_test' | 'actual_power_interruption_test' | 'ats_transfer_test'
  | 'ups_battery_test' | 'ups_bypass_test' | 'transformer_inspection' | 'switchgear_test'
  | 'rmu_inspection' | 'battery_test' | 'custom_test';

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  generator_operational_test: 'اختبار تشغيل المولد',
  actual_power_interruption_test: 'اختبار انقطاع فعلي للكهرباء',
  ats_transfer_test: 'اختبار نقل ATS',
  ups_battery_test: 'اختبار بطارية UPS',
  ups_bypass_test: 'اختبار Bypass لـ UPS',
  transformer_inspection: 'فحص محول',
  switchgear_test: 'اختبار سويتش قير',
  rmu_inspection: 'فحص RMU',
  battery_test: 'اختبار بطاريات',
  custom_test: 'اختبار مخصص',
};

export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  passed: 'ناجح',
  passed_with_observation: 'ناجح مع ملاحظات',
  failed: 'فاشل',
  not_completed: 'غير مكتمل',
};

export const MAINTENANCE_CATEGORY_LABELS: Record<'preventive' | 'corrective', string> = {
  preventive: 'وقائية',
  corrective: 'علاجية',
};

export type AttachmentCategory =
  | 'single_line_diagram' | 'layout' | 'panel_schedule' | 'as_built_drawing' | 'manual'
  | 'datasheet' | 'test_report' | 'maintenance_report' | 'quotation' | 'purchase_order'
  | 'building_photo' | 'equipment_photo' | 'other';

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  single_line_diagram: 'مخطط خطي أحادي',
  layout: 'مخطط توزيع (Layout)',
  panel_schedule: 'جدول لوحة',
  as_built_drawing: 'مخطط تنفيذي (As-Built)',
  manual: 'دليل تشغيل',
  datasheet: 'نشرة بيانات فنية',
  test_report: 'تقرير اختبار',
  maintenance_report: 'تقرير صيانة',
  quotation: 'عرض سعر',
  purchase_order: 'أمر شراء',
  building_photo: 'صورة مبنى',
  equipment_photo: 'صورة معدة',
  other: 'أخرى',
};

export interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  category: AttachmentCategory;
  building_id: string | null;
  equipment_id: string | null;
  description: string | null;
  created_at: string;
}

export type MaintenanceCategory = 'preventive' | 'corrective';
