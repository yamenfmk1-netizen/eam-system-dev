import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  Boxes,
  Building2,
  PackageX,
  ShieldAlert,
  ShieldCheck,
  Wrench,
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

export default async function ManagementPage() {
  const supabase = createClient();

  // المستخدم الحالي
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // الأقسام المسموح لهذا المستخدم برؤيتها
  const { data: userDepartments, error: accessError } = await supabase
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
          <h1 className="text-2xl font-bold">لوحة الإدارة</h1>

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
    supabase
      .from('departments')
      .select('id,name,code')
      .in('id', departmentIds)
      .order('name'),

    supabase
      .from('equipment')
      .select('id,department_id,status')
      .in('department_id', departmentIds)
      .is('deleted_at', null),

    supabase
      .from('faults')
      .select(
        'id,department_id,equipment_id,priority,status'
      )
      .in('department_id', departmentIds)
      .in('status', OPEN_FAULT_STATUSES),

    supabase
      .from('maintenance_schedules')
      .select(
        'id,department_id,next_due_date,is_active'
      )
      .in('department_id', departmentIds)
      .eq('is_active', true),

    supabase
      .from('maintenance_records')
      .select(
        'id,department_id,next_maintenance_date'
      )
      .in('department_id', departmentIds)
      .not('next_maintenance_date', 'is', null),

    supabase
      .from('spare_parts')
      .select(
        'id,department_id,quantity_available,minimum_stock,warranty_end_date'
      )
      .in('department_id', departmentIds),
  ]);

  const departmentList = (departments ?? []) as Department[];

  const departmentStats = departmentList.map((department) => {
    const departmentEquipment = (equipment ?? []).filter(
      (item) => item.department_id === department.id
    );

    const departmentFaults = (faults ?? []).filter(
      (item) => item.department_id === department.id
    );

    const departmentSchedules = (schedules ?? []).filter(
      (item) => item.department_id === department.id
    );

    const departmentMaintenance = (
      maintenanceRecords ?? []
    ).filter(
      (item) => item.department_id === department.id
    );

    const departmentParts = (spareParts ?? []).filter(
      (item) => item.department_id === department.id
    );

    // إجمالي الأصول
    const totalAssets = departmentEquipment.length;

    // الأصول الجاهزة
    const readyAssets = departmentEquipment.filter((item) =>
      READY_STATUSES.includes(item.status)
    ).length;

    // نسبة الجاهزية
    const readiness =
      totalAssets > 0
        ? Math.round((readyAssets / totalAssets) * 100)
        : null;

    // الأعطال المفتوحة
    const openFaults = departmentFaults.length;

    // الأصول المتأثرة:
    // نحسب كل أصل مرة واحدة حتى لو عليه أكثر من عطل مفتوح
    const affectedAssets = new Set(
      departmentFaults
        .map((item) => item.equipment_id)
        .filter(Boolean)
    ).size;

    // الأعطال الحرجة
    const criticalFaults = departmentFaults.filter(
      (item) => item.priority === 'critical'
    ).length;

    // إذا عندنا Maintenance Schedules نعتمد عليها.
    // وإذا ما عندنا، نرجع لسجلات الصيانة القديمة.
    const overdueSchedules = departmentSchedules.filter(
      (item) =>
        item.next_due_date &&
        item.next_due_date < today
    ).length;

    const overdueMaintenanceFallback =
      departmentMaintenance.filter(
        (item) =>
          item.next_maintenance_date &&
          item.next_maintenance_date < today
      ).length;

    const overdueMaintenance =
      departmentSchedules.length > 0
        ? overdueSchedules
        : overdueMaintenanceFallback;

    // نقص قطع الغيار
    const lowStockParts = departmentParts.filter((item) => {
      const available = Number(
        item.quantity_available ?? 0
      );

      const minimum = Number(
        item.minimum_stock ?? 0
      );

      return available <= minimum;
    }).length;

    // الضمانات المنتهية
    const expiredWarranties = departmentParts.filter(
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
  });

  // إجمالي الأصول في كل الأقسام المسموحة
  const totalAssets = departmentStats.reduce(
    (sum, item) => sum + item.totalAssets,
    0
  );

  // إجمالي الأعطال المفتوحة
  const totalOpenFaults = departmentStats.reduce(
    (sum, item) => sum + item.openFaults,
    0
  );

  // إجمالي الأعطال الحرجة
  const totalCriticalFaults = departmentStats.reduce(
    (sum, item) => sum + item.criticalFaults,
    0
  );

  // التنبيهات الإدارية
  const managementAlerts = departmentStats.flatMap(
    (department) => {
      const alerts: string[] = [];

      if (department.criticalFaults > 0) {
        alerts.push(
          `${department.name}: ${department.criticalFaults} أعطال حرجة مفتوحة`
        );
      }

      if (department.overdueMaintenance > 0) {
        alerts.push(
          `${department.name}: ${department.overdueMaintenance} أعمال صيانة متأخرة`
        );
      }

      if (department.lowStockParts > 0) {
        alerts.push(
          `${department.name}: ${department.lowStockParts} قطع غيار منخفضة المخزون`
        );
      }

      if (department.expiredWarranties > 0) {
        alerts.push(
          `${department.name}: ${department.expiredWarranties} ضمانات منتهية`
        );
      }

      return alerts;
    }
  );

  return (
    <div className="space-y-8" dir="rtl">
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
      <div>
        <h2 className="mb-4 text-xl font-bold">
          حالة الأقسام
        </h2>

        <div className="grid gap-5 xl:grid-cols-2">
          {departmentStats.map((department) => (
            <div
              key={department.id}
              className="rounded-2xl border bg-white p-6 shadow-sm"
            >
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
                    {department.readiness === null
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
                    {department.totalAssets}
                  </p>
                </div>

                {/* الأصول المتأثرة */}
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    الأصول المتأثرة
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {department.affectedAssets}
                  </p>
                </div>

                {/* الأعطال المفتوحة */}
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    الأعطال المفتوحة
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {department.openFaults}
                  </p>
                </div>

                {/* الأعطال الحرجة */}
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    الأعطال الحرجة
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {department.criticalFaults}
                  </p>
                </div>

                {/* الصيانة المتأخرة */}
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    الصيانة المتأخرة
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {department.overdueMaintenance}
                  </p>
                </div>

                {/* نقص قطع الغيار */}
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    نقص قطع الغيار
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {department.lowStockParts}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
            {managementAlerts.map((alert, index) => (
              <div
                key={`${alert}-${index}`}
                className="flex items-center gap-3 rounded-xl bg-gray-50 p-4"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />

                <span>{alert}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
