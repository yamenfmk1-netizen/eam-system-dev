'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import { Loader2, KeyRound, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { roleLabel } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/database.types';

interface ProfileFormValues {
  full_name: string;
  phone: string;
}

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const { register, handleSubmit, reset } = useForm<ProfileFormValues>();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) {
        reset({ full_name: profile.full_name, phone: profile.phone ?? '' });
        setRole(profile.role);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function onSubmit(values: ProfileFormValues) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('تعذر حفظ التعديلات');
      return;
    }
    toast.success('تم حفظ بيانات الملف الشخصي');
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword('');
    toast.success('تم تغيير كلمة المرور بنجاح');
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-sm text-gray-500">إدارة بيانات حسابك الشخصي</p>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-4.5 w-4.5 text-primary-600" />
          <h2 className="font-bold text-gray-900">البيانات الشخصية</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input value={email} disabled className="input-field bg-gray-50 text-gray-400" dir="ltr" />
          </div>

          <div>
            <label className="label-field">الدور</label>
            <input value={roleLabel(role)} disabled className="input-field bg-gray-50 text-gray-400" />
          </div>

          <div>
            <label className="label-field">الاسم الكامل</label>
            <input {...register('full_name', { required: true })} className="input-field" />
          </div>

          <div>
            <label className="label-field">رقم الجوال</label>
            <input {...register('phone')} className="input-field" dir="ltr" />
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ التعديلات
          </button>
        </form>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4.5 w-4.5 text-primary-600" />
          <h2 className="font-bold text-gray-900">تغيير كلمة المرور</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label-field">كلمة المرور الجديدة</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
              dir="ltr"
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <button onClick={handleChangePassword} disabled={changingPassword} className="btn-primary">
            {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />} تحديث كلمة المرور
          </button>
        </div>
      </div>
    </div>
  );
}
