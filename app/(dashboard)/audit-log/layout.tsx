import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// نفس منطق app/(dashboard)/users/layout.tsx — راجع التعليق هناك.
// سجل التدقيق يحتوي كل عمليات الإضافة/التعديل/الحذف عبر النظام بالكامل،
// وكان متاحًا لأي مستخدم مسجّل دخول قبل هذا الإصلاح.
export default async function AuditLogLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
