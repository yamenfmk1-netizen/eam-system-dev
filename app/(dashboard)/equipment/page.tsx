'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';

import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';

import EquipmentForm from '@/components/equipment/EquipmentForm';
import StatusBadge from '@/components/ui/StatusBadge';

import {
  Plus,
  Search,
  Loader2,
  MapPin,
} from 'lucide-react';

import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from '@/types/database.types';

import type {
  Building,
  Equipment,
} from '@/types/database.types';

type EquipmentRow = Equipment & {
  buildings: {
    name: string;
    building_number: string;
    station: string;
  } | null;
};

type EquipmentTypeOption = {
  id: string;
  department_id: string;
  code: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

export default function EquipmentPage() {
  const supabase = createClient();

  const [equipment, setEquipment] =
    useState<EquipmentRow[]>([]);

  const [buildings, setBuildings] =
    useState<Building[]>([]);

  const [equipmentTypes, setEquipmentTypes] =
    useState<EquipmentTypeOption[]>([]);

  const [departments, setDepartments] =
    useState<DepartmentOption[]>([]);

  const [departmentFilter, setDepartmentFilter] =
    useState('all');

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState('');

  const [typeFilter, setTypeFilter] =
    useState<string>('all');

  const [stationFilter, setStationFilter] =
    useState('all');

  const [buildingFilter, setBuildingFilter] =
    useState('all');

  const [showForm, setShowForm] =
    useState(false);

  // =========================================================
  // تحميل البيانات
  // =========================================================

  async function loadData() {
    setLoading(true);

    try {
      let targetDepartmentIds: string[] = [];

      // =====================================================
      // موقع الإدارة
      // =====================================================

      if (IS_MANAGEMENT_SITE) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setEquipment([]);
          setBuildings([]);
          setEquipmentTypes([]);
          setDepartments([]);
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

          setEquipment([]);
          setBuildings([]);
          setEquipmentTypes([]);
          setDepartments([]);
          return;
        }

        const departmentIds = Array.from(
          new Set(
            (userDepartments ?? [])
              .map((item) => item.department_id)
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          )
        );

        if (
          departmentIds.length === 0
        ) {
          setEquipment([]);
          setBuildings([]);
          setEquipmentTypes([]);
          setDepartments([]);
          return;
        }

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

          setEquipment([]);
          setBuildings([]);
          setEquipmentTypes([]);
          setDepartments([]);
          return;
        }

        const departmentList =
          (allowedDepartments ??
            []) as DepartmentOption[];

        setDepartments(
          departmentList
        );

        targetDepartmentIds =
          departmentList.map(
            (department) =>
              department.id
          );
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
          .eq(
            'code',
            DEPARTMENT_CODE
          )
          .single();

        if (
          departmentError ||
          !department
        ) {
          console.error(
            'Department not found:',
            DEPARTMENT_CODE,
            departmentError
          );

          setEquipment([]);
          setBuildings([]);
          setEquipmentTypes([]);
          return;
        }

        targetDepartmentIds = [
          department.id,
        ];
      }

      if (
        targetDepartmentIds.length === 0
      ) {
        setEquipment([]);
        setBuildings([]);
        setEquipmentTypes([]);
        return;
      }

      // =====================================================
      // المعدات + المباني + أنواع المعدات
      // =====================================================

      const [
        {
          data: eq,
          error: equipmentError,
        },
        {
          data: b,
          error: buildingsError,
        },
        {
          data: types,
          error: typesError,
        },
      ] = await Promise.all([
        supabase
          .from('equipment')
          .select(
            '*, buildings(name, building_number, station)'
          )
          .in(
            'department_id',
            targetDepartmentIds
          )
          .is('deleted_at', null)
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('buildings')
          .select('*')
          .is('deleted_at', null)
          .order('building_number'),

        supabase
          .from('equipment_types')
          .select(
            'id, department_id, code, name'
          )
          .in(
            'department_id',
            targetDepartmentIds
          )
          .eq('is_active', true)
          .order('name'),
      ]);

      if (equipmentError) {
        console.error(
          'Error loading equipment:',
          equipmentError
        );
      }

      if (buildingsError) {
        console.error(
          'Error loading buildings:',
          buildingsError
        );
      }

      if (typesError) {
        console.error(
          'Error loading equipment types:',
          typesError
        );
      }

      setEquipment(
        (eq ?? []) as EquipmentRow[]
      );

      setBuildings(
        (b ?? []) as Building[]
      );

      setEquipmentTypes(
        (types ??
          []) as EquipmentTypeOption[]
      );
    } catch (error) {
      console.error(
        'Unexpected equipment page error:',
        error
      );

      setEquipment([]);
      setBuildings([]);
      setEquipmentTypes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // المعدات حسب الإدارة المختارة
  // =========================================================

  const departmentScopedEquipment =
    useMemo(
      () =>
        equipment.filter(
          (item: any) =>
            !IS_MANAGEMENT_SITE ||
            departmentFilter === 'all' ||
            item.department_id ===
              departmentFilter
        ),
      [
        equipment,
        departmentFilter,
      ]
    );

  // =========================================================
  // أنواع المعدات حسب الإدارة المختارة
  //
  // مع إزالة التكرار حسب code
  // =========================================================

  const visibleEquipmentTypes =
    useMemo(() => {
      const scoped =
        equipmentTypes.filter(
          (item) =>
            !IS_MANAGEMENT_SITE ||
            departmentFilter === 'all' ||
            item.department_id ===
              departmentFilter
        );

      const unique =
        new Map<
          string,
          EquipmentTypeOption
        >();

      scoped.forEach((item) => {
        if (
          !unique.has(item.code)
        ) {
          unique.set(
            item.code,
            item
          );
        }
      });

      return Array.from(
        unique.values()
      ).sort((a, b) =>
        a.name.localeCompare(
          b.name,
          'ar'
        )
      );
    }, [
      equipmentTypes,
      departmentFilter,
    ]);

  // =========================================================
  // المباني التي تحتوي معدات ضمن الإدارة المختارة
  // =========================================================

  const buildingIdsWithEquipment =
    useMemo(
      () =>
        new Set(
          departmentScopedEquipment
            .map(
              (item) =>
                item.building_id
            )
            .filter(Boolean)
        ),
      [
        departmentScopedEquipment,
      ]
    );

  const scopedBuildings =
    useMemo(
      () =>
        buildings.filter(
          (building) =>
            buildingIdsWithEquipment.has(
              building.id
            )
        ),
      [
        buildings,
        buildingIdsWithEquipment,
      ]
    );

  // =========================================================
  // المحطات
  // =========================================================

  const stations = Array.from(
    new Set(
      scopedBuildings
        .map(
          (building) =>
            building.station
        )
        .filter(
          (station): station is string =>
            Boolean(station)
        )
    )
  ).sort((a, b) =>
    a.localeCompare(b, 'ar')
  );

  // =========================================================
  // المباني الظاهرة حسب المحطة
  // =========================================================

  const visibleBuildings =
    stationFilter === 'all'
      ? scopedBuildings
      : scopedBuildings.filter(
          (building) =>
            building.station ===
            stationFilter
        );

  // =========================================================
  // الفلاتر
  // =========================================================

  const filtered =
    departmentScopedEquipment.filter(
      (item) => {
        const q =
          search
            .trim()
            .toLowerCase();

        const matchesSearch =
          item.asset_id
            .toLowerCase()
            .includes(q) ||
          item.name
            .toLowerCase()
            .includes(q) ||
          (
            item.manufacturer ?? ''
          )
            .toLowerCase()
            .includes(q) ||
          (
            item.serial_number ?? ''
          )
            .toLowerCase()
            .includes(q) ||
          (
            item.buildings
              ?.station ?? ''
          )
            .toLowerCase()
            .includes(q);

        const matchesType =
          typeFilter === 'all' ||
          item.type ===
            typeFilter;

        const matchesStation =
          stationFilter === 'all' ||
          item.buildings?.station ===
            stationFilter;

        const matchesBuilding =
          buildingFilter === 'all' ||
          item.building_id ===
            buildingFilter;

        return (
          matchesSearch &&
          matchesType &&
          matchesStation &&
          matchesBuilding
        );
      }
    );

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
            المعدات
          </h1>

          <p className="text-sm text-gray-500">
            جميع الأصول والمعدات عبر المباني
          </p>
        </div>

        <button
          onClick={() =>
            setShowForm(true)
          }
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          إضافة معدة
        </button>
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
              setSearch(
                e.target.value
              )
            }
            placeholder="ابحث برقم الأصل، الاسم، الشركة المصنعة، الرقم التسلسلي..."
            className="input-field pe-9"
          />
        </div>

        {/* Department Filter - Management only */}

        {IS_MANAGEMENT_SITE && (
          <select
            value={
              departmentFilter
            }
            onChange={(e) => {
              setDepartmentFilter(
                e.target.value
              );

              setTypeFilter('all');
              setStationFilter('all');
              setBuildingFilter('all');
            }}
            className="input-field sm:w-48"
          >
            <option value="all">
              جميع الإدارات
            </option>

            {departments.map(
              (department) => (
                <option
                  key={
                    department.id
                  }
                  value={
                    department.id
                  }
                >
                  {department.name}
                </option>
              )
            )}
          </select>
        )}

        {/* Equipment Type */}

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(
              e.target.value
            )
          }
          className="input-field sm:w-48"
        >
          <option value="all">
            جميع الأنواع
          </option>

          {visibleEquipmentTypes.map(
            (item) => (
              <option
                key={`${item.department_id}-${item.id}`}
                value={item.code}
              >
                {item.name}
              </option>
            )
          )}
        </select>

        {/* Station */}

        <div className="relative sm:w-52">
          <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <select
            value={stationFilter}
            onChange={(e) => {
              setStationFilter(
                e.target.value
              );

              setBuildingFilter(
                'all'
              );
            }}
            className="input-field pe-9"
          >
            <option value="all">
              جميع المحطات / المواقع
            </option>

            {stations.map(
              (station) => (
                <option
                  key={station}
                  value={station}
                >
                  {station}
                </option>
              )
            )}
          </select>
        </div>

        {/* Building */}

        <select
          value={buildingFilter}
          onChange={(e) =>
            setBuildingFilter(
              e.target.value
            )
          }
          className="input-field sm:w-48"
        >
          <option value="all">
            جميع المباني
          </option>

          {visibleBuildings.map(
            (building) => (
              <option
                key={
                  building.id
                }
                value={
                  building.id
                }
              >
                {building.name}
              </option>
            )
          )}
        </select>
      </div>

      {/* =====================================================
          Equipment Table
          ===================================================== */}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            لا توجد معدات مطابقة
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">
                  رقم الأصل
                </th>

                <th className="px-4 py-3">
                  الاسم
                </th>

                <th className="px-4 py-3">
                  النوع
                </th>

                <th className="px-4 py-3">
                  المحطة / الموقع
                </th>

                <th className="px-4 py-3">
                  المبنى
                </th>

                <th className="px-4 py-3">
                  الشركة المصنعة
                </th>

                <th className="px-4 py-3">
                  الحالة
                </th>

                <th className="px-4 py-3">
                  الأهمية
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(
                (item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/equipment/${item.id}`}
                        className="font-medium text-primary-600 hover:underline"
                      >
                        {item.asset_id}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      {item.name}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {visibleEquipmentTypes.find(
                        (type) =>
                          type.code ===
                          item.type
                      )?.name ??
                        EQUIPMENT_TYPE_LABELS[
                          item.type
                        ] ??
                        item.type}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {item.buildings
                        ?.station ??
                        '—'}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {item.buildings
                        ?.name ??
                        '—'}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {item.manufacturer ??
                        '—'}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        label={
                          EQUIPMENT_STATUS_LABELS[
                            item.status
                          ] ??
                          item.status
                        }
                        tone={
                          item.status ===
                          'fault'
                            ? 'fault'
                            : item.status ===
                                'under_maintenance'
                              ? 'watch'
                              : 'ready'
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        label={
                          item.criticality ===
                          'critical'
                            ? 'حرجة'
                            : item.criticality ===
                                'high'
                              ? 'عالية'
                              : item.criticality ===
                                  'medium'
                                ? 'متوسطة'
                                : 'منخفضة'
                        }
                        tone={
                          item.criticality ===
                          'critical'
                            ? 'fault'
                            : item.criticality ===
                                'high'
                              ? 'watch'
                              : 'info'
                        }
                      />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* =====================================================
          Add Equipment
          ===================================================== */}

      {showForm && (
        <EquipmentForm
          buildings={
            scopedBuildings
          }
          onClose={() =>
            setShowForm(false)
          }
          onSaved={loadData}
        />
      )}
    </div>
  );
}
