import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { IS_MANAGEMENT_SITE } from '@/lib/site-config';

export default async function AuditLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    .eq('id', user.id)
    .single();

  // مواقع الأقسام العادية:
  // سجل التحديثات يبقى Admin فقط كما كان سابقًا.
  //
  // موقع الإدارة:
  // نسمح للمستخدم المسجل بالدخول للصفحة، بينما RLS في قاعدة البيانات
  // يحدد السجلات التي يستطيع قراءتها حسب user_departments.
  if (!IS_MANAGEMENT_SITE && profile?.role !== 'admin') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
