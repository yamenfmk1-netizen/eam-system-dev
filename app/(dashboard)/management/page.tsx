import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  Building2,
  ChevronLeft,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const READY_STATUSES = ['available', 'running', 'standby'];

const OPEN_FAULT_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_spare_parts',
];

type Department = {
  id: string;
  name: string;
  code: string;
};

type DetailView =
  | 'affected'
  | 'faults'
  | 'maintenance';

type ManagementPageProps = {
  searchParams?: {
    department?: string;
    view?: string;
  };
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'حرج',
  high: 'عالي',
  medium: 'متوسط',
  low: 'منخفض',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'مفتوح',
  assigned: 'تم الإسناد',
  in_progress: 'قيد التنفيذ',
  waiting_for_spare_parts: 'بانتظار قطع الغيار',
};

export default async function ManagementPage({
  searchParams,
}: ManagementPageProps) {
  const supabase = createClient();

  // المستخدم الحالي
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // الأقسام المسموح لهذا المستخدم برؤيتها
  const {
    data: userDepartments,
    error: accessError,
  } = await supabase
    .from('user_departments')
    .select('department_id')
    .eq('user_id', user.id);

  if (accessError) {
    throw new Error(accessError.message);
  }

  const departmentIds = Array.from(
    new Set(
      (userDepartments ?? [])
        .map((item) => item.department_id)
        .filter(Boolean)
    )
  );

  if (departmentIds.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            لوحة الإدارة
          </h1>

          <p className="text-gray-500">
            لا توجد أقسام مرتبطة بهذا الحساب.
          </p>
        </div>
      </div>
    );
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
  }).format(new Date());

  const [
    { data: departments },
    { data: equipment },
    { data: faults },
    { data: schedules },
    { data: maintenanceRecords },
    { data: spareParts },
  ] = await Promise.all([
    // الأقسام
    supabase
      .from('departments')
      .select('id,name,code')
      .in('id', departmentIds)
      .order('name'),

    // الأصول
    supabase
      .from('equipment')
      .select(
        'id,department_id,status,name,asset_id'
      )
      .in('department_id', departmentIds)
      .is('deleted_at', null),

    // الأعطال المفتوحة
    supabase
      .from('faults')
      .select(
        'id,department_id,equipment_id,fault_number,description,priority,status'
      )
      .in('department_id', departmentIds)
      .in('status', OPEN_FAULT_STATUSES),

    // جداول الصيانة الدورية
    supabase
      .from('maintenance_schedules')
      .select(
        'id,department_id,title,equipment_id,next_due_date,is_active'
      )
      .in('department_id', departmentIds)
      .eq('is_active', true),

    // سجلات الصيانة القديمة
    supabase
      .from('maintenance_records')
      .select(
        'id,department_id,equipment_id,maintenance_number,work_description,next_maintenance_date'
      )
      .in('department_id', departmentIds)
      .not('next_maintenance_date', 'is', null),

    // قطع الغيار
    supabase
      .from('spare_parts')
      .select(
        'id,department_id,quantity_available,minimum_stock,warranty_end_date'
      )
      .in('department_id', departmentIds),
  ]);

  const departmentList =
    (departments ?? []) as Department[];

  // خريطة سريعة للوصول إلى بيانات الأصل
  const equipmentMap = new Map(
    (equipment ?? []).map((item) => [
      item.id,
      item,
    ])
  );

  const departmentStats = departmentList.map(
    (department) => {
      const departmentEquipment = (
        equipment ?? []
      ).filter(
        (item) =>
          item.department_id === department.id
      );

      const departmentFaults = (
        faults ?? []
      ).filter(
        (item) =>
          item.department_id === department.id
      );

      const departmentSchedules = (
        schedules ?? []
      ).filter(
        (item) =>
          item.department_id === department.id
      );

      const departmentMaintenance = (
        maintenanceRecords ?? []
      ).filter(
        (item) =>
          item.department_id === department.id
      );

      const departmentParts = (
        spareParts ?? []
      ).filter(
        (item) =>
          item.department_id === department.id
      );

      // إجمالي الأصول
      const totalAssets =
        departmentEquipment.length;

      // الأصول الجاهزة
      const readyAssets =
        departmentEquipment.filter((item) =>
          READY_STATUSES.includes(item.status)
        ).length;

      // نسبة الجاهزية
      const readiness =
        totalAssets > 0
          ? Math.round(
              (readyAssets / totalAssets) * 100
            )
          : null;

      // الأعطال المفتوحة
      const openFaults =
        departmentFaults.length;

      // الأصول المتأثرة
      // كل أصل يحسب مرة واحدة
      const affectedAssets = new Set(
        departmentFaults
          .map((item) => item.equipment_id)
          .filter(Boolean)
      ).size;

      // الأعطال الحرجة
      const criticalFaults =
        departmentFaults.filter(
          (item) =>
            item.priority === 'critical'
        ).length;

      // الصيانة المتأخرة من الجداول
      const overdueSchedules =
        departmentSchedules.filter(
          (item) =>
            item.next_due_date &&
            item.next_due_date < today
        ).length;

      // الصيانة المتأخرة من السجلات القديمة
      const overdueMaintenanceFallback =
        departmentMaintenance.filter(
          (item) =>
            item.next_maintenance_date &&
            item.next_maintenance_date < today
        ).length;

      // إذا توجد جداول صيانة نعتمد عليها
      const overdueMaintenance =
        departmentSchedules.length > 0
          ? overdueSchedules
          : overdueMaintenanceFallback;

      // نقص قطع الغيار
      const lowStockParts =
        departmentParts.filter((item) => {
          const available = Number(
            item.quantity_available ?? 0
          );

          const minimum = Number(
            item.minimum_stock ?? 0
          );

          return available <= minimum;
        }).length;

      // الضمانات المنتهية
      const expiredWarranties =
        departmentParts.filter(
          (item) =>
            item.warranty_end_date &&
            item.warranty_end_date < today
        ).length;

      return {
        ...department,
        totalAssets,
        readyAssets,
        readiness,
        affectedAssets,
        openFaults,
        criticalFaults,
        overdueMaintenance,
        lowStockParts,
        expiredWarranties,
      };
    }
  );

  // ===============================
  // Overall KPIs
  // ===============================

  const totalAssets = departmentStats.reduce(
    (sum, item) =>
      sum + item.totalAssets,
    0
  );

  const totalOpenFaults =
    departmentStats.reduce(
      (sum, item) =>
        sum + item.openFaults,
      0
    );

  const totalCriticalFaults =
    departmentStats.reduce(
      (sum, item) =>
        sum + item.criticalFaults,
      0
    );

  // ===============================
  // التنبيهات الإدارية
  // ===============================

  const managementAlerts =
    departmentStats.flatMap(
      (department) => {
        const alerts: string[] = [];

        if (
          department.criticalFaults > 0
        ) {
          alerts.push(
            `${department.name}: ${department.criticalFaults} أعطال حرجة مفتوحة`
          );
        }

        if (
          department.overdueMaintenance > 0
        ) {
          alerts.push(
            `${department.name}: ${department.overdueMaintenance} أعمال صيانة متأخرة`
          );
        }

        if (
          department.lowStockParts > 0
        ) {
          alerts.push(
            `${department.name}: ${department.lowStockParts} قطع غيار منخفضة المخزون`
          );
        }

        if (
          department.expiredWarranties > 0
        ) {
          alerts.push(
            `${department.name}: ${department.expiredWarranties} ضمانات منتهية`
          );
        }

        return alerts;
      }
    );

  // ===============================
  // تفاصيل البطاقة المختارة
  // ===============================

  const requestedDepartmentId =
    searchParams?.department ?? '';

  const requestedView =
    searchParams?.view ?? '';

  const validViews: DetailView[] = [
    'affected',
    'faults',
    'maintenance',
  ];

  const selectedView =
    validViews.includes(
      requestedView as DetailView
    )
      ? (requestedView as DetailView)
      : null;

  // مهم:
  // لا نسمح بعرض قسم غير موجود ضمن صلاحيات المستخدم
  const selectedDepartment =
    departmentStats.find(
      (department) =>
        department.id ===
        requestedDepartmentId
    ) ?? null;

  const selectedDepartmentFaults =
    selectedDepartment
      ? (faults ?? []).filter(
          (item) =>
            item.department_id ===
            selectedDepartment.id
        )
      : [];

  const selectedDepartmentSchedules =
    selectedDepartment
      ? (schedules ?? []).filter(
          (item) =>
            item.department_id ===
            selectedDepartment.id
        )
      : [];

  const selectedDepartmentMaintenance =
    selectedDepartment
      ? (maintenanceRecords ?? []).filter(
          (item) =>
            item.department_id ===
            selectedDepartment.id
        )
      : [];

  // ===============================
  // تفاصيل الأصول المتأثرة
  // ===============================

  const faultCountByEquipment =
    new Map<string, number>();

  selectedDepartmentFaults.forEach(
    (fault) => {
      if (!fault.equipment_id) {
        return;
      }

      faultCountByEquipment.set(
        fault.equipment_id,
        (faultCountByEquipment.get(
          fault.equipment_id
        ) ?? 0) + 1
      );
    }
  );

  const affectedAssetDetails =
    Array.from(
      faultCountByEquipment.entries()
    )
      .map(
        ([equipmentId, faultCount]) => {
          const asset =
            equipmentMap.get(equipmentId);

          return {
            asset,
            faultCount,
          };
        }
      )
      .filter(
        (item) => item.asset
      );

  // ===============================
  // تفاصيل الصيانة المتأخرة
  // ===============================

  const useSchedules =
    selectedDepartmentSchedules.length > 0;

  const overdueScheduleDetails =
    selectedDepartmentSchedules.filter(
      (item) =>
        item.next_due_date &&
        item.next_due_date < today
    );

  const overdueMaintenanceRecordDetails =
    selectedDepartmentMaintenance.filter(
      (item) =>
        item.next_maintenance_date &&
        item.next_maintenance_date < today
    );

  const detailTitle =
    selectedView === 'affected'
      ? 'الأصول المتأثرة'
      : selectedView === 'faults'
        ? 'الأعطال المفتوحة'
        : selectedView === 'maintenance'
          ? 'الصيانة المتأخرة'
          : '';

  const detailCount =
    selectedView === 'affected'
      ? affectedAssetDetails.length
      : selectedView === 'faults'
        ? selectedDepartmentFaults.length
        : selectedView === 'maintenance'
          ? useSchedules
            ? overdueScheduleDetails.length
            : overdueMaintenanceRecordDetails.length
          : 0;

  return (
    <div
      className="space-y-8"
      dir="rtl"
    >
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          لوحة الإدارة
        </h1>

        <p className="mt-2 text-gray-500">
          نظرة شاملة على أداء وحالة الأقسام
        </p>
      </div>

      {/* Overall KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* الأقسام */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                الأقسام
              </p>

              <p className="mt-2 text-3xl font-bold">
                {departmentStats.length}
              </p>
            </div>

            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        {/* إجمالي الأصول */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                إجمالي الأصول
              </p>

              <p className="mt-2 text-3xl font-bold">
                {totalAssets}
              </p>
            </div>

            <Boxes className="h-8 w-8 text-indigo-600" />
          </div>
        </div>

        {/* الأعطال المفتوحة */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                الأعطال المفتوحة
              </p>

              <p className="mt-2 text-3xl font-bold">
                {totalOpenFaults}
              </p>
            </div>

            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
        </div>

        {/* الأعطال الحرجة */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                الأعطال الحرجة
              </p>

              <p className="mt-2 text-3xl font-bold">
                {totalCriticalFaults}
              </p>
            </div>

            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Departments */}
      <div id="departments">
        <h2 className="mb-4 text-xl font-bold">
          حالة الأقسام
        </h2>

        <div className="grid gap-5 xl:grid-cols-2">
          {departmentStats.map(
            (department) => (
              <div
                key={department.id}
                className="rounded-2xl border bg-white p-6 shadow-sm"
              >
                {/* اسم القسم + الجاهزية */}
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold">
                      {department.name}
                    </h3>

                    <p className="mt-1 text-sm text-gray-400">
                      {department.code}
                    </p>
                  </div>

                  <div className="text-left">
                    <p className="text-sm text-gray-500">
                      الجاهزية
                    </p>

                    <p className="text-3xl font-bold">
                      {department.readiness ===
                      null
                        ? '—'
                        : `${department.readiness}%`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {/* الأصول */}
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">
                      الأصول
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        department.totalAssets
                      }
                    </p>
                  </div>

                  {/* الأصول المتأثرة - قابلة للضغط */}
                  <Link
                    href={`/management?department=${department.id}&view=affected#management-details`}
                    className="group rounded-xl bg-gray-50 p-4 transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-500 group-hover:text-blue-700">
                        الأصول المتأثرة
                      </p>

                      <ChevronLeft className="h-4 w-4 text-gray-300 transition group-hover:text-blue-600" />
                    </div>

                    <p className="mt-1 text-2xl font-bold group-hover:text-blue-700">
                      {
                        department.affectedAssets
                      }
                    </p>
                  </Link>

                  {/* الأعطال المفتوحة - قابلة للضغط */}
                  <Link
                    href={`/management?department=${department.id}&view=faults#management-details`}
                    className="group rounded-xl bg-gray-50 p-4 transition hover:bg-orange-50 hover:ring-1 hover:ring-orange-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-500 group-hover:text-orange-700">
                        الأعطال المفتوحة
                      </p>

                      <ChevronLeft className="h-4 w-4 text-gray-300 transition group-hover:text-orange-600" />
                    </div>

                    <p className="mt-1 text-2xl font-bold group-hover:text-orange-700">
                      {
                        department.openFaults
                      }
                    </p>
                  </Link>

                  {/* الأعطال الحرجة */}
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">
                      الأعطال الحرجة
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        department.criticalFaults
                      }
                    </p>
                  </div>

                  {/* الصيانة المتأخرة - قابلة للضغط */}
                  <Link
                    href={`/management?department=${department.id}&view=maintenance#management-details`}
                    className="group rounded-xl bg-gray-50 p-4 transition hover:bg-amber-50 hover:ring-1 hover:ring-amber-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-500 group-hover:text-amber-700">
                        الصيانة المتأخرة
                      </p>

                      <ChevronLeft className="h-4 w-4 text-gray-300 transition group-hover:text-amber-600" />
                    </div>

                    <p className="mt-1 text-2xl font-bold group-hover:text-amber-700">
                      {
                        department.overdueMaintenance
                      }
                    </p>
                  </Link>

                  {/* نقص قطع الغيار */}
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">
                      نقص قطع الغيار
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        department.lowStockParts
                      }
                    </p>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* =============================
          Management Details
          ============================= */}

      {selectedDepartment &&
        selectedView && (
          <div
            id="management-details"
            className="scroll-mt-6 rounded-2xl border bg-white p-6 shadow-sm"
          >
            {/* عنوان التفاصيل */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-600">
                  {
                    selectedDepartment.name
                  }
                </p>

                <h2 className="mt-1 text-2xl font-bold text-gray-900">
                  {detailTitle}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  العدد: {detailCount}
                </p>
              </div>

              <Link
                href="/management#departments"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                title="إغلاق التفاصيل"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            {/* ==========================
                الأصول المتأثرة
                ========================== */}

            {selectedView ===
              'affected' && (
              <>
                {affectedAssetDetails.length ===
                0 ? (
                  <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                    لا توجد أصول متأثرة
                    حالياً.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {affectedAssetDetails.map(
                      (item: any) => (
                        <Link
                          key={
                            item.asset.id
                          }
                          href={`/equipment/${item.asset.id}`}
                          className="group rounded-xl border p-4 transition hover:border-blue-200 hover:bg-blue-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 group-hover:text-blue-700">
                                {
                                  item
                                    .asset
                                    .name
                                }
                              </p>

                              <p className="mt-1 text-sm text-gray-500">
                                {
                                  item
                                    .asset
                                    .asset_id
                                }
                              </p>
                            </div>

                            <ChevronLeft className="h-5 w-5 shrink-0 text-gray-300 group-hover:text-blue-600" />
                          </div>

                          <div className="mt-4">
                            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                              {
                                item.faultCount
                              }{' '}
                              عطل مفتوح
                            </span>
                          </div>
                        </Link>
                      )
                    )}
                  </div>
                )}
              </>
            )}

            {/* ==========================
                الأعطال المفتوحة
                ========================== */}

            {selectedView ===
              'faults' && (
              <>
                {selectedDepartmentFaults.length ===
                0 ? (
                  <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                    لا توجد أعطال مفتوحة
                    حالياً.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDepartmentFaults.map(
                      (fault: any) => {
                        const asset =
                          fault.equipment_id
                            ? equipmentMap.get(
                                fault.equipment_id
                              )
                            : null;

                        return (
                          <div
                            key={
                              fault.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-gray-900">
                                  {
                                    fault.fault_number
                                  }
                                </p>

                                {asset && (
                                  <Link
                                    href={`/equipment/${asset.id}`}
                                    className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                                  >
                                    {
                                      asset.name
                                    }{' '}
                                    ·{' '}
                                    {
                                      asset.asset_id
                                    }
                                  </Link>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                                  {PRIORITY_LABELS[
                                    fault
                                      .priority
                                  ] ??
                                    fault.priority}
                                </span>

                                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                  {STATUS_LABELS[
                                    fault
                                      .status
                                  ] ??
                                    fault.status}
                                </span>
                              </div>
                            </div>

                            <p className="mt-3 text-sm leading-6 text-gray-600">
                              {
                                fault.description
                              }
                            </p>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </>
            )}

            {/* ==========================
                الصيانة المتأخرة
                ========================== */}

            {selectedView ===
              'maintenance' && (
              <>
                {useSchedules ? (
                  overdueScheduleDetails.length ===
                  0 ? (
                    <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                      لا توجد صيانة متأخرة
                      حالياً.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overdueScheduleDetails.map(
                        (
                          schedule: any
                        ) => {
                          const asset =
                            schedule.equipment_id
                              ? equipmentMap.get(
                                  schedule.equipment_id
                                )
                              : null;

                          return (
                            <div
                              key={
                                schedule.id
                              }
                              className="rounded-xl border p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-gray-900">
                                    {
                                      schedule.title
                                    }
                                  </p>

                                  {asset && (
                                    <Link
                                      href={`/equipment/${asset.id}`}
                                      className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                                    >
                                      {
                                        asset.name
                                      }{' '}
                                      ·{' '}
                                      {
                                        asset.asset_id
                                      }
                                    </Link>
                                  )}
                                </div>

                                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                                  مستحقة منذ{' '}
                                  {
                                    schedule.next_due_date
                                  }
                                </span>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )
                ) : overdueMaintenanceRecordDetails.length ===
                  0 ? (
                  <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                    لا توجد صيانة متأخرة
                    حالياً.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overdueMaintenanceRecordDetails.map(
                      (
                        record: any
                      ) => {
                        const asset =
                          record.equipment_id
                            ? equipmentMap.get(
                                record.equipment_id
                              )
                            : null;

                        return (
                          <div
                            key={
                              record.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-gray-900">
                                  {
                                    record.maintenance_number
                                  }
                                </p>

                                {record.work_description && (
                                  <p className="mt-1 text-sm text-gray-600">
                                    {
                                      record.work_description
                                    }
                                  </p>
                                )}

                                {asset && (
                                  <Link
                                    href={`/equipment/${asset.id}`}
                                    className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                                  >
                                    {
                                      asset.name
                                    }{' '}
                                    ·{' '}
                                    {
                                      asset.asset_id
                                    }
                                  </Link>
                                )}
                              </div>

                              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                                مستحقة منذ{' '}
                                {
                                  record.next_maintenance_date
                                }
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      {/* Management Attention */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6" />

          <h2 className="text-xl font-bold">
            تنبيهات تحتاج اهتمام الإدارة
          </h2>
        </div>

        {managementAlerts.length === 0 ? (
          <p className="text-gray-500">
            لا توجد تنبيهات إدارية حالياً.
          </p>
        ) : (
          <div className="space-y-3">
            {managementAlerts.map(
              (alert, index) => (
                <div
                  key={`${alert}-${index}`}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 p-4"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />

                  <span>{alert}</span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
