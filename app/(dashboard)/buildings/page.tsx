'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';

import BuildingCard from '@/components/buildings/BuildingCard';
import BuildingForm from '@/components/buildings/BuildingForm';

import {
  Plus,
  Search,
  Loader2,
  MapPin,
  ShieldAlert,
} from 'lucide-react';

import type {
  Building,
  BuildingStatus,
  BuildingCriticality,
} from '@/types/database.types';

export default function BuildingsPage() {
  const supabase = createClient();

  const [buildings, setBuildings] =
    useState<Building[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState<BuildingStatus | 'all'>('all');

  const [stationFilter, setStationFilter] =
    useState('all');

  const [
    criticalityFilter,
    setCriticalityFilter,
  ] = useState<
    BuildingCriticality | 'all'
  >('all');

  const [showForm, setShowForm] =
    useState(false);

  // =========================================================
  // تحميل المباني
  // =========================================================

  async function loadBuildings() {
    setLoading(true);

    try {
      let targetDepartmentIds: string[] = [];

      // =====================================================
      // موقع الإدارة
      //
      // نأخذ جميع الإدارات المسموح للمستخدم بها.
      // لا يوجد فلتر إدارة في صفحة المباني.
      // =====================================================

      if (IS_MANAGEMENT_SITE) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setBuildings([]);
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

          setBuildings([]);
          return;
        }

        targetDepartmentIds = Array.from(
          new Set(
            (userDepartments ?? [])
              .map(
                (item) =>
                  item.department_id
              )
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          )
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

          setBuildings([]);
          return;
        }

        targetDepartmentIds = [
          department.id,
        ];
      }

      // =====================================================
      // لا توجد إدارات مسموحة
      // =====================================================

      if (
        targetDepartmentIds.length === 0
      ) {
        setBuildings([]);
        return;
      }

      // =====================================================
      // جلب جميع الأصول للإدارات المستهدفة
      //
      // في موقع الإدارة:
      // Electrical + HVAC + أي إدارة أخرى مسموحة
      //
      // في موقع القسم:
      // أصول القسم الحالي فقط
      // =====================================================

      const {
        data: departmentEquipment,
        error: equipmentError,
      } = await supabase
        .from('equipment')
        .select(
          'id,building_id,department_id'
        )
        .in(
          'department_id',
          targetDepartmentIds
        )
        .is('deleted_at', null)
        .not(
          'building_id',
          'is',
          null
        );

      if (equipmentError) {
        console.error(
          'Error loading department equipment:',
          equipmentError
        );

        setBuildings([]);
        return;
      }

      // =====================================================
      // حساب عدد المعدات داخل كل مبنى
      //
      // في موقع الإدارة:
      // العدد = مجموع المعدات من جميع الإدارات المسموحة
      //
      // مثال:
      // مبنى 5
      // Electrical = 2
      // HVAC = 3
      // equipment_count = 5
      // =====================================================

      const equipmentCountByBuilding =
        new Map<string, number>();

      (
        departmentEquipment ?? []
      ).forEach((item) => {
        if (!item.building_id) {
          return;
        }

        equipmentCountByBuilding.set(
          item.building_id,
          (
            equipmentCountByBuilding.get(
              item.building_id
            ) ?? 0
          ) + 1
        );
      });

      // =====================================================
      // استخراج المباني التي تحتوي على أصول
      // =====================================================

      const buildingIds = Array.from(
        equipmentCountByBuilding.keys()
      );

      if (
        buildingIds.length === 0
      ) {
        setBuildings([]);
        return;
      }

      // =====================================================
      // جلب بيانات المباني
      // =====================================================

      const {
        data,
        error: buildingsError,
      } = await supabase
        .from('buildings')
        .select('*')
        .in('id', buildingIds)
        .is('deleted_at', null)
        .order('building_number');

      if (buildingsError) {
        console.error(
          'Error loading buildings:',
          buildingsError
        );

        setBuildings([]);
        return;
      }

      // =====================================================
      // إضافة عدد المعدات لكل مبنى
      // =====================================================

      const mapped = (
        data ?? []
      ).map((building: any) => ({
        ...building,

        equipment_count:
          equipmentCountByBuilding.get(
            building.id
          ) ?? 0,
      }));

      setBuildings(mapped);
    } catch (error) {
      console.error(
        'Unexpected buildings error:',
        error
      );

      setBuildings([]);
    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // تحميل مرة واحدة
  // =========================================================

  useEffect(() => {
    loadBuildings();
  }, []);

  // =========================================================
  // المحطات / المواقع الموجودة ضمن المباني الحالية
  // =========================================================

  const stations = Array.from(
    new Set(
      buildings
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
  // Filters
  // =========================================================

  const filtered =
    buildings.filter((building) => {
      const q =
        search
          .trim()
          .toLowerCase();

      const matchesSearch =
        building.name
          .toLowerCase()
          .includes(q) ||
        building.building_number
          .toLowerCase()
          .includes(q) ||
        (
          building.station ?? ''
        )
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        statusFilter === 'all' ||
        building.status ===
          statusFilter;

      const matchesStation =
        stationFilter === 'all' ||
        building.station ===
          stationFilter;

      const matchesCriticality =
        criticalityFilter ===
          'all' ||
        building.criticality ===
          criticalityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesStation &&
        matchesCriticality
      );
    });

  // =========================================================
  // ترتيب المباني الحرجة أولاً
  // =========================================================

  const sortedFiltered = [
    ...filtered,
  ].sort((a, b) => {
    if (
      a.criticality ===
        'critical' &&
      b.criticality !==
        'critical'
    ) {
      return -1;
    }

    if (
      a.criticality !==
        'critical' &&
      b.criticality ===
        'critical'
    ) {
      return 1;
    }

    return a.building_number.localeCompare(
      b.building_number,
      'ar',
      {
        numeric: true,
      }
    );
  });

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
            المباني
          </h1>

          <p className="text-sm text-gray-500">
            إدارة المباني والاطلاع على
            حالتها العامة
          </p>
        </div>

        <button
          onClick={() =>
            setShowForm(true)
          }
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          إضافة مبنى
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
            placeholder="ابحث برقم المبنى أو الاسم..."
            className="input-field pe-9"
          />
        </div>

        {/* Station */}

        <div className="relative sm:w-56">
          <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <select
            value={stationFilter}
            onChange={(e) =>
              setStationFilter(
                e.target.value
              )
            }
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

        {/* Criticality */}

        <div className="relative sm:w-44">
          <ShieldAlert className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <select
            value={
              criticalityFilter
            }
            onChange={(e) =>
              setCriticalityFilter(
                e.target.value as
                  | BuildingCriticality
                  | 'all'
              )
            }
            className="input-field pe-9"
          >
            <option value="all">
              كل مستويات الأهمية
            </option>

            <option value="critical">
              حرج
            </option>

            <option value="normal">
              عادي
            </option>
          </select>
        </div>

        {/* Status */}

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as
                | BuildingStatus
                | 'all'
            )
          }
          className="input-field sm:w-56"
        >
          <option value="all">
            جميع الحالات
          </option>

          <option value="ready">
            جاهز
          </option>

          <option value="watch">
            يحتاج متابعة
          </option>

          <option value="fault">
            يوجد عطل
          </option>

          <option value="unknown">
            بيانات غير كافية
          </option>
        </select>
      </div>

      {/* =====================================================
          Buildings
          ===================================================== */}

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sortedFiltered.length ===
        0 ? (
        <div className="card py-16 text-center text-sm text-gray-400">
          لا توجد مبانٍ مطابقة
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedFiltered.map(
            (building) => (
              <BuildingCard
                key={
                  building.id
                }
                building={
                  building
                }
              />
            )
          )}
        </div>
      )}

      {/* =====================================================
          Add Building
          ===================================================== */}

      {showForm && (
        <BuildingForm
          stations={stations}
          onClose={() =>
            setShowForm(false)
          }
          onSaved={
            loadBuildings
          }
        />
      )}
    </div>
  );
}
