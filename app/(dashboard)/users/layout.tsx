import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// حارس صلاحية على مستوى الخادم لكل مسار /users وما تحته.
// كان هذا القسم يعتمد فقط على إخفاء رابط "المستخدمون" في القائمة الجانبية
// (Sidebar.tsx) لغير admin — أي مستخدم مسجّل دخول كان يستطيع فتح /users مباشرة.
// هذا الحارس يتحقق من الدور فعليًا على الخادم قبل عرض أي بيانات، ويُعيد
// التوجيه لغير admin. طبقة إضافية فوق تقييد RLS في patch_2026_review_fixes.sql.
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
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
