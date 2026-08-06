import { z } from 'zod';

// هذه المخططات تُستخدم في مكانين إلزاميًا حسب متطلبات الأمان:
// 1) في الواجهة (React Hook Form + zodResolver) لمنع إرسال بيانات غير صالحة.
// 2) في مسارات API على الخادم (app/api/**) للتحقق مرة أخرى قبل تنفيذ أي عملية حساسة،
//    لأن أي تحقق في الواجهة فقط يمكن تجاوزه بسهولة عبر استدعاء API مباشرة.

export const userRoleSchema = z.enum(['admin', 'engineer', 'technician', 'viewer']);

export const createUserSchema = z.object({
  full_name: z.string().trim().min(2, 'الاسم قصير جدًا').max(100),
  email: z.string().trim().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').max(72),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  role: userRoleSchema,
});

export const updateUserSchema = z.object({
  role: userRoleSchema.optional(),
  is_active: z.boolean().optional(),
  full_name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
});

export const buildingSchema = z.object({
  building_number: z.string().trim().min(1, 'مطلوب').max(20),
  name: z.string().trim().min(2, 'مطلوب').max(150),
  department: z.string().trim().max(150).optional().or(z.literal('')),
  location: z.string().trim().max(250).optional().or(z.literal('')),
  responsible_person: z.string().trim().max(150).optional().or(z.literal('')),
  contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  contact_email: z.string().trim().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['ready', 'watch', 'fault', 'unknown']),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const equipmentSchema = z.object({
  asset_id: z.string().trim().min(1, 'مطلوب').max(50),
  name: z.string().trim().min(2, 'مطلوب').max(150),
  type: z.string().min(1),
  building_id: z.string().uuid('يجب اختيار مبنى صالح'),
  location_in_building: z.string().trim().max(150).optional().or(z.literal('')),
  manufacturer: z.string().trim().max(150).optional().or(z.literal('')),
  model: z.string().trim().max(100).optional().or(z.literal('')),
  serial_number: z.string().trim().max(100).optional().or(z.literal('')),
  manufacturing_year: z.string().optional().or(z.literal('')),
  installation_date: z.string().optional().or(z.literal('')),
  status: z.enum(['available', 'running', 'standby', 'under_maintenance', 'fault', 'out_of_service']),
  criticality: z.enum(['low', 'medium', 'high', 'critical']),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const sparePartSchema = z.object({
  part_name: z.string().trim().min(2, 'مطلوب').max(150),
  part_number: z.string().trim().max(100).optional().or(z.literal('')),
  manufacturer: z.string().trim().max(150).optional().or(z.literal('')),
  compatible_equipment_type: z.string().optional().or(z.literal('')),
  quantity_available: z.coerce.number().int().min(0, 'لا يمكن أن تكون سالبة'),
  minimum_stock: z.coerce.number().int().min(0, 'لا يمكن أن تكون سالبة'),
  storage_location: z.string().trim().max(150).optional().or(z.literal('')),
  supplier: z.string().trim().max(150).optional().or(z.literal('')),
  price: z.string().optional().or(z.literal('')),
  purchase_date: z.string().optional().or(z.literal('')),
  expiry_date: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type BuildingInput = z.infer<typeof buildingSchema>;
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type SparePartInput = z.infer<typeof sparePartSchema>;
