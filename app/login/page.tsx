'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Zap, Loader2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  async function checkAllowed(): Promise<boolean> {
    try {
      const res = await fetch(`/api/auth/log-attempt?email=${encodeURIComponent(email)}`);
      const data = await res.json().catch(() => ({ allowed: true }));
      return data.allowed !== false;
    } catch {
      return true;
    }
  }

  async function logAttempt(success: boolean) {
    try {
      await fetch('/api/auth/log-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, success }),
      });
    } catch {
      // تجاهل فشل التسجيل نفسه حتى لا يعطّل تجربة تسجيل الدخول
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRateLimited(false);
    setLoading(true);

    // نتحقق من حد المحاولات *قبل* استدعاء Supabase Auth، لمنع هجمات القوة الغاشمة
    const allowed = await checkAllowed();
    if (!allowed) {
      setRateLimited(true);
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    await logAttempt(!authError);

    if (authError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      setLoading(false);
      return;
    }

    toast.success('تم تسجيل الدخول بنجاح');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-950 to-primary-800 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Zap className="h-7 w-7" />
          </div>
          <h1 className="text-center text-xl font-bold">نظام إدارة الأصول الكهربائية والصيانة</h1>
          <p className="text-sm text-white/70">تسجيل الدخول للمتابعة</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-7 shadow-xl">
          {rateLimited && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>عدد كبير جدًا من محاولات تسجيل الدخول الفاشلة. الرجاء الانتظار بضع دقائق قبل المحاولة مرة أخرى.</span>
            </div>
          )}

          {error && !rateLimited && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="mb-4">
            <label className="label-field">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="name@company.com"
              dir="ltr"
              autoComplete="username"
            />
          </div>

          <div className="mb-6">
            <label className="label-field">كلمة المرور</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              dir="ltr"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading || rateLimited} className="btn-primary w-full py-2.5">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            تسجيل الدخول
          </button>

          <p className="mt-5 text-center text-xs text-gray-400">
            للحصول على حساب، تواصل مع مدير النظام — التسجيل العام غير متاح في هذا النظام
          </p>
        </form>
      </div>
    </div>
  );
}
