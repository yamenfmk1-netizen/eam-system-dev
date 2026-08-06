import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// ملاحظة إصلاح: تم استثناء "api" من المطابقة صراحة.
// السبب: كانت كل مسارات /api/* تمر عبر updateSession()، التي تُعيد توجيه أي طلب
// بلا جلسة مصادَق عليها إلى /login (صفحة، لا تقبل POST) — وهذا هو السبب الجذري
// لخطأ 405 السابق على /api/auth/log-attempt (يُستدعى حصرًا من مستخدم غير مسجّل دخول).
// كل مسارات API الحالية تتحقق من الجلسة بنفسها داخل الـ route handler
// (عبر supabase.auth.getUser() على الخادم)، فلا حاجة لحماية middleware إضافية هنا،
// واستثناؤها هو الحل القياسي الموصى به في توثيق Next.js لهذه الحالة تحديدًا.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

