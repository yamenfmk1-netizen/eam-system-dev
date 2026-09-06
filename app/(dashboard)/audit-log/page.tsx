'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  add: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  upload: 'رفع ملف',
  close_fault: 'إغلاق عطل',
  complete_maintenance: 'إكمال صيانة',
  complete_test: 'إكمال اختبار',
};

const TABLE_LABELS: Record<string, string> = {
  buildings: 'المباني',
  equipment: 'المعدات',
  tests: 'الاختبارات',
  maintenance_records: 'الصيانة',
  maintenance_schedules: 'خطط الصيانة',
  faults: 'الأعطال',
  spare_parts: 'قطع الغيار',
};

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

function recordLabel(log: any) {
  const value = log.new_value ?? log.old_value ?? {};

  return (
    value.fault_number ??
    value.maintenance_number ??
    value.test_number ??
    value.asset_id ??
    value.part_number ??
    value.part_name ??
    value.building_number ??
    value.name ??
    '—'
  );
}

function dateOnlyRiyadh(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function AuditLogPage() {
  const supabase = createClient();

  const [logs, setLogs] = useState<any[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setLogs([]);
            setDepartments([]);
          }
          return;
        }

        if (IS_MANAGEMENT_SITE) {
          const {
            data: userDepartments,
            error: userDepartmentsError,
          } = await supabase
            .from('user_departments')
            .select('department_id')
            .eq('user_id', user.id);

          if (userDepartmentsError) {
            throw userDepartmentsError;
          }

          const departmentIds = Array.from(
            new Set(
              (userDepartments ?? [])
                .map((item) => item.department_id)
                .filter((id): id is string => Boolean(id))
            )
          );

          if (departmentIds.length === 0) {
            if (!cancelled) {
              setLogs([]);
              setDepartments([]);
            }
            return;
          }

          const [
            { data: allowedDepartments, error: departmentsError },
            { data: departmentLogs, error: departmentLogsError },
            { data: generalLogs, error: generalLogsError },
          ] = await Promise.all([
            supabase
              .from('departments')
              .select('id,name,code')
              .in('id', departmentIds)
              .order('name'),

            supabase
              .from('audit_logs')
              .select('*')
              .in('department_id', departmentIds)
              .order('created_at', { ascending: false })
              .limit(300),

            supabase
              .from('audit_logs')
              .select('*')
              .is('department_id', null)
              .order('created_at', { ascending: false })
              .limit(300),
          ]);

          if (departmentsError) throw departmentsError;
          if (departmentLogsError) throw departmentLogsError;
          if (generalLogsError) throw generalLogsError;

          const combined = [
            ...(departmentLogs ?? []),
            ...(generalLogs ?? []),
          ]
            .sort(
              (a: any, b: any) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
            .slice(0, 300);

          if (!cancelled) {
            setDepartments(
              (allowedDepartments ?? []) as DepartmentOption[]
            );
            setLogs(combined);
          }
        } else {
          const {
            data: department,
            error: departmentError,
          } = await supabase
            .from('departments')
            .select('id,name,code')
            .eq('code', DEPARTMENT_CODE)
            .single();

          if (departmentError || !department) {
            throw departmentError ?? new Error('تعذر تحديد القسم');
          }

          const {
            data: departmentLogs,
            error: logsError,
          } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('department_id', department.id)
            .order('created_at', { ascending: false })
            .limit(300);

          if (logsError) throw logsError;

          if (!cancelled) {
            setDepartments([department as DepartmentOption]);
            setLogs(departmentLogs ?? []);
          }
        }
      } catch (error) {
        console.error('Error loading audit log:', error);

        if (!cancelled) {
          setLogs([]);
          setDepartments([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const departmentNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const userOptions = useMemo(
    () =>
      Array.from(
        new Set(
          logs
            .map((log) => log.user_name)
            .filter(
              (name): name is string =>
                typeof name === 'string' && name.trim().length > 0
            )
        )
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [logs]
  );

  const filtered = logs.filter((log) => {
    const q = search.trim().toLowerCase();

    const itemLabel = String(recordLabel(log)).toLowerCase();
    const actionLabel = (
      ACTION_LABELS[log.action] ?? log.action ?? ''
    ).toLowerCase();
    const tableLabel = (
      TABLE_LABELS[log.table_name] ?? log.table_name ?? ''
    ).toLowerCase();

    const departmentName = log.department_id
      ? departmentNameById.get(log.department_id) ?? ''
      : 'عام غير محدد';

    const matchesSearch =
      !q ||
      (log.user_name ?? '').toLowerCase().includes(q) ||
      (log.table_name ?? '').toLowerCase().includes(q) ||
      tableLabel.includes(q) ||
      actionLabel.includes(q) ||
      itemLabel.includes(q) ||
      departmentName.toLowerCase().includes(q);

    const matchesAction =
      actionFilter === 'all' || log.action === actionFilter;

    const matchesTable =
      tableFilter === 'all' || log.table_name === tableFilter;

    const matchesUser =
      userFilter === 'all' || log.user_name === userFilter;

    let matchesDepartment = true;

    if (IS_MANAGEMENT_SITE) {
      if (departmentFilter === 'all') {
        // افتراضيًا نعرض نشاط الأقسام فقط، ونخفي السجلات القديمة غير المرتبطة بقسم.
        matchesDepartment = Boolean(log.department_id);
      } else if (departmentFilter === 'unassigned') {
        matchesDepartment = !log.department_id;
      } else {
        matchesDepartment = log.department_id === departmentFilter;
      }
    }

    const logDate = dateOnlyRiyadh(log.created_at);
    const matchesFrom = !dateFrom || logDate >= dateFrom;
    const matchesTo = !dateTo || logDate <= dateTo;

    return (
      matchesSearch &&
      matchesAction &&
      matchesTable &&
      matchesUser &&
      matchesDepartment &&
      matchesFrom &&
      matchesTo
    );
  });

  const actionTone = (action: string) =>
    action === 'add'
      ? 'ready'
      : action === 'delete'
        ? 'fault'
        : 'watch';

  function resetFilters() {
    setSearch('');
    setActionFilter('all');
    setTableFilter('all');
    setDepartmentFilter('all');
    setUserFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          سجل التحديثات
        </h1>
        <p className="text-sm text-gray-500">
          سجل تلقائي للإضافات والتعديلات والحذف والتغييرات المنفذة في النظام
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالمستخدم، القسم، العنصر، أو نوع التحديث..."
              className="input-field pe-9"
            />
          </div>

          {IS_MANAGEMENT_SITE && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="input-field lg:w-48"
            >
              <option value="all">جميع الأقسام</option>

              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}

              <option value="unassigned">عام / غير محدد</option>
            </select>
          )}

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="input-field lg:w-52"
          >
            <option value="all">جميع المستخدمين</option>

            {userOptions.map((userName) => (
              <option key={userName} value={userName}>
                {userName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">جميع الإجراءات</option>

            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">جميع الأنواع</option>

            {Object.entries(TABLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              من تاريخ
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              إلى تاريخ
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="btn-secondary w-full"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة تعيين
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400">
          المعروض: {filtered.length} من {logs.length} سجل
          {IS_MANAGEMENT_SITE && departmentFilter === 'all'
            ? ' — السجلات العامة/غير المحددة مخفية افتراضيًا'
            : ''}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            لا توجد سجلات مطابقة للفلاتر الحالية
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">المستخدم</th>
                {IS_MANAGEMENT_SITE && (
                  <th className="px-4 py-3">القسم</th>
                )}
                <th className="px-4 py-3">الإجراء</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">العنصر</th>
                <th className="px-4 py-3">التاريخ والوقت</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    onClick={() =>
                      setExpandedId(
                        expandedId === log.id ? null : log.id
                      )
                    }
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {log.user_name ?? 'نظام'}
                    </td>

                    {IS_MANAGEMENT_SITE && (
                      <td className="px-4 py-3 text-gray-600">
                        {log.department_id
                          ? departmentNameById.get(log.department_id) ??
                            'قسم غير معروف'
                          : 'عام / غير محدد'}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <StatusBadge
                        label={ACTION_LABELS[log.action] ?? log.action}
                        tone={actionTone(log.action)}
                      />
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {TABLE_LABELS[log.table_name] ?? log.table_name}
                    </td>

                    <td
                      className="px-4 py-3 font-medium text-gray-700"
                      dir="ltr"
                    >
                      {recordLabel(log)}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {formatDateTime(log.created_at)}
                    </td>

                    <td className="px-4 py-3 text-gray-400">
                      {expandedId === log.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </td>
                  </tr>

                  {expandedId === log.id && (
                    <tr className="bg-gray-50">
                      <td
                        colSpan={IS_MANAGEMENT_SITE ? 7 : 6}
                        className="px-4 py-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {log.old_value && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">
                                القيمة القديمة
                              </p>
                              <pre
                                className="max-h-56 overflow-auto rounded-lg bg-white p-3 text-[11px] text-gray-600"
                                dir="ltr"
                              >
                                {JSON.stringify(log.old_value, null, 2)}
                              </pre>
                            </div>
                          )}

                          {log.new_value && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">
                                القيمة الجديدة
                              </p>
                              <pre
                                className="max-h-56 overflow-auto rounded-lg bg-white p-3 text-[11px] text-gray-600"
                                dir="ltr"
                              >
                                {JSON.stringify(log.new_value, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
