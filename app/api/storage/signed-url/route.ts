import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

const ALLOWED_BUCKETS = ['building-images', 'equipment-images', 'documents', 'reports', 'drawings', 'manuals', 'attachments'];

// يمنح رابطًا موقّعًا صالحًا لمدة قصيرة (60 ثانية) بدلاً من رابط عام دائم.
// يتحقق أولًا أن الطالب مسجّل دخول (RLS في Storage تتحقق مرة أخرى من الصلاحية الفعلية).
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`signed-url:${ip}`, RATE_LIMITS.search.limit, RATE_LIMITS.search.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'عدد كبير جدًا من الطلبات، حاول لاحقًا' }, { status: 429 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bucket = body?.bucket as string | undefined;
  const path = body?.path as string | undefined;

  if (!bucket || !path || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  // path traversal guard إضافي (دفاع في العمق، فوق قيود Storage نفسها)
  if (path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 });
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);

  if (error || !data) {
    // لا تُعِد تفاصيل الخطأ الداخلي للعميل
    return NextResponse.json({ error: 'تعذر الوصول إلى الملف' }, { status: 403 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
