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
  CalendarClock,
  PlayCircle,
  History,
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

type TestStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

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
  const [newTestInitialStatus, setNewTestInitialStatus] =
    useState<TestStatus>('completed');

  const [deletingTest, setDeletingTest] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  const [role, setRole] = useState<UserRole>('viewer');

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
      } else {
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

        testsQuery = testsQuery.eq('department_id', department.id);
      }

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
        console.error('Error loading tests:', testsError);
      }

      if (buildingsError) {
        console.error('Error loading buildings:', buildingsError);
      }

      setTests(t ?? []);
      setBuildings((b ?? []) as Building[]);
      setRole((profile?.role as UserRole) ?? 'viewer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseFiltered = tests.filter((t) => {
    const q = search.toLowerCase();

    const matchesSearch =
      (t.test_number ?? '').toLowerCase().includes(q) ||
      (t.buildings?.name ?? '').toLowerCase().includes(q) ||
      (t.equipment?.name ?? '').toLowerCase().includes(q);

    const matchesDepartment =
      !IS_MANAGEMENT_SITE ||
      departmentFilter === 'all' ||
      t.department_id === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  const upcomingTests = baseFiltered
    .filter((t) => (t.status ?? 'completed') === 'scheduled')
    .sort(
      (a, b) =>
        new Date(a.test_date).getTime() -
        new Date(b.test_date).getTime()
    );

  const inProgressTests = baseFiltered
    .filter((t) => (t.status ?? 'completed') === 'in_progress')
    .sort(
      (a, b) =>
        new Date(a.test_date).getTime() -
        new Date(b.test_date).getTime()
    );

  const historyTests = baseFiltered
    .filter((t) => {
      const status = t.status ?? 'completed';
      return status === 'completed' || status === 'cancelled';
    })
    .filter(
      (t) =>
        resultFilter === 'all' ||
        t.result === resultFilter
    )
    .sort(
      (a, b) =>
        new Date(b.test_date).getTime() -
        new Date(a.test_date).getTime()
    );

  const resultTone = (r: string) =>
    r === 'passed'
      ? 'ready'
      : r === 'passed_with_observation'
        ? 'watch'
        : r === 'failed'
          ? 'fault'
          : 'unknown';

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

  async function startTest(testId: string) {
    if (!canEdit) return;

    setChangingStatusId(testId);

    const { error } = await supabase
      .from('tests')
      .update({ status: 'in_progress' })
      .eq('id', testId);

    setChangingStatusId(null);

    if (error) {
      toast.error(error.message || 'تعذر بدء الاختبار');
      return;
    }

    toast.success('تم نقل الاختبار إلى جاري التنفيذ');
    await loadData();
  }

  function openNewScheduledTest() {
    setEditingTest(null);
    setNewTestInitialStatus('scheduled');
    setShowForm(true);
  }

  function openNewCompletedTest() {
    setEditingTest(null);
    setNewTestInitialStatus('completed');
    setShowForm(true);
  }

  function openEdit(test: any) {
    setEditingTest(test);
    setNewTestInitialStatus(
      (test.status ?? 'completed') as TestStatus
    );
    setShowForm(true);
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return '—';

    return new Date(`${value}T00:00:00`).toLocaleDateString('ar-SA');
  }

  function daysFromToday(value: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const date = new Date(`${value}T00:00:00`);
    date.setHours(0, 0, 0, 0);

    return Math.round(
      (date.getTime() - today.getTime()) / 86400000
    );
  }

  function dueLabel(value: string) {
    const days = daysFromToday(value);

    if (days === 0) return 'اليوم';
    if (days === 1) return 'غدًا';
    if (days > 1) return `بعد ${days} أيام`;
    if (days === -1) return 'متأخر يوم';
    return `متأخر ${Math.abs(days)} أيام`;
  }

  function dueClass(value: string) {
    const days = daysFromToday(value);

    if (days < 0) return 'bg-red-50 text-red-700';
    if (days <= 2) return 'bg-amber-50 text-amber-700';
    return 'bg-blue-50 text-blue-700';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الاختبارات</h1>
          <p className="text-sm text-gray-500">
            جدولة الاختبارات ومتابعة تنفيذها وتوثيق نتائجها
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

          {canEdit && (
            <>
              <button
                onClick={openNewScheduledTest}
                className="btn-secondary"
              >
                <CalendarClock className="h-4 w-4" />
                إضافة اختبار قادم
              </button>

              <button
                onClick={openNewCompletedTest}
                className="btn-primary"
              >
                <Plus className="h-4 w-4" />
                تسجيل اختبار منفذ
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم الاختبار، المبنى، المعدة..."
            className="input-field pe-9"
          />
        </div>

        {IS_MANAGEMENT_SITE && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="input-field sm:w-48"
          >
            <option value="all">جميع الإدارات</option>

            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-900">
                الاختبارات القادمة
              </h2>
              <p className="text-xs text-gray-500">
                اختبارات مجدولة ولم يبدأ تنفيذها بعد
              </p>
            </div>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {upcomingTests.length}
          </span>
        </div>

        <div className="card p-0">
          {loading ? (
            <div className="flex justify-center py-10 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : upcomingTests.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد اختبارات قادمة
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcomingTests.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"
                >
                  <div className="min-w-[150px]">
                    <div className="font-semibold text-gray-900">
                      {formatDate(t.test_date)}
                    </div>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${dueClass(
                        t.test_date
                      )}`}
                    >
                      {dueLabel(t.test_date)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-semibold text-gray-900"
                        dir="ltr"
                      >
                        {t.test_number}
                      </span>
                      <span className="text-sm text-gray-500">
                        {TEST_TYPE_LABELS[
                          t.test_type as keyof typeof TEST_TYPE_LABELS
                        ] ?? t.test_type}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      {t.buildings?.name ?? '—'}
                      {' • '}
                      {t.equipment?.name ?? 'بدون تحديد معدة'}
                      {t.responsible_person
                        ? ` • ${t.responsible_person}`
                        : ''}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startTest(t.id)}
                        disabled={changingStatusId === t.id}
                        className="btn-primary"
                      >
                        {changingStatusId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        بدء الاختبار
                      </button>

                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="btn-secondary"
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeletingTest(t)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="حذف الاختبار"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="font-bold text-gray-900">
                جاري التنفيذ
              </h2>
              <p className="text-xs text-gray-500">
                اختبارات بدأت وتحتاج تحديث النتيجة أو إكمالها
              </p>
            </div>
          </div>

          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            {inProgressTests.length}
          </span>
        </div>

        <div className="card p-0">
          {loading ? (
            <div className="flex justify-center py-10 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : inProgressTests.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد اختبارات جاري تنفيذها
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inProgressTests.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"
                >
                  <div className="min-w-[150px]">
                    <div className="font-semibold text-gray-900">
                      {formatDate(t.test_date)}
                    </div>
                    <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      جاري التنفيذ
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-semibold text-gray-900"
                        dir="ltr"
                      >
                        {t.test_number}
                      </span>
                      <span className="text-sm text-gray-500">
                        {TEST_TYPE_LABELS[
                          t.test_type as keyof typeof TEST_TYPE_LABELS
                        ] ?? t.test_type}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      {t.buildings?.name ?? '—'}
                      {' • '}
                      {t.equipment?.name ?? 'بدون تحديد معدة'}
                    </div>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="btn-primary"
                    >
                      <Pencil className="h-4 w-4" />
                      تحديث / إكمال
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-600" />
            <div>
              <h2 className="font-bold text-gray-900">
                سجل الاختبارات
              </h2>
              <p className="text-xs text-gray-500">
                الاختبارات المكتملة والملغاة
              </p>
            </div>
          </div>

          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
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
          ) : historyTests.length === 0 ? (
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
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">النتيجة</th>
                  <th className="px-4 py-3">التقرير</th>
                  {canEdit && <th className="px-4 py-3">الإجراءات</th>}
                </tr>
              </thead>

              <tbody>
                {historyTests.map((t) => {
                  const status = (t.status ?? 'completed') as TestStatus;

                  return (
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
                        {t.equipment?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(t.test_date)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            status === 'cancelled'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {status === 'cancelled' ? 'ملغى' : 'مكتمل'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {status === 'cancelled' ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <StatusBadge
                            label={
                              TEST_RESULT_LABELS[
                                t.result as keyof typeof TEST_RESULT_LABELS
                              ] ?? t.result
                            }
                            tone={resultTone(t.result)}
                          />
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {t.pdf_report_url ? (
                          <PrivateFileLink
                            bucket="documents"
                            path={t.pdf_report_url}
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
                              onClick={() => openEdit(t)}
                              className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                              title="تعديل الاختبار"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeletingTest(t)}
                                className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                title="حذف الاختبار"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {showForm && (
        <TestForm
          test={editingTest ?? undefined}
          buildings={buildings}
          initialStatus={newTestInitialStatus}
          onClose={() => {
            setShowForm(false);
            setEditingTest(null);
          }}
          onSaved={loadData}
        />
      )}

      {showImport && (
        <TestsImportDialog
          onClose={() => setShowImport(false)}
          onImported={loadData}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingTest)}
        title="حذف الاختبار"
        message={`هل أنت متأكد من حذف الاختبار ${
          deletingTest?.test_number ?? ''
        }؟ سيتم حذف السجل نهائيًا، وسيبقى حدث الحذف موثقًا في سجل التحديثات.`}
        confirmLabel="حذف الاختبار"
        onConfirm={handleDelete}
        onCancel={() => setDeletingTest(null)}
        loading={deleting}
      />
    </div>
  );
}
