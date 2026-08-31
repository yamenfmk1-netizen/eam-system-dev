'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';

import FaultForm from '@/components/faults/FaultForm';
import StatusBadge from '@/components/ui/StatusBadge';

import {
  Plus,
  Search,
  Loader2,
} from 'lucide-react';

import {
  FAULT_STATUS_LABELS,
  FAULT_PRIORITY_LABELS,
} from '@/types/database.types';

import type {
  Building,
  Fault,
} from '@/types/database.types';

export default function FaultsPage() {
  const supabase = createClient();

  const [faults, setFaults] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // فلتر الإدارة - يظهر فقط في موقع الإدارة
  const [departments, setDepartments] = useState<any[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingFault, setEditingFault] =
    useState<Fault | undefined>(undefined);

  const [currentUserRole, setCurrentUserRole] =
    useState<string>('viewer');

  // =========================================================
  // تحميل صلاحية المستخدم
  // =========================================================

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data) {
        setCurrentUserRole(data.role);
      }
    });
  }, []);

  // =========================================================
  // تحميل البيانات
  // =========================================================

  async function loadData() {
    setLoading(true);

    // =======================================================
    // موقع الإدارة:
    // تحميل الإدارات المسموح للمستخدم برؤيتها
    // =======================================================

    if (IS_MANAGEMENT_SITE) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: userDepartments } = await supabase
          .from('user_departments')
          .select('department_id')
          .eq('user_id', user.id);

        const departmentIds = Array.from(
          new Set(
            (userDepartments ?? [])
              .map((item) => item.department_id)
              .filter(Boolean)
          )
        );

        if (departmentIds.length > 0) {
          const { data: allowedDepartments } = await supabase
            .from('departments')
            .select('id,name,code')
            .in('id', departmentIds)
            .order('name');

          setDepartments(allowedDepartments ?? []);
        } else {
          setDepartments([]);
        }
      } else {
        setDepartments([]);
      }
    }

    // =======================================================
    // استعلام الأعطال
    // =======================================================

    let faultsQuery = supabase
      .from('faults')
      .select(
        '*, buildings(name), equipment(name, asset_id)'
      )
      .order('reported_at', {
        ascending: false,
      });

    // =======================================================
    // مواقع الأقسام العادية:
    // Electrical / HVAC / Mechanical / Civil
    //
    // موقع الإدارة لا نضع عليه هذا الفلتر،
    // والـ RLS يحدد الإدارات المسموح بها.
    // =======================================================

    if (!IS_MANAGEMENT_SITE) {
      const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (!department) {
        setFaults([]);
        setBuildings([]);
        setLoading(false);
        return;
      }

      faultsQuery = faultsQuery.eq(
        'department_id',
        department.id
      );
    }

    // =======================================================
    // تحميل الأعطال + المباني
    // =======================================================

    const [
      { data: f },
      { data: b },
    ] = await Promise.all([
      faultsQuery,

      supabase
        .from('buildings')
        .select('*')
        .is('deleted_at', null)
        .order('building_number'),
    ]);

    setFaults(f ?? []);
    setBuildings(b ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // الفلاتر
  // =========================================================

  const filtered = faults.filter((f) => {
    const q = search.toLowerCase();

    const matchesSearch =
      f.fault_number.toLowerCase().includes(q) ||
      (f.buildings?.name ?? '')
        .toLowerCase()
        .includes(q) ||
      (f.equipment?.name ?? '')
        .toLowerCase()
        .includes(q) ||
      f.description.toLowerCase().includes(q);

    const matchesDepartment =
      !IS_MANAGEMENT_SITE ||
      departmentFilter === 'all' ||
      f.department_id === departmentFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      f.status === statusFilter;

    const matchesPriority =
      priorityFilter === 'all' ||
      f.priority === priorityFilter;

    return (
      matchesSearch &&
      matchesDepartment &&
      matchesStatus &&
      matchesPriority
    );
  });

  // =========================================================
  // ألوان الحالات
  // =========================================================

  const statusTone = (s: string) =>
    s === 'closed' || s === 'resolved'
      ? 'ready'
      : s === 'open'
        ? 'fault'
        : 'watch';

  const priorityTone = (p: string) =>
    p === 'critical'
      ? 'fault'
      : p === 'high'
        ? 'watch'
        : 'info';

  // =========================================================
  // فتح / تعديل العطل
  // =========================================================

  function openEdit(fault: Fault) {
    setEditingFault(fault);
    setShowForm(true);
  }

  function openNew() {
    setEditingFault(undefined);
    setShowForm(true);
  }

  // =========================================================
  // الصفحة
  // =========================================================

  return (
    <div className="space-y-5">
      {/* =====================================================
          العنوان
          ===================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            الأعطال
          </h1>

          <p className="text-sm text-gray-500">
            إدارة بلاغات الأعطال ومتابعة حلها
          </p>
        </div>

        <button
          onClick={openNew}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          بلاغ عطل جديد
        </button>
      </div>

      {/* =====================================================
          البحث والفلاتر
          ===================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* البحث */}

        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="ابحث برقم العطل، المبنى، المعدة، الوصف..."
            className="input-field pe-9"
          />
        </div>

        {/* فلتر الإدارة - الإدارة فقط */}

        {IS_MANAGEMENT_SITE && (
          <select
            value={departmentFilter}
            onChange={(e) =>
              setDepartmentFilter(e.target.value)
            }
            className="input-field sm:w-48"
          >
            <option value="all">
              جميع الإدارات
            </option>

            {departments.map((department) => (
              <option
                key={department.id}
                value={department.id}
              >
                {department.name}
              </option>
            ))}
          </select>
        )}

        {/* فلتر الحالة */}

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
          className="input-field sm:w-52"
        >
          <option value="all">
            جميع الحالات
          </option>

          {Object.entries(
            FAULT_STATUS_LABELS
          ).map(([value, label]) => (
            <option
              key={value}
              value={value}
            >
              {label}
            </option>
          ))}
        </select>

        {/* فلتر الأولوية */}

        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value)
          }
          className="input-field sm:w-44"
        >
          <option value="all">
            جميع الأولويات
          </option>

          {Object.entries(
            FAULT_PRIORITY_LABELS
          ).map(([value, label]) => (
            <option
              key={value}
              value={value}
            >
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* =====================================================
          جدول الأعطال
          ===================================================== */}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            لا توجد أعطال مطابقة
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">
                  رقم العطل
                </th>

                <th className="px-4 py-3">
                  المبنى
                </th>

                <th className="px-4 py-3">
                  المعدة
                </th>

                <th className="px-4 py-3">
                  الوصف
                </th>

                <th className="px-4 py-3">
                  الأولوية
                </th>

                <th className="px-4 py-3">
                  الحالة
                </th>

                <th className="px-4 py-3">
                  تاريخ البلاغ
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => openEdit(f)}
                  className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                >
                  <td
                    className="px-4 py-3 font-medium text-gray-800"
                    dir="ltr"
                  >
                    {f.fault_number}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {f.buildings?.name}
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {f.equipment?.name ?? '—'}
                  </td>

                  <td className="max-w-[220px] truncate px-4 py-3 text-gray-600">
                    {f.description}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        FAULT_PRIORITY_LABELS[
                          f.priority as keyof typeof FAULT_PRIORITY_LABELS
                        ]
                      }
                      tone={priorityTone(
                        f.priority
                      )}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        FAULT_STATUS_LABELS[
                          f.status as keyof typeof FAULT_STATUS_LABELS
                        ]
                      }
                      tone={statusTone(
                        f.status
                      )}
                    />
                  </td>

                  <td className="px-4 py-3 text-gray-500">
                    {new Date(
                      f.reported_at
                    ).toLocaleDateString(
                      'ar-SA'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* =====================================================
          نموذج العطل
          ===================================================== */}

      {showForm && (
        <FaultForm
          fault={editingFault}
          buildings={buildings}
          currentUserRole={currentUserRole}
          onClose={() =>
            setShowForm(false)
          }
          onSaved={loadData}
        />
      )}
    </div>
  );
}
