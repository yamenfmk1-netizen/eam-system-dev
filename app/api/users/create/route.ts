import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createUserSchema } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

// هذا المسار يعمل على الخادم فقط، ويستخدم service_role key الذي لا يصل أبدًا إلى المتصفح.
// يتحقق أولًا أن المستخدم الحالي هو admin قبل تنفيذ أي عملية، ثم يعيد التحقق من صحة
// المدخلات عبر Zod على الخادم (لا يمكن الاعتماد على تحقق الواجهة وحده).

export async function POST(request: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!profile?.is_active || profile.role !== 'admin') {
    return NextResponse.json({ error: 'هذا الإجراء متاح لمدير النظام فقط' }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`user-create:${user.id}:${ip}`, RATE_LIMITS.userCreate.limit, RATE_LIMITS.userCreate.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'عدد كبير جدًا من الطلبات، حاول لاحقًا' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 });
  }
  const { email, password, full_name, role, phone } = parsed.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    return NextResponse.json({ error: 'خطأ في إعدادات الخادم' }, { status: 500 });
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (error) {
    console.error('createUser error:', error.message);
    return NextResponse.json({ error: 'تعذر إنشاء المستخدم — قد يكون البريد مستخدمًا مسبقًا' }, { status: 400 });
  }

  if (phone) {
    await adminClient.from('profiles').update({ phone }).eq('id', data.user.id);
  }

  return NextResponse.json({ success: true, user: { id: data.user.id, email: data.user.email } });
}
