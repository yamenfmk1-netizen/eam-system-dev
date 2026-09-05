'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import ScheduleForm from '@/components/maintenance/ScheduleForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  CalendarClock,
  Repeat,
} from 'lucide-react';
import type {
  Building,
  MaintenanceRecord,
  MaintenanceSchedule,
} from '@/types/database.types';
import { useLanguage } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import toast from 'react-hot-toast';

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

const FREQ_KEYS: Record<string, TranslationKey> = {
  days: 'schedule.days',
  weekly: 'schedule.weekly',
  monthly: 'schedule.monthly',
  quarterly: 'schedule.quarterly',
  semiannual: 'schedule.semiannual',
  yearly: 'schedule.yearly',
};

export default function MaintenancePage() {
  const supabase = createClient();
  const { t, lang, formatDate } = useLanguage();

  const [tab, setTab] = useState<'records' | 'schedules'>('records');
  const [records, setRecords] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] =
    useState<MaintenanceRecord | undefined>(undefined);
  const [deleteRecord, setDeleteRecord] = useState<any | null>(null);

  const [showSchedule, setShowSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<MaintenanceSchedule | undefined>(undefined);
  const [deleteSchedule, setDeleteSchedule] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadData() {
    setLoading(true);

    let recordsQuery = supabase
      .from('maintenance_records')
      .select('*, buildings(name), equipment(name, asset_id)')
      .order('maintenance_date', { ascending: false });

    let schedulesQuery = supabase
      .from('maintenance_schedules')
      .select('*, buildings(name), equipment(name, asset_id)')
      .order('next_due_date');

    if (IS_MANAGEMENT_SITE) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setRecords([]);
        setSchedules([]);
        setBuildings([]);
        setDepartments([]);
        setLoading(false);
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

        setRecords([]);
        setSchedules([]);
        setBuildings([]);
        setDepartments([]);
        setLoading(false);
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
      const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (!department) {
        setRecords([]);
        setSchedules([]);
        setBuildings([]);
        setLoading(false);
        return;
      }

      recordsQuery = recordsQuery.eq(
        'department_id',
        department.id
      );

      schedulesQuery = schedulesQuery.eq(
        'department_id',
        department.id
      );
    }

    const [{ data: m }, { data: s }, { data: b }] =
      await Promise.all([
        recordsQuery,
        schedulesQuery,
        supabase
          .from('buildings')
          .select('*')
          .is('deleted_at', null)
          .order('building_number'),
      ]);

    setRecords(m ?? []);
    setSchedules(s ?? []);
    setBuildings((b ?? []) as Building[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();

    const matchesSearch =
      r.maintenance_number.toLowerCase().includes(q) ||
      (r.buildings?.name ?? '').toLowerCase().includes(q) ||
      (r.equipment?.name ?? '').toLowerCase().includes(q);

    const matchesCategory =
      categoryFilter === 'all' ||
      r.category === categoryFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      r.status === statusFilter;

    const matchesDepartment =
      !IS_MANAGEMENT_SITE ||
      departmentFilter === 'all' ||
      r.department_id === departmentFilter;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesStatus &&
      matchesDepartment
    );
  });

  const filteredSchedules = schedules.filter((s) => {
    return (
      !IS_MANAGEMENT_SITE ||
      departmentFilter === 'all' ||
      s.department_id === departmentFilter
    );
  });

  async function handleDeleteRecord() {
    if (!deleteRecord) return;

    setBusy(true);

    const { error } = await supabase
      .from('maintenance_records')
      .delete()
      .eq('id', deleteRecord.id);

    setBusy(false);
    setDeleteRecord(null);

    if (error) {
      toast.error(
        `${t('maintenance.deleteFailed')}: ${error.message}`
      );
      return;
    }

    toast.success(t('maintenance.deleted'));
    loadData();
  }

  async function handleDeleteSchedule() {
    if (!deleteSchedule) return;

    setBusy(true);

    const { error } = await supabase
      .from('maintenance_schedules')
      .delete()
      .eq('id', deleteSchedule.id);

    setBusy(false);
    setDeleteSchedule(null);

    if (error) {
      toast.error(
        `${t('maintenance.deleteFailed')}: ${error.message}`
      );
      return;
    }

    toast.success(t('maintenance.deleted'));
    loadData();
  }

  // يستدعي الدالة نفسها التي يشغّلها pg_cron يوميًا،
  // فلا يوجد منطق توليد مكرر في الواجهة.
  async function generateDue() {
    setGenerating(true);

    const { data, error } = await supabase.rpc(
      'generate_due_maintenance'
    );

    setGenerating(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const count = Number(data ?? 0);

    toast.success(
      count > 0
        ? `${count} ${t('schedule.generated')}`
        : t('schedule.generatedNone')
    );

    loadData();
  }

  async function toggleActive(schedule: any) {
    const { error } = await supabase
      .from('maintenance_schedules')
      .update({ is_active: !schedule.is_active })
      .eq('id', schedule.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    loadData();
  }

  function maintenanceStatusLabel(status: string) {
    if (lang === 'ar') {
      switch (status) {
        case 'pending':
          return 'قيد الانتظار';
        case 'in_progress':
          return 'جاري التنفيذ';
        case 'completed':
          return 'مكتملة';
        case 'cancelled':
          return 'ملغاة';
        default:
          return status;
      }
    }

    switch (status) {
      case 'pending':
        return 'Pending';
      case 'in_progress':
        return 'In progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  function maintenanceStatusClass(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700';
      case 'in_progress':
        return 'bg-blue-50 text-blue-700';
      case 'pending':
        return 'bg-amber-50 text-amber-700';
      case 'cancelled':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('maintenance.title')}
          </h1>

          <p className="text-sm text-gray-500">
            {tab === 'records'
              ? t('maintenance.subtitle')
              : t('schedule.subtitle')}
          </p>
        </div>

        <div className="flex gap-2">
          {tab === 'schedules' && (
            <button
              onClick={generateDue}
              disabled={generating}
              className="btn-secondary"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}

              {t('schedule.generateNow')}
            </button>
          )}

          <button
            onClick={() => {
              if (tab === 'records') {
                setEditingRecord(undefined);
                setShowForm(true);
              } else {
                setEditingSchedule(undefined);
                setShowSchedule(true);
              }
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            {tab === 'records'
              ? t('maintenance.add')
              : t('schedule.add')}
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => setTab('records')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'records'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          {t('maintenance.tabRecords')}
        </button>

        <button
          onClick={() => setTab('schedules')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'schedules'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Repeat className="h-4 w-4" />
          {t('maintenance.tabSchedules')}

          {filteredSchedules.length > 0 && (
            <span className="rounded-full bg-gray-200 px-2 text-xs text-gray-600">
              {filteredSchedules.length}
            </span>
          )}
        </button>
      </div>

      {IS_MANAGEMENT_SITE && (
        <div className="flex justify-end">
          <select
            value={departmentFilter}
            onChange={(e) =>
              setDepartmentFilter(e.target.value)
            }
            className="input-field sm:w-56"
          >
            <option value="all">جميع الإدارات</option>

            {departments.map((department) => (
              <option
                key={department.id}
                value={department.id}
              >
                {department.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === 'records' ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  'maintenance.searchPlaceholder'
                )}
                className="input-field pe-9"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value)
              }
              className="input-field lg:w-48"
            >
              <option value="all">
                {t('maintenance.allCategories')}
              </option>
              <option value="preventive">
                {t('maintenance.preventive')}
              </option>
              <option value="corrective">
                {t('maintenance.corrective')}
              </option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
              className="input-field lg:w-48"
            >
              <option value="all">
                {lang === 'ar'
                  ? 'جميع الحالات'
                  : 'All statuses'}
              </option>
              <option value="pending">
                {lang === 'ar'
                  ? 'قيد الانتظار'
                  : 'Pending'}
              </option>
              <option value="in_progress">
                {lang === 'ar'
                  ? 'جاري التنفيذ'
                  : 'In progress'}
              </option>
              <option value="completed">
                {lang === 'ar'
                  ? 'مكتملة'
                  : 'Completed'}
              </option>
              <option value="cancelled">
                {lang === 'ar'
                  ? 'ملغاة'
                  : 'Cancelled'}
              </option>
            </select>
          </div>

          <div className="card overflow-x-auto p-0">
            {loading ? (
              <div className="flex justify-center py-16 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">
                {t('maintenance.empty')}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-start">
                      {t('maintenance.number')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('common.building')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('common.equipment')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('maintenance.type')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {lang === 'ar'
                        ? 'الحالة'
                        : 'Status'}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('common.date')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('maintenance.technician')}
                    </th>
                    <th className="px-4 py-3 text-start">
                      {t('maintenance.next')}
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td
                        className="px-4 py-3 font-medium text-gray-800"
                        dir="ltr"
                      >
                        <div className="flex items-center gap-2">
                          <span>
                            {r.maintenance_number}
                          </span>

                          {r.schedule_id && (
                            <span
                              title={t(
                                'maintenance.autoGenerated'
                              )}
                              className="text-primary-500"
                            >
                              <Repeat className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {r.buildings?.name}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {r.equipment?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          label={
                            r.category === 'preventive'
                              ? t(
                                  'maintenance.preventive'
                                )
                              : t(
                                  'maintenance.corrective'
                                )
                          }
                          tone={
                            r.category === 'preventive'
                              ? 'ready'
                              : 'watch'
                          }
                        />
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${maintenanceStatusClass(
                            r.status
                          )}`}
                        >
                          {maintenanceStatusLabel(
                            r.status
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(
                          r.maintenance_date
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {r.technician_name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(
                          r.next_maintenance_date
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingRecord(
                                r as MaintenanceRecord
                              );
                              setShowForm(true);
                            }}
                            title={t('common.edit')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() =>
                              setDeleteRecord(r)
                            }
                            title={t('common.delete')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <div className="card overflow-x-auto p-0">
          {loading ? (
            <div className="flex justify-center py-16 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {t('schedule.empty')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-3 text-start">
                    {t('schedule.name')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('common.building')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('common.equipment')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('schedule.frequency')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('schedule.nextDue')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('schedule.lastGenerated')}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t('common.status')}
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>

              <tbody>
                {filteredSchedules.map((s) => {
                  const overdue =
                    s.is_active &&
                    s.next_due_date <= today;

                  return (
                    <tr
                      key={s.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {s.title}
                        <span
                          className="block text-xs text-gray-400"
                          dir="ltr"
                        >
                          {s.number_prefix}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {s.buildings?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {s.equipment?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {s.frequency === 'days' ? (
                          `${t('schedule.every')} ${
                            s.interval_count
                          } ${t('schedule.dayUnit')}`
                        ) : (
                          <>
                            {s.interval_count > 1
                              ? `${t(
                                  'schedule.every'
                                )} ${
                                  s.interval_count
                                } × `
                              : ''}
                            {t(
                              FREQ_KEYS[
                                s.frequency
                              ] ??
                                'schedule.monthly'
                            )}
                          </>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            overdue
                              ? 'font-medium text-red-600'
                              : 'text-gray-500'
                          }
                        >
                          {formatDate(
                            s.next_due_date
                          )}
                        </span>

                        {overdue && (
                          <span className="block text-xs text-red-500">
                            {t(
                              'schedule.overdue'
                            )}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(
                          s.last_generated_date
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            toggleActive(s)
                          }
                        >
                          <StatusBadge
                            label={
                              s.is_active
                                ? t('common.active')
                                : t(
                                    'common.inactive'
                                  )
                            }
                            tone={
                              s.is_active
                                ? 'ready'
                                : 'unknown'
                            }
                          />
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingSchedule(
                                s as MaintenanceSchedule
                              );
                              setShowSchedule(true);
                            }}
                            title={t('common.edit')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() =>
                              setDeleteSchedule(s)
                            }
                            title={t('common.delete')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <MaintenanceForm
          record={editingRecord}
          buildings={buildings}
          onClose={() => {
            setShowForm(false);
            setEditingRecord(undefined);
          }}
          onSaved={loadData}
        />
      )}

      {showSchedule && (
        <ScheduleForm
          schedule={editingSchedule}
          buildings={buildings}
          onClose={() => {
            setShowSchedule(false);
            setEditingSchedule(undefined);
          }}
          onSaved={loadData}
        />
      )}

      <ConfirmDialog
        open={!!deleteRecord}
        title={t('maintenance.deleteTitle')}
        message={`${t(
          'maintenance.deleteMessage'
        )} "${deleteRecord?.maintenance_number}"?`}
        onConfirm={handleDeleteRecord}
        onCancel={() => setDeleteRecord(null)}
        loading={busy}
      />

      <ConfirmDialog
        open={!!deleteSchedule}
        title={t('schedule.deleteTitle')}
        message={`${deleteSchedule?.title ?? ''} — ${t(
          'schedule.deleteMessage'
        )}`}
        onConfirm={handleDeleteSchedule}
        onCancel={() => setDeleteSchedule(null)}
        loading={busy}
      />
    </div>
  );
}
