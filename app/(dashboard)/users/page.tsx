'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import UserForm from '@/components/users/UserForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Plus, Search, Loader2, Trash2 } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/types/database.types';
import type { Profile, UserRole } from '@/types/database.types';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function updateRole(userId: string, role: UserRole) {
    setSavingId(userId);
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok) {
      toast.error(data.error ?? 'تعذر تحديث الدور');
      loadUsers(); // إعادة تحميل لإرجاع القيمة الأصلية في القائمة المنسدلة
      return;
    }
    toast.success('تم تحديث الدور');
    loadUsers();
  }

  async function toggleActive(user: Profile) {
    setSavingId(user.id);
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok) {
      toast.error(data.error ?? 'تعذر التحديث');
      return;
    }
    loadUsers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    setDeleteTarget(null);
    if (!res.ok) {
      toast.error(data.error ?? 'تعذر حذف المستخدم');
      return;
    }
    toast.success('تم حذف المستخدم');
    loadUsers();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-sm text-gray-500">إدارة حسابات المستخدمين وصلاحياتهم</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> إضافة مستخدم</button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو البريد الإلكتروني..." className="input-field pe-9 sm:max-w-sm" />
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا يوجد مستخدمون مطابقون</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">البريد الإلكتروني</th>
                <th className="px-4 py-3">الدور</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-500" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      {Object.entries(USER_ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)} disabled={savingId === u.id}>
                      <StatusBadge label={u.is_active ? 'نشط' : 'موقوف'} tone={u.is_active ? 'ready' : 'unknown'} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDeleteTarget(u)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <UserForm onClose={() => setShowForm(false)} onSaved={loadUsers} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف المستخدم"
        message={`هل أنت متأكد من حذف حساب "${deleteTarget?.full_name}"؟ لن يتمكن من تسجيل الدخول بعد الآن.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
