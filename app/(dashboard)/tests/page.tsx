'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';

import TestForm from '@/components/tests/TestForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

import {
  Plus,
  Search,
  Loader2,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Trash2,
} from 'lucide-react';

import {
  TEST_TYPE_LABELS,
  TEST_RESULT_LABELS,
} from '@/types/database.types';

import type {
  Building,
  UserRole,
} from '@/types/database.types';

import PrivateFileLink from '@/components/ui/PrivateFileLink';
import TestsImportDialog from '@/components/import/TestsImportDialog';
import toast from 'react-hot-toast';

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

export default function TestsPage() {
  const supabase = createClient();

  const [tests, setTests] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [editingTest, setEditingTest] = useState<any | null>(null);
  const [deletingTest, setDeletingTest] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [role, setRole] = useState<UserRole>('viewer');

  // =========================================================
  // تحميل البيانات
  // =========================================================

  async function loadData() {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const profilePromise = user
        ? supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any);

      let testsQuery = supabase
        .from('tests')
        .select('*, buildings(name), equipment(name, asset_id)')
        .order('test_date', { ascending: false });

      // =====================================================
      // موقع الإدارة
      //
      // لا نثبت الاستعلام على قسم واحد.
      // RLS يعيد فقط الإدارات المسموح للمستخدم بها.
      // كما نحمل أسماء الإدارات المسموحة لفلتر الإدارة.
      // =====================================================

      if (IS_MANAGEMENT_SITE) {
        if (!user) {
          setTests([]);
          setBuildings([]);
          setDepartments([]);
          setRole('viewer');
          return;
        }

        const {
          data: userDepartments,
          error: userDepartmentsError,
        } = await supabase
          .from('user_departments')
          .select('department_id')
          .eq('user_id', user.id);

        if (userDepartmentsError) {
          console.error(
            'Error loading user departments:',
            userDepartmentsError
          );

          setTests([]);
          setBuildings([]);
          setDepartments([]);
          setRole('viewer');
          return;
        }

        const departmentIds = Array.from(
          new Set(
            (userDepartments ?? [])
              .map((item) => item.department_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        if (departmentIds.length > 0) {
          const {
            data: allowedDepartments,
            error: departmentsError,
          } = await supabase
            .from('departments')
            .select('id,name,code')
            .in('id', departmentIds)
            .order('name');

          if (departmentsError) {
            console.error(
              'Error loading departments:',
              departmentsError
            );

            setDepartments([]);
          } else {
            setDepartments(
              (allowedDepartments ?? []) as DepartmentOption[]
            );
          }
        } else {
          setDepartments([]);
        }
      }

      // =====================================================
      // مواقع الأقسام العادية
      // Electrical / HVAC / Mechanical / Civil
      // =====================================================

      else {
        const {
          data: department,
          error: departmentError,
        } = await supabase
          .from('departments')
          .select('id')
          .eq('code', DEPARTMENT_CODE)
          .single();

        if (departmentError || !department) {
          console.error(
            'Department not found:',
            DEPARTMENT_CODE,
            departmentError
          );

          setTests([]);
          setBuildings([]);
          setRole('viewer');
          return;
        }

        testsQuery = testsQuery.eq(
          'department_id',
          department.id
        );
      }

      // =====================================================
      // تحميل الاختبارات + المباني + الدور
      // =====================================================

      const [
        { data: t, error: testsError },
        { data: b, error: buildingsError },
        { data: profile },
      ] = await Promise.all([
        testsQuery,

        supabase
          .from('buildings')
          .select('*')
          .is('deleted_at', null)
          .order('building_number'),

        profilePromise,
      ]);

      if (testsError) {
        console.error(
          'Error loading tests:',
          testsError
        );
      }

      if (buildingsError) {
        console.error(
          'Error loading buildings:',
          buildingsError
        );
      }

      setTests(t ?? []);
      setBuildings((b ?? []) as Building[]);
      setRole(
        (profile?.role as UserRole) ?? 'viewer'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // الفلاتر
  // =========================================================

  const filtered = tests.filter((t) => {
    const q = search.toLowerCase();

    const matchesSearch =
      (t.test_number ?? '')
        .toLowerCase()
        .includes(q) ||
      (t.buildings?.name ?? '')
        .toLowerCase()
        .includes(q) ||
      (t.equipment?.name ?? '')
        .toLowerCase()
        .includes(q);

    const matchesDepartment =
      !IS_MANAGEMENT_SITE ||
      departmentFilter === 'all' ||
      t.department_id === departmentFilter;

    const matchesResult =
      resultFilter === 'all' ||
      t.result === resultFilter;

    return (
      matchesSearch &&
      matchesDepartment &&
      matchesResult
    );
  });

  // الاختبارات القادمة: تُعرض في خانة مستقلة عن سجل الاختبارات.
  // تعتمد على next_test_date وتراعي فلتر الإدارة في موقع الإدارة.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const upcomingTests = tests
    .filter((t) => {
      if (!t.next_test_date) return false;

      const nextDate = new Date(`${t.next_test_date}T00:00:00`);

      const matchesDepartment =
        !IS_MANAGEMENT_SITE ||
        departmentFilter === 'all' ||
        t.department_id === departmentFilter;

      return nextDate >= todayStart && matchesDepartment;
    })
    .sort(
      (a, b) =>
        new Date(`${a.next_test_date}T00:00:00`).getTime() -
        new Date(`${b.next_test_date}T00:00:00`).getTime()
    );

  function daysUntil(dateValue: string) {
    const target = new Date(`${dateValue}T00:00:00`);
    const diff = target.getTime() - todayStart.getTime();
    return Math.round(diff / 86400000);
  }

  function upcomingDateLabel(dateValue: string) {
    const days = daysUntil(dateValue);

    if (days === 0) return 'اليوم';
    if (days === 1) return 'غدًا';
    if (days === 2) return 'بعد يومين';
    return `بعد ${days} أيام`;
  }

  const resultTone = (r: string) =>
    r === 'passed'
      ? 'ready'
      : r === 'passed_with_observation'
        ? 'watch'
        : r === 'failed'
          ? 'fault'
          : 'unknown';

  const canEdit = role !== 'viewer';
  const canDelete =
    role === 'admin' ||
    role === 'engineer';

  // =========================================================
  // حذف الاختبار
  // =========================================================

  async function handleDelete() {
    if (!deletingTest || !canDelete) return;

    setDeleting(true);

    const { error } = await supabase
      .from('tests')
      .delete()
      .eq('id', deletingTest.id);

    setDeleting(false);

    if (error) {
      toast.error(
        error.message ||
          'تعذر حذف الاختبار'
      );
      return;
    }

    toast.success('تم حذف الاختبار');

    setDeletingTest(null);

    await loadData();
  }

  // =========================================================
  // الصفحة
  // =========================================================

  return (
    <div className="space-y-5">
      {/* =====================================================
          Header
          ===================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            الاختبارات
          </h1>

          <p className="text-sm text-gray-500">
            سجل الاختبارات الدورية للمعدات
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              setShowImport(true)
            }
            className="btn-secondary"
          >
            <FileSpreadsheet className="h-4 w-4" />
            استيراد Excel
          </button>

          <button
            onClick={() => {
              setEditingTest(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            تسجيل اختبار
          </button>
        </div>
      </div>

      {/* =====================================================
          Upcoming Tests - Independent Section
          ===================================================== */}

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              الاختبارات القادمة
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              الاختبارات المجدولة حسب تاريخ الاختبار القادم
            </p>
          </div>

          {!loading && (
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {upcomingTests.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : upcomingTests.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            لا توجد اختبارات قادمة مجدولة
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                  <th className="px-4 py-3">موعد الاختبار</th>
                  <th className="px-4 py-3">المبنى</th>
                  <th className="px-4 py-3">المعدة</th>
                  <th className="px-4 py-3">نوع الاختبار</th>
                  <th className="px-4 py-3">متبقي</th>
                </tr>
              </thead>

              <tbody>
                {upcomingTests.map((t) => {
                  const remainingDays = daysUntil(t.next_test_date);

                  return (
                    <tr
                      key={`upcoming-${t.id}`}
                      className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {new Date(
                          `${t.next_test_date}T00:00:00`
                        ).toLocaleDateString('ar-SA')}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {t.buildings?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {t.equipment?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {TEST_TYPE_LABELS[
                          t.test_type as keyof typeof TEST_TYPE_LABELS
                        ] ?? t.test_type}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            remainingDays <= 3
                              ? 'bg-red-50 text-red-700'
                              : remainingDays <= 7
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {upcomingDateLabel(t.next_test_date)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================
          Test Records / History
          ===================================================== */}

      <div>
        <h2 className="font-semibold text-gray-900">سجل الاختبارات</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          جميع الاختبارات المسجلة ونتائجها
        </p>
      </div>

      {/* =====================================================
          Filters
          ===================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}

        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="ابحث برقم الاختبار، المبنى، المعدة..."
            className="input-field pe-9"
          />
        </div>

        {/* Department Filter - Management only */}

        {IS_MANAGEMENT_SITE && (
          <select
            value={departmentFilter}
            onChange={(e) =>
              setDepartmentFilter(
                e.target.value
              )
            }
            className="input-field sm:w-48"
          >
            <option value="all">
              جميع الإدارات
            </option>

            {departments.map(
              (department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              )
            )}
          </select>
        )}

        {/* Result */}

        <select
          value={resultFilter}
          onChange={(e) =>
            setResultFilter(
              e.target.value
            )
          }
          className="input-field sm:w-56"
        >
          <option value="all">
            جميع النتائج
          </option>

          <option value="passed">
            ناجح
          </option>

          <option value="passed_with_observation">
            ناجح مع ملاحظات
          </option>

          <option value="failed">
            فاشل
          </option>

          <option value="not_completed">
            غير مكتمل
          </option>
        </select>
      </div>

      {/* =====================================================
          Tests Table
          ===================================================== */}

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
                <th className="px-4 py-3">
                  رقم الاختبار
                </th>

                <th className="px-4 py-3">
                  النوع
                </th>

                <th className="px-4 py-3">
                  المبنى
                </th>

                <th className="px-4 py-3">
                  المعدة
                </th>

                <th className="px-4 py-3">
                  التاريخ
                </th>

                <th className="px-4 py-3">
                  النتيجة
                </th>

                <th className="px-4 py-3">
                  القادم
                </th>

                <th className="px-4 py-3">
                  التقرير
                </th>

                {canEdit && (
                  <th className="px-4 py-3">
                    الإجراءات
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td
                    className="px-4 py-3 font-medium text-gray-800"
                    dir="ltr"
                  >
                    {t.test_number}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {TEST_TYPE_LABELS[
                      t.test_type as keyof typeof TEST_TYPE_LABELS
                    ] ?? t.test_type}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {t.buildings?.name}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {t.equipment?.name ??
                      '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {new Date(
                      t.test_date
                    ).toLocaleDateString(
                      'ar-SA'
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        TEST_RESULT_LABELS[
                          t.result as keyof typeof TEST_RESULT_LABELS
                        ] ?? t.result
                      }
                      tone={resultTone(
                        t.result
                      )}
                    />
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {t.next_test_date
                      ? new Date(
                          t.next_test_date
                        ).toLocaleDateString(
                          'ar-SA'
                        )
                      : '—'}
                  </td>

                  <td className="px-4 py-3">
                    {t.pdf_report_url ? (
                      <PrivateFileLink
                        bucket="documents"
                        path={
                          t.pdf_report_url
                        }
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

                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTest(
                              t
                            );
                            setShowForm(
                              true
                            );
                          }}
                          className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                          title="تعديل الاختبار"
                          aria-label="تعديل الاختبار"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeletingTest(
                                t
                              )
                            }
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

      {/* =====================================================
          Test Form
          ===================================================== */}

      {showForm && (
        <TestForm
          test={
            editingTest ??
            undefined
          }
          buildings={buildings}
          onClose={() => {
            setShowForm(false);
            setEditingTest(null);
          }}
          onSaved={loadData}
        />
      )}

      {/* =====================================================
          Import
          ===================================================== */}

      {showImport && (
        <TestsImportDialog
          onClose={() =>
            setShowImport(false)
          }
          onImported={loadData}
        />
      )}

      {/* =====================================================
          Delete Confirmation
          ===================================================== */}

      <ConfirmDialog
        open={Boolean(
          deletingTest
        )}
        title="حذف الاختبار"
        message={`هل أنت متأكد من حذف الاختبار ${deletingTest?.test_number ?? ''}؟ سيتم حذف السجل نهائيًا، وسيبقى حدث الحذف موثقًا في سجل التحديثات.`}
        confirmLabel="حذف الاختبار"
        onConfirm={handleDelete}
        onCancel={() =>
          setDeletingTest(null)
        }
        loading={deleting}
      />
    </div>
  );
}
