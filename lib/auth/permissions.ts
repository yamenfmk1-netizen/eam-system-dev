import type { UserRole } from '@/types/database.types';

/**
 * قواعد الصلاحيات المركزية للنظام.
 * admin: تحكم كامل | engineer: إضافة/تعديل + حذف محدود | technician: تسجيل نتائج فقط | viewer: عرض فقط
 */
export const permissions = {
  canCreate: (role: UserRole) => ['admin', 'engineer', 'technician'].includes(role),
  canEdit: (role: UserRole) => ['admin', 'engineer', 'technician'].includes(role),
  canDelete: (role: UserRole) => ['admin', 'engineer'].includes(role),
  canDeleteBuilding: (role: UserRole) => role === 'admin',
  canManageUsers: (role: UserRole) => role === 'admin',
  canUpload: (role: UserRole) => ['admin', 'engineer', 'technician'].includes(role),
  canViewReports: () => true, // جميع الأدوار، حتى viewer، يمكنهم الاطلاع على التقارير
};

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin: 'مدير النظام',
    engineer: 'مهندس',
    technician: 'فني',
    viewer: 'مشاهدة فقط',
  };
  return labels[role];
}
