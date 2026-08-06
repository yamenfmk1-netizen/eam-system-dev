import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkRateLimit, peekRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

const EMAIL_LOOSE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: يفحص فقط ما إذا كان هذا البريد/IP قد تجاوز حد محاولات الدخول، دون تسجيل محاولة جديدة.
// يُستدعى من صفحة تسجيل الدخول *قبل* استدعاء Supabase Auth لمنع هجمات القوة الغاشمة مبكرًا.
//
// حماية من الإساءة والطلبات الآلية: نطبّق حدّين معًا —
//   1) حد لكل (بريد + IP) لمنع تجربة كلمات مرور كثيرة لنفس الحساب
//   2) حد أوسع لكل IP بمفرده (loginPerIp) لمنع تعداد/تجربة بريدات مختلفة كثيرة
//      من نفس المصدر خلال وقت قصير (سلوك نموذجي لسكربتات آلية أو بوتات)
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { searchParams } = new URL(request.url);
  const emailRaw = (searchParams.get('email') ?? '').toLowerCase().trim();
  const email = EMAIL_LOOSE_REGEX.test(emailRaw) ? emailRaw : 'invalid';

  const [byEmailIp, byIp] = await Promise.all([
    peekRateLimit(`login:${email}:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs),
    peekRateLimit(`login-ip:${ip}`, RATE_LIMITS.loginPerIp.limit, RATE_LIMITS.loginPerIp.windowMs),
  ]);

  return NextResponse.json({ allowed: byEmailIp.allowed && byIp.allowed });
}

// POST: يسجّل محاولة تسجيل دخول فعلية (ناجحة أو فاشلة) في login_attempts، ويزيد عداد Rate Limiting.
// يستخدم service_role لأن الجدول ليس له سياسة INSERT للعميل (قراءة admin فقط، حماية من التلاعب).
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);
  const emailRaw = (body?.email ?? '').toString().toLowerCase().trim();
  const email = EMAIL_LOOSE_REGEX.test(emailRaw) ? emailRaw : 'invalid';
  const success = Boolean(body?.success);

  const [byEmailIp, byIp] = await Promise.all([
    checkRateLimit(`login:${email}:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs),
    checkRateLimit(`login-ip:${ip}`, RATE_LIMITS.loginPerIp.limit, RATE_LIMITS.loginPerIp.windowMs),
  ]);
  const allowed = byEmailIp.allowed && byIp.allowed;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    return NextResponse.json({ allowed });
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // لا نسجّل محاولات ببريد غير صالح الصيغة أصلًا (تقليل تلوث السجل من سكربتات عشوائية)
  if (email !== 'invalid') {
    await adminClient.from('login_attempts').insert({
      email,
      success,
      ip_address: ip,
      user_agent: request.headers.get('user-agent') ?? null,
    });
  }

  return NextResponse.json({ allowed });
}
