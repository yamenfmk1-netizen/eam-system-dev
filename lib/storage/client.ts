export async function getSignedUrl(bucket: string, path: string): Promise<string | null> {
  if (!path) return null;
  try {
    const res = await fetch('/api/storage/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, path }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

export class UploadError extends Error {}

/**
 * يرفع الملف عبر مسار الخادم /api/storage/upload بدلاً من الرفع المباشر من المتصفح،
 * بحيث يتم تطبيق التحقق من الصلاحية والنوع والحجم وRate Limiting فعليًا على الخادم.
 * يُعيد مسار التخزين (storage path) الذي يُحفظ في قاعدة البيانات.
 */
export async function uploadFile(bucket: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('bucket', bucket);
  formData.append('file', file);

  const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new UploadError(data.error ?? 'تعذر رفع الملف');
  }
  return data.path as string;
}
