'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import TestForm from '@/components/tests/TestForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Plus, Search, Loader2, FileDown, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { TEST_TYPE_LABELS, TEST_RESULT_LABELS } from '@/types/database.types';
import type { Building, UserRole } from '@/types/database.types';
import PrivateFileLink from '@/components/ui/PrivateFileLink';
import TestsImportDialog from '@/components/import/TestsImportDialog';
import toast from 'react-hot-toast';

export default function TestsPage() {
  const supabase = createClient();
  const [tests, setTests] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingTest, setEditingTest] = useState<any | null>(null);
  const [deletingTest, setDeletingTest] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [role, setRole] = useState<UserRole>('viewer');

async function loadData() {
  setLoading(true);

  const { data: department } = await supabase
    .from('departments')
    .select('id')
    .eq('code', DEPARTMENT_CODE)
    .single();

  if (!department) {
    setTests([]);
    setBuildings([]);
    setRole('viewer');
    setLoading(false);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const profilePromise = user
    ? supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
    : Promise.resolve({ data: null } as any);

  const [{ data: t }, { data: b }, { data: profile }] = await Promise.all([
    supabase
      .from('tests')
      .select('*, buildings(name), equipment(name, asset_id)')
      .eq('department_id', department.id)
      .order('test_date', { ascending: false }),

    supabase
      .from('buildings')
      .select('*')
      .is('deleted_at', null)
      .order('building_number'),

    profilePromise,
  ]);

  setTests(t ?? []);
  setBuildings(b ?? []);
  setRole((profile?.role as UserRole) ?? 'viewer');
  setLoading(false);
}

  useEffect(() => { loadData(); }, []);

  const filtered = tests.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (t.test_number ?? '').toLowerCase().includes(q) ||
      (t.buildings?.name ?? '').toLowerCase().includes(q) ||
      (t.equipment?.name ?? '').toLowerCase().includes(q);
    const matchesResult = resultFilter === 'all' || t.result === resultFilter;
    return matchesSearch && matchesResult;
  });

  const resultTone = (r: string) => (r === 'passed' ? 'ready' : r === 'passed_with_observation' ? 'watch' : r === 'failed' ? 'fault' : 'unknown');
  const canEdit = role !== 'viewer';
  const canDelete = role === 'admin' || role === 'engineer';

  async function handleDelete() {
    if (!deletingTest || !canDelete) return;
    setDeleting(true);

    const { error } = await supabase
      .from('tests')
      .delete()
      .eq('id', deletingTest.id);

    setDeleting(false);

    if (error) {
      toast.error(error.message || 'تعذر حذف الاختبار');
      return;
    }

    toast.success('تم حذف الاختبار');
    setDeletingTest(null);
    await loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الاختبارات</h1>
          <p className="text-sm text-gray-500">سجل الاختبارات الدورية للمعدات الكهربائية</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary"><FileSpreadsheet className="h-4 w-4" /> استيراد Excel</button>
          <button onClick={() => { setEditingTest(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> تسجيل اختبار</button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم الاختبار، المبنى، المعدة..." className="input-field pe-9" />
        </div>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="input-field sm:w-56">
          <option value="all">جميع النتائج</option>
          <option value="passed">ناجح</option>
          <option value="passed_with_observation">ناجح مع ملاحظات</option>
          <option value="failed">فاشل</option>
          <option value="not_completed">غير مكتمل</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد اختبارات مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">رقم الاختبار</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">المبنى</th>
                <th className="px-4 py-3">المعدة</th>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">النتيجة</th>
                <th className="px-4 py-3">القادم</th>
                <th className="px-4 py-3">التقرير</th>
                {canEdit && <th className="px-4 py-3">الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800" dir="ltr">{t.test_number}</td>
                  <td className="px-4 py-3 text-gray-500">{TEST_TYPE_LABELS[t.test_type as keyof typeof TEST_TYPE_LABELS]}</td>
                  <td className="px-4 py-3 text-gray-500">{t.buildings?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{t.equipment?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(t.test_date).toLocaleDateString('ar-SA')}</td>
                  <td className="px-4 py-3"><StatusBadge label={TEST_RESULT_LABELS[t.result as keyof typeof TEST_RESULT_LABELS]} tone={resultTone(t.result)} /></td>
                  <td className="px-4 py-3 text-gray-500">{t.next_test_date ? new Date(t.next_test_date).toLocaleDateString('ar-SA') : '—'}</td>
                  <td className="px-4 py-3">
                    {t.pdf_report_url ? (
                      <PrivateFileLink bucket="documents" path={t.pdf_report_url} mode="view" className="flex items-center gap-1 text-primary-600 hover:underline">
                        <FileDown className="h-4 w-4" /> عرض
                      </PrivateFileLink>
                    ) : '—'}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setEditingTest(t); setShowForm(true); }}
                          className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                          title="تعديل الاختبار"
                          aria-label="تعديل الاختبار"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingTest(t)}
                            className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="حذف الاختبار"
                            aria-label="حذف الاختبار"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <TestForm
          test={editingTest ?? undefined}
          buildings={buildings}
          onClose={() => { setShowForm(false); setEditingTest(null); }}
          onSaved={loadData}
        />
      )}
      {showImport && <TestsImportDialog onClose={() => setShowImport(false)} onImported={loadData} />}

      <ConfirmDialog
        open={Boolean(deletingTest)}
        title="حذف الاختبار"
        message={`هل أنت متأكد من حذف الاختبار ${deletingTest?.test_number ?? ''}؟ سيتم حذف السجل نهائيًا، وسيبقى حدث الحذف موثقًا في سجل التحديثات.`}
        confirmLabel="حذف الاختبار"
        onConfirm={handleDelete}
        onCancel={() => setDeletingTest(null)}
        loading={deleting}
      />
    </div>
  );
}
