// أدوات رفع ملفات آمنة: تُستخدم في كل مكون يرفع ملفات إلى Supabase Storage.
// الهدف: منع Path Traversal، منع تعارض الأسماء، وفرض قائمة أنواع وحجم مسموح
// (كحماية إضافية على مستوى العميل، بالتوازي مع القيود الفعلية على مستوى Bucket في Supabase).

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword',
];

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class FileValidationError extends Error {}

export function validateFile(
  file: File,
  { allowedTypes, maxSizeBytes }: { allowedTypes: string[]; maxSizeBytes: number }
) {
  if (!allowedTypes.includes(file.type)) {
    throw new FileValidationError(
      `نوع الملف غير مسموح به. الأنواع المسموحة: ${allowedTypes.map((t) => t.split('/').pop()).join(', ')}`
    );
  }
  if (file.size > maxSizeBytes) {
    throw new FileValidationError(`حجم الملف يتجاوز الحد الأقصى المسموح (${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
  }
}

/**
 * يولّد اسم تخزين عشوائيًا وآمنًا (UUID) مع الحفاظ على الامتداد الأصلي فقط،
 * لمنع أي محاولة Path Traversal أو تعارض أسماء أو تسريب اسم الملف الأصلي في الرابط.
 */
export function generateSafeStorageName(originalFileName: string, folderPrefix?: string): string {
  const extMatch = originalFileName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  const random = crypto.randomUUID();
  return folderPrefix ? `${folderPrefix}/${random}.${ext}` : `${random}.${ext}`;
}
