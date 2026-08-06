import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

const ALLOWED_BUCKETS = ['building-images', 'equipment-images', 'documents', 'reports', 'drawings', 'manuals', 'attachments'];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const DOCUMENT_TYPES = [
  'application/pdf',
  ...IMAGE_TYPES,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const IMAGE_BUCKETS = ['building-images', 'equipment-images'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

function safeStorageName(originalName: string): string {
  const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  return `${crypto.randomUUID()}.${ext}`;
}

// جميع عمليات رفع الملفات في النظام تمر عبر هذا المسار الوحيد على الخادم،
// بحيث تُطبَّق قيود النوع والحجم وRate Limiting فعليًا ولا يمكن تجاوزها من المتصفح.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!profile?.is_active || !['admin', 'engineer', 'technician'].includes(profile.role)) {
    return NextResponse.json({ error: 'لا تملك صلاحية رفع الملفات' }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`upload:${user.id}:${ip}`, RATE_LIMITS.fileUpload.limit, RATE_LIMITS.fileUpload.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'عدد كبير جدًا من عمليات الرفع، حاول لاحقًا' }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  const bucket = formData.get('bucket') as string | null;
  const file = formData.get('file') as File | null;

  if (!bucket || !ALLOWED_BUCKETS.includes(bucket) || !file) {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  const isImageBucket = IMAGE_BUCKETS.includes(bucket);
  const allowedTypes = isImageBucket ? IMAGE_TYPES : DOCUMENT_TYPES;
  const maxSize = isImageBucket ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'نوع الملف غير مسموح به' }, { status: 400 });
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح' }, { status: 400 });
  }

  const storagePath = safeStorageName(file.name);
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    // لا تُعِد رسالة الخطأ الداخلية الكاملة للعميل
    return NextResponse.json({ error: 'تعذر رفع الملف' }, { status: 400 });
  }

  return NextResponse.json({ path: storagePath });
}
