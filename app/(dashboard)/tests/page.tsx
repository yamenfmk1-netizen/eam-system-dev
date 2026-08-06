'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import TestForm from '@/components/tests/TestForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Search, Loader2, FileDown } from 'lucide-react';
import { TEST_TYPE_LABELS, TEST_RESULT_LABELS } from '@/types/database.types';
import type { Building } from '@/types/database.types';
import PrivateFileLink from '@/components/ui/PrivateFileLink';

export default function TestsPage() {
  const supabase = createClient();
  const [tests, setTests] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: t }, { data: b }] = await Promise.all([
      supabase.from('tests').select('*, buildings(name), equipment(name, asset_id)').order('test_date', { ascending: false }),
      supabase.from('buildings').select('*').is('deleted_at', null).order('building_number'),
    ]);
    setTests(t ?? []);
    setBuildings(b ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = tests.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      t.test_number.toLowerCase().includes(q) ||
      (t.buildings?.name ?? '').toLowerCase().includes(q) ||
      (t.equipment?.name ?? '').toLowerCase().includes(q);
    const matchesResult = resultFilter === 'all' || t.result === resultFilter;
    return matchesSearch && matchesResult;
  });

  const resultTone = (r: string) => (r === 'passed' ? 'ready' : r === 'passed_with_observation' ? 'watch' : r === 'failed' ? 'fault' : 'unknown');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الاختبارات</h1>
          <p className="text-sm text-gray-500">سجل الاختبارات الدورية للمعدات الكهربائية</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> تسجيل اختبار</button>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <TestForm buildings={buildings} onClose={() => setShowForm(false)} onSaved={loadData} />}
    </div>
  );
}
