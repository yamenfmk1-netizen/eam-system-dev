import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { updateUserSchema } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

async function requireAdmin() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) };

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!profile?.is_active || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'هذا الإجراء متاح لمدير النظام فقط' }, { status: 403 }) };
  }
  return { supabase, user };
}

// يتحقق: هل الحساب المستهدف هو آخر admin نشط في النظام؟ يُستخدم لمنع تعطيل/تخفيض/حذف
// آخر مدير — رسالة واضحة هنا، وقاعدة البيانات (trigger) تمنعها فعليًا كخط دفاع أخير
// حتى لو استُدعي Supabase مباشرة متجاوزًا هذا المسار بالكامل.
async function isLastActiveAdmin(supabase: ReturnType<typeof createServerClient>, targetId: string) {
  const { data: target } = await supabase.from('profiles').select('role, is_active').eq('id', targetId).single();
  if (!target || target.role !== 'admin' || !target.is_active) return false;

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', targetId);

  return (count ?? 0) === 0;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;
  const { supabase, user } = check;

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`user-update:${user.id}:${ip}`, RATE_LIMITS.recordCreate.limit, RATE_LIMITS.recordCreate.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'عدد كبير جدًا من الطلبات، حاول لاحقًا' }, { status: 429 });
  }

  // حماية إضافية: لا يمكن لمدير النظام تخفيض دوره الخاص أو إيقاف حسابه الخاص عبر هذا المسار،
  // لمنع القفل العرضي لآخر حساب admin (طبقة تحقق ثانية فوق trigger قاعدة البيانات).
  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 });
  }

  if (params.id === user.id) {
    if (parsed.data.role && parsed.data.role !== 'admin') {
      return NextResponse.json({ error: 'لا يمكنك تغيير دورك الخاص' }, { status: 400 });
    }
    if (parsed.data.is_active === false) {
      return NextResponse.json({ error: 'لا يمكنك إيقاف حسابك الخاص' }, { status: 400 });
    }
  }

  // حماية "آخر admin نشط" — تطبَّق حتى عند تعديل admin آخر (وليس النفس فقط)
  const demotesRole = parsed.data.role !== undefined && parsed.data.role !== 'admin';
  const deactivates = parsed.data.is_active === false;
  if ((demotesRole || deactivates) && (await isLastActiveAdmin(supabase, params.id))) {
    return NextResponse.json({ error: 'لا يمكن تعطيل أو تخفيض آخر مدير نشط في النظام' }, { status: 400 });
  }

  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', params.id);

  if (error) {
    console.error('user update error:', error.message);
    return NextResponse.json({ error: 'تعذر تحديث المستخدم' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;
  const { supabase, user } = check;

  if (params.id === user.id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`user-delete:${user.id}:${ip}`, RATE_LIMITS.recordCreate.limit, RATE_LIMITS.recordCreate.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'عدد كبير جدًا من الطلبات، حاول لاحقًا' }, { status: 429 });
  }

  if (await isLastActiveAdmin(supabase, params.id)) {
    return NextResponse.json({ error: 'لا يمكن حذف آخر مدير نشط في النظام' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    return NextResponse.json({ error: 'خطأ في إعدادات الخادم' }, { status: 500 });
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient.auth.admin.deleteUser(params.id);
  if (error) {
    console.error('deleteUser error:', error.message);
    return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
