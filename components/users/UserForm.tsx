'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { USER_ROLE_LABELS } from '@/types/database.types';
import { createUserSchema, type CreateUserInput } from '@/lib/validation/schemas';

export default function UserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'viewer' },
  });

  async function onSubmit(values: CreateUserInput) {
    setLoading(true);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'حدث خطأ');
      toast.success('تم إنشاء حساب المستخدم بنجاح');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">إضافة مستخدم جديد</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-field">الاسم الكامل *</label>
            <input {...register('full_name')} className="input-field" />
            {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
          </div>

          <div>
            <label className="label-field">البريد الإلكتروني *</label>
            <input {...register('email')} type="email" className="input-field" dir="ltr" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="label-field">كلمة المرور المؤقتة *</label>
            <input {...register('password')} type="text" className="input-field" dir="ltr" placeholder="8 أحرف على الأقل" />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>

          <div>
            <label className="label-field">رقم الجوال</label>
            <input {...register('phone')} className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">الدور *</label>
            <select {...register('role')} className="input-field">
              {Object.entries(USER_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} إنشاء الحساب
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
