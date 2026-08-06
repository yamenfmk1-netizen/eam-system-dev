'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import TestForm from '@/components/tests/TestForm';
import TestsImportDialog from '@/components/import/TestsImportDialog';
import StatusBadge from '@/components/ui/StatusBadge';
import PrivateFileLink from '@/components/ui/PrivateFileLink';
import {
  Plus,
  Search,
  Loader2,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react';
import {
  TEST_TYPE_LABELS,
  TEST_RESULT_LABELS,
} from '@/types/database.types';
import type { Building } from '@/types/database.types';

export default function TestsPage() {
  const supabase = createClient();

  const [tests, setTests] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function loadData() {
    setLoading(true);

    const [{ data: testsData }, { data: buildingsData }] =
      await Promise.all([
        supabase
          .from('tests')
          .select(
            '*, buildings(name), equipment(name, asset_id)'
          )
          .order('test_date', { ascending: false }),

        supabase
          .from('buildings')
          .select('*')
          .is('deleted_at', null)
          .order('building_number'),
      ]);

    setTests(testsData ?? []);
    setBuildings(buildingsData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = tests.filter((test) => {
    const query = search.toLowerCase();

    const matchesSearch =
      test.test_number.toLowerCase().includes(query) ||
      (test.buildings?.name ?? '').toLowerCase().includes(query) ||
      (test.equipment?.name ?? '').toLowerCase().includes(query);

    const matchesResult =
      resultFilter === 'all' || test.result === resultFilter;

    return matchesSearch && matchesResult;
  });

  const resultTone = (result: string) => {
    if (result === 'passed') return 'ready';
    if (result === 'passed_with_observation') return 'watch';
    if (result === 'failed') return 'fault';

    return 'unknown';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            الاختبارات
          </h1>

          <p className="text-sm text-gray-500">
            سجل الاختبارات الدورية للمعدات الكهربائية
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary"
          >
            <FileSpreadsheet className="h-4 w-4" />
            استيراد Excel
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            تسجيل اختبار
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث برقم الاختبار، المبنى، المعدة..."
            className="input-field pe-9"
          />
        </div>

        <select
          value={resultFilter}
          onChange={(event) => setResultFilter(event.target.value)}
          className="input-field sm:w-56"
        >
          <option value="all">جميع النتائج</option>
          <option value="passed">ناجح</option>
          <option value="passed_with_observation">
            ناجح مع ملاحظات
          </option>
          <option value="failed">فاشل</option>
          <option value="not_completed">غير مكتمل</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            لا توجد اختبارات مطابقة
          </div>
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
              {filtered.map((test) => (
                <tr
                  key={test.id}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td
                    className="px-4 py-3 font-medium text-gray-800"
                    dir="ltr"
                  >
                    {test.test_number}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {
                      TEST_TYPE_LABELS[
                        test.test_type as keyof typeof TEST_TYPE_LABELS
                      ]
                    }
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {test.buildings?.name}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {test.equipment?.name ?? '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {new Date(test.test_date).toLocaleDateString(
                      'ar-SA'
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        TEST_RESULT_LABELS[
                          test.result as keyof typeof TEST_RESULT_LABELS
                        ]
                      }
                      tone={resultTone(test.result)}
                    />
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {test.next_test_date
                      ? new Date(
                          test.next_test_date
                        ).toLocaleDateString('ar-SA')
                      : '—'}
                  </td>

                  <td className="px-4 py-3">
                    {test.pdf_report_url ? (
                      <PrivateFileLink
                        bucket="documents"
                        path={test.pdf_report_url}
                        mode="view"
                        className="flex items-center gap-1 text-primary-600 hover:underline"
                      >
                        <FileDown className="h-4 w-4" />
                        عرض
                      </PrivateFileLink>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <TestForm
          buildings={buildings}
          onClose={() => setShowForm(false)}
          onSaved={loadData}
        />
      )}

      {showImport && (
        <TestsImportDialog
          onClose={() => setShowImport(false)}
          onImported={loadData}
        />
      )}
    </div>
  );
}