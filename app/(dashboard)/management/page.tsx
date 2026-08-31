import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import StatCard from '@/components/ui/StatCard';
import { DepartmentPerformanceChart, MonthlyFaultTrendChart } from '@/components/dashboard/DashboardCharts';
import {
  AlertTriangle,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  PackageX,
  RefreshCcw,
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

function dateOnlyUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function percentage(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : null;
}

function kpiTone(value: number | null) {
  if (value === null) return 'default' as const;
  if (value >= 90) return 'success' as const;
  if (value >= 75) return 'warning' as const;
  return 'danger' as const;
}

export default async function ManagementPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // لا يوجد أي قسم ثابت هنا.
  // تظهر تلقائيًا جميع الأقسام المسموح لهذا المستخدم برؤيتها من user_departments.
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
        .filter((id): id is string => Boolean(id))
    )
  );

  if (departmentIds.length === 0) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة الإدارة</h1>
          <p className="mt-1 text-gray-500">لا توجد أقسام مرتبطة بهذا الحساب.</p>
        </div>
      </div>
    );
  }

  const now = new Date();

  // تاريخ اليوم حسب توقيت الرياض.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
  }).format(now);

  const [year, month] = today.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

  const todayUtc = new Date(`${today}T00:00:00Z`);

  const ninetyDaysAgo = new Date(todayUtc);
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 89);
  const ninetyDaysAgoStr = dateOnlyUTC(ninetyDaysAgo);

  const sixMonthsStart = new Date(Date.UTC(year, month - 6, 1));
  const sixMonthsStartStr = dateOnlyUTC(sixMonthsStart);

  const in30 = new Date(todayUtc);
  in30.setUTCDate(in30.getUTCDate() + 30);
  const in30Str = dateOnlyUTC(in30);

  const [
    { data: departments },
    { data: buildings },
    { data: equipment },
    { data: openFaults },
    { data: schedules },
    { data: maintenanceFallback },
    { data: monthMaintenance },
    { data: spareParts },
    { data: closedMonthFaults },
    { data: sixMonthFaults },
  ] = await Promise.all([
    supabase
      .from('departments')
      .select('id,name,code')
      .in('id', departmentIds)
      .order('name'),

    supabase
      .from('buildings')
      .select('id,name,building_number'),

    supabase
      .from('equipment')
      .select('id,name,asset_id,department_id,status,building_id')
      .in('department_id', departmentIds)
      .is('deleted_at', null),

    supabase
      .from('faults')
      .select('id,department_id,building_id,equipment_id,priority,status')
      .in('department_id', departmentIds)
      .in('status', OPEN_FAULT_STATUSES),

    supabase
      .from('maintenance_schedules')
      .select('id,department_id,building_id,next_due_date,is_active')
      .in('department_id', departmentIds)
      .eq('is_active', true)
      .lt('next_due_date', today),

    supabase
      .from('maintenance_records')
      .select('id,department_id,building_id,next_maintenance_date')
      .in('department_id', departmentIds)
      .not('next_maintenance_date', 'is', null)
      .lt('next_maintenance_date', today),

    supabase
      .from('maintenance_records')
      .select('id,department_id,category,status,maintenance_date')
      .in('department_id', departmentIds)
      .gte('maintenance_date', monthStart)
      .lte('maintenance_date', today),

    supabase
      .from('spare_parts')
      .select(
        'id,department_id,quantity_available,minimum_stock,warranty_end_date'
      )
      .in('department_id', departmentIds),

    supabase
      .from('faults')
      .select('id,department_id,repair_time_minutes,closed_at')
      .in('department_id', departmentIds)
      .not('closed_at', 'is', null)
      .not('repair_time_minutes', 'is', null)
      .gte('closed_at', `${monthStart}T00:00:00+03:00`)
      .lte('closed_at', now.toISOString()),

    supabase
      .from('faults')
      .select('id,department_id,equipment_id,reported_at')
      .in('department_id', departmentIds)
      .gte('reported_at', `${sixMonthsStartStr}T00:00:00+03:00`)
      .lte('reported_at', now.toISOString()),
  ]);

  const departmentList = (departments ?? []) as Department[];
  const departmentNameById = new Map(
    departmentList.map((department) => [department.id, department.name])
  );

  const buildingById = new Map(
    (buildings ?? []).map((building: any) => [
      building.id,
      {
        name: building.name,
        buildingNumber: building.building_number,
      },
    ])
  );

  const useSchedules = schedules !== null;

  const departmentStats = departmentList.map((department) => {
    const departmentEquipment = (equipment ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentOpenFaults = (openFaults ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentSchedules = (schedules ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentFallback = (maintenanceFallback ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentMonthMaintenance = (monthMaintenance ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentParts = (spareParts ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentClosedFaults = (closedMonthFaults ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const departmentRecentFaults = (sixMonthFaults ?? []).filter(
      (item: any) => item.department_id === department.id
    );

    const totalAssets = departmentEquipment.length;

    const readyAssets = departmentEquipment.filter((item: any) =>
      READY_STATUSES.includes(item.status)
    ).length;

    const readiness =
      totalAssets > 0
        ? Math.round((readyAssets / totalAssets) * 100)
        : null;

    const buildingsWithAssets = new Set(
      departmentEquipment
        .map((item: any) => item.building_id)
        .filter(Boolean)
    ).size;

    const criticalFaults = departmentOpenFaults.filter(
      (item: any) => item.priority === 'critical'
    ).length;

    const overdueMaintenance = useSchedules
      ? departmentSchedules.length
      : departmentFallback.length;

    const lowStockParts = departmentParts.filter((item: any) => {
      const available = Number(item.quantity_available ?? 0);
      const minimum = Number(item.minimum_stock ?? 0);
      return available <= minimum;
    }).length;

    const expiredWarranties = departmentParts.filter(
      (item: any) =>
        item.warranty_end_date &&
        item.warranty_end_date < today
    ).length;

    const expiringWarranties = departmentParts.filter(
      (item: any) =>
        item.warranty_end_date &&
        item.warranty_end_date >= today &&
        item.warranty_end_date <= in30Str
    ).length;

    const pmRecords = departmentMonthMaintenance.filter(
      (item: any) =>
        item.category === 'preventive' &&
        item.status !== 'cancelled'
    );

    const pmCompleted = pmRecords.filter(
      (item: any) => item.status === 'completed'
    ).length;

    const pmCompletion = percentage(pmCompleted, pmRecords.length);

    const correctiveRecords = departmentMonthMaintenance.filter(
      (item: any) =>
        item.category === 'corrective' &&
        item.status !== 'cancelled'
    );

    const correctiveCompleted = correctiveRecords.filter(
      (item: any) => item.status === 'completed'
    ).length;

    const correctiveCompletion = percentage(
      correctiveCompleted,
      correctiveRecords.length
    );

    const repairDurations = departmentClosedFaults
      .map((fault: any) => Number(fault.repair_time_minutes))
      .filter(
        (minutes: number) =>
          Number.isFinite(minutes) && minutes >= 0
      );

    const mttrMinutes =
      repairDurations.length > 0
        ? repairDurations.reduce(
            (sum: number, minutes: number) => sum + minutes,
            0
          ) / repairDurations.length
        : null;

    const mttrHours =
      mttrMinutes === null
        ? null
        : Math.round((mttrMinutes / 60) * 10) / 10;

    const repeatedFaultCountByEquipment = new Map<string, number>();

    for (const fault of departmentRecentFaults) {
      if (!fault.equipment_id || !fault.reported_at) continue;

      if (fault.reported_at < `${ninetyDaysAgoStr}T00:00:00`) {
        continue;
      }

      repeatedFaultCountByEquipment.set(
        fault.equipment_id,
        (repeatedFaultCountByEquipment.get(fault.equipment_id) ?? 0) + 1
      );
    }

    const repeatedFaultAssets = Array.from(
      repeatedFaultCountByEquipment.values()
    ).filter((count) => count >= 2).length;

    return {
      ...department,
      totalAssets,
      readyAssets,
      readiness,
      buildingsWithAssets,
      openFaults: departmentOpenFaults.length,
      criticalFaults,
      overdueMaintenance,
      lowStockParts,
      expiredWarranties,
      expiringWarranties,
      pmCompletion,
      correctiveCompletion,
      mttrHours,
      repeatedFaultAssets,
      pmDueCount: pmRecords.length,
      pmCompleted,
      correctiveDueCount: correctiveRecords.length,
      correctiveCompleted,
      repairDurations,
    };
  });

  // ============================================================
  // Overall Management KPIs
  // يتم حسابها من البيانات الخام لكل الأقسام، وليس بمتوسط نسب الأقسام.
  // ============================================================

  const totalAssets = departmentStats.reduce(
    (sum, item) => sum + item.totalAssets,
    0
  );

  const totalReadyAssets = departmentStats.reduce(
    (sum, item) => sum + item.readyAssets,
    0
  );

  const overallReadiness =
    totalAssets > 0
      ? Math.round((totalReadyAssets / totalAssets) * 100)
      : null;

  const totalOpenFaults = departmentStats.reduce(
    (sum, item) => sum + item.openFaults,
    0
  );

  const totalCriticalFaults = departmentStats.reduce(
    (sum, item) => sum + item.criticalFaults,
    0
  );

  const totalOverdueMaintenance = departmentStats.reduce(
    (sum, item) => sum + item.overdueMaintenance,
    0
  );

  const totalLowStockParts = departmentStats.reduce(
    (sum, item) => sum + item.lowStockParts,
    0
  );

  const totalExpiredWarranties = departmentStats.reduce(
    (sum, item) => sum + item.expiredWarranties,
    0
  );

  const totalExpiringWarranties = departmentStats.reduce(
    (sum, item) => sum + item.expiringWarranties,
    0
  );

  const totalPmDue = departmentStats.reduce(
    (sum, item) => sum + item.pmDueCount,
    0
  );

  const totalPmCompleted = departmentStats.reduce(
    (sum, item) => sum + item.pmCompleted,
    0
  );

  const overallPmCompletion = percentage(
    totalPmCompleted,
    totalPmDue
  );

  const totalCorrectiveDue = departmentStats.reduce(
    (sum, item) => sum + item.correctiveDueCount,
    0
  );

  const totalCorrectiveCompleted = departmentStats.reduce(
    (sum, item) => sum + item.correctiveCompleted,
    0
  );

  const overallCorrectiveCompletion = percentage(
    totalCorrectiveCompleted,
    totalCorrectiveDue
  );

  const allRepairDurations = departmentStats.flatMap(
    (item) => item.repairDurations
  );

  const overallMttrMinutes =
    allRepairDurations.length > 0
      ? allRepairDurations.reduce(
          (sum, minutes) => sum + minutes,
          0
        ) / allRepairDurations.length
      : null;

  const overallMttrHours =
    overallMttrMinutes === null
      ? null
      : Math.round((overallMttrMinutes / 60) * 10) / 10;

  const totalRepeatedFaultAssets = departmentStats.reduce(
    (sum, item) => sum + item.repeatedFaultAssets,
    0
  );

  // ============================================================
  // Monthly Fault Trend — آخر 6 أشهر لجميع الأقسام المسموحة
  // ============================================================

  const monthlyFaultCountMap = new Map<string, number>();

  for (const fault of sixMonthFaults ?? []) {
    if (!fault.reported_at) continue;

    const faultDate = new Date(fault.reported_at);
    const key = `${faultDate.getUTCFullYear()}-${String(
      faultDate.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    monthlyFaultCountMap.set(
      key,
      (monthlyFaultCountMap.get(key) ?? 0) + 1
    );
  }

  const monthNamesAr = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  const monthlyFaultTrendData = Array.from(
    { length: 6 },
    (_, index) => {
      const monthDate = new Date(
        Date.UTC(year, month - 6 + index, 1)
      );

      const key = `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1
      ).padStart(2, '0')}`;

      return {
        month: monthNamesAr[monthDate.getUTCMonth()],
        count: monthlyFaultCountMap.get(key) ?? 0,
      };
    }
  );

  // ============================================================
  // المعدات الأكثر تكرارًا بالأعطال خلال آخر 90 يوم
  // ============================================================

  const equipmentById = new Map(
    (equipment ?? []).map((item: any) => [item.id, item])
  );

  const repeatedEquipmentFaultCounts = new Map<string, number>();

  for (const fault of sixMonthFaults ?? []) {
    if (!fault.equipment_id || !fault.reported_at) continue;

    if (fault.reported_at < `${ninetyDaysAgoStr}T00:00:00`) {
      continue;
    }

    repeatedEquipmentFaultCounts.set(
      fault.equipment_id,
      (repeatedEquipmentFaultCounts.get(fault.equipment_id) ?? 0) + 1
    );
  }

  const topRepeatedEquipment = Array.from(
    repeatedEquipmentFaultCounts.entries()
  )
    .filter(([, count]) => count >= 2)
    .map(([equipmentId, faultCount]) => {
      const item: any = equipmentById.get(equipmentId);
      const building = item?.building_id
        ? buildingById.get(item.building_id)
        : null;

      return {
        id: equipmentId,
        name: item?.name ?? 'معدة غير مسماة',
        assetId: item?.asset_id ?? null,
        departmentName: item?.department_id
          ? departmentNameById.get(item.department_id) ?? '—'
          : '—',
        buildingLabel: building
          ? building.buildingNumber
            ? `مبنى ${building.buildingNumber}`
            : building.name ?? '—'
          : '—',
        faultCount,
      };
    })
    .sort((a, b) => b.faultCount - a.faultCount)
    .slice(0, 8);

  // ============================================================
  // المباني الأعلى أولوية على مستوى الإدارة
  // يعتمد الترتيب على الأعطال الحرجة ثم المفتوحة ثم الصيانة المتأخرة.
  // ============================================================

  const buildingPriorityData = (buildings ?? [])
    .map((building: any) => {
      const buildingFaults = (openFaults ?? []).filter(
        (fault: any) => fault.building_id === building.id
      );

      const criticalFaults = buildingFaults.filter(
        (fault: any) => fault.priority === 'critical'
      ).length;

      const buildingMaintenance = useSchedules
        ? (schedules ?? []).filter(
            (item: any) => item.building_id === building.id
          )
        : (maintenanceFallback ?? []).filter(
            (item: any) => item.building_id === building.id
          );

      const departmentSet = new Set<string>();

      for (const fault of buildingFaults) {
        if (fault.department_id) {
          departmentSet.add(fault.department_id);
        }
      }

      for (const item of buildingMaintenance) {
        if (item.department_id) {
          departmentSet.add(item.department_id);
        }
      }

      const departmentNames = Array.from(departmentSet)
        .map((id) => departmentNameById.get(id))
        .filter((name): name is string => Boolean(name));

      const openFaultCount = buildingFaults.length;
      const overdueMaintenanceCount = buildingMaintenance.length;

      const score =
        criticalFaults * 100 +
        openFaultCount * 25 +
        overdueMaintenanceCount * 15;

      return {
        id: building.id,
        name: building.name,
        buildingNumber: building.building_number,
        openFaultCount,
        criticalFaults,
        overdueMaintenanceCount,
        departmentNames,
        score,
      };
    })
    .filter((building) => building.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ترتيب الأقسام بحيث يظهر الأكثر حاجة للاهتمام أولًا.
  const sortedDepartments = [...departmentStats].sort((a, b) => {
    const scoreA =
      a.criticalFaults * 100 +
      a.openFaults * 25 +
      a.overdueMaintenance * 15 +
      a.repeatedFaultAssets * 10 +
      a.lowStockParts * 5;

    const scoreB =
      b.criticalFaults * 100 +
      b.openFaults * 25 +
      b.overdueMaintenance * 15 +
      b.repeatedFaultAssets * 10 +
      b.lowStockParts * 5;

    return scoreB - scoreA || a.name.localeCompare(b.name, 'ar');
  });

  const departmentComparisonData = sortedDepartments.map((department) => ({
    department: department.name,
    readiness: department.readiness,
    pmCompletion: department.pmCompletion,
    correctiveCompletion: department.correctiveCompletion,
  }));

  type ManagementAlert = {
    departmentId: string;
    departmentName: string;
    title: string;
    detail: string;
    severity: 'critical' | 'high' | 'medium';
    score: number;
  };

  const managementAlerts: ManagementAlert[] = sortedDepartments
    .flatMap((department) => {
      const alerts: ManagementAlert[] = [];

      if (department.criticalFaults > 0) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'أعطال حرجة مفتوحة',
          detail: `${department.criticalFaults} أعطال حرجة تحتاج متابعة فورية`,
          severity: 'critical',
          score: 500 + department.criticalFaults * 50,
        });
      }

      if (department.overdueMaintenance > 0) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'صيانة متأخرة',
          detail: `${department.overdueMaintenance} أعمال صيانة تجاوزت موعدها`,
          severity: department.overdueMaintenance >= 3 ? 'high' : 'medium',
          score: 300 + department.overdueMaintenance * 20,
        });
      }

      if (department.repeatedFaultAssets > 0) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'أعطال متكررة',
          detail: `${department.repeatedFaultAssets} معدات تكرر عليها العطل خلال 90 يوم`,
          severity: department.repeatedFaultAssets >= 3 ? 'high' : 'medium',
          score: 250 + department.repeatedFaultAssets * 15,
        });
      }

      if (
        department.pmCompletion !== null &&
        department.pmCompletion < 75
      ) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'انخفاض إنجاز الصيانة الوقائية',
          detail: `نسبة الإنجاز الحالية ${department.pmCompletion}%`,
          severity: department.pmCompletion < 50 ? 'high' : 'medium',
          score: 220 + (75 - department.pmCompletion),
        });
      }

      if (
        department.correctiveCompletion !== null &&
        department.correctiveCompletion < 75
      ) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'انخفاض إنجاز الصيانة العلاجية',
          detail: `نسبة الإنجاز الحالية ${department.correctiveCompletion}%`,
          severity:
            department.correctiveCompletion < 50 ? 'high' : 'medium',
          score: 210 + (75 - department.correctiveCompletion),
        });
      }

      if (department.lowStockParts > 0) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'نقص قطع الغيار',
          detail: `${department.lowStockParts} أصناف عند أو تحت الحد الأدنى للمخزون`,
          severity: department.lowStockParts >= 5 ? 'high' : 'medium',
          score: 180 + department.lowStockParts * 10,
        });
      }

      if (department.expiredWarranties > 0) {
        alerts.push({
          departmentId: department.id,
          departmentName: department.name,
          title: 'ضمانات منتهية',
          detail: `${department.expiredWarranties} عناصر انتهت ضماناتها`,
          severity: 'medium',
          score: 120 + department.expiredWarranties * 5,
        });
      }

      return alerts;
    })
    .sort((a, b) => b.score - a.score);

  const criticalManagementAlerts = managementAlerts.filter(
    (alert) => alert.severity === 'critical'
  ).length;

  const highManagementAlerts = managementAlerts.filter(
    (alert) => alert.severity === 'high'
  ).length;

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          لوحة الإدارة
        </h1>
        <p className="mt-2 text-gray-500">
          نظرة شاملة وديناميكية على جميع الأقسام المصرح لهذا الحساب برؤيتها
        </p>
      </div>

      {/* الصف الأول: الحالة التشغيلية العامة */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="الأقسام"
          value={departmentStats.length}
          icon={Building2}
        />
        <StatCard
          label="إجمالي الأصول"
          value={totalAssets}
          icon={Boxes}
        />
        <StatCard
          label="الأعطال المفتوحة"
          value={totalOpenFaults}
          icon={AlertTriangle}
          tone={totalOpenFaults > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="الأعطال الحرجة"
          value={totalCriticalFaults}
          icon={ShieldAlert}
          tone={totalCriticalFaults > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="معدات بأعطال متكررة (90 يوم)"
          value={totalRepeatedFaultAssets}
          icon={RefreshCcw}
          tone={
            totalRepeatedFaultAssets === 0
              ? 'success'
              : totalRepeatedFaultAssets <= 2
                ? 'warning'
                : 'danger'
          }
        />
        <StatCard
          label="الصيانة المتأخرة"
          value={totalOverdueMaintenance}
          icon={Wrench}
          tone={
            totalOverdueMaintenance > 0 ? 'warning' : 'success'
          }
        />
      </div>

      {/* الصف الثاني: مؤشرات الأداء */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="الجاهزية العامة"
          value={overallReadiness ?? '—'}
          suffix={overallReadiness === null ? undefined : '%'}
          icon={Gauge}
          tone={kpiTone(overallReadiness)}
        />
        <StatCard
          label="إنجاز الصيانة الوقائية"
          value={overallPmCompletion ?? '—'}
          suffix={overallPmCompletion === null ? undefined : '%'}
          icon={ClipboardCheck}
          tone={kpiTone(overallPmCompletion)}
        />
        <StatCard
          label="إنجاز الصيانة العلاجية"
          value={overallCorrectiveCompletion ?? '—'}
          suffix={
            overallCorrectiveCompletion === null ? undefined : '%'
          }
          icon={Wrench}
          tone={kpiTone(overallCorrectiveCompletion)}
        />
        <StatCard
          label="متوسط وقت الإصلاح (MTTR)"
          value={overallMttrHours ?? '—'}
          suffix={overallMttrHours === null ? undefined : ' ساعة'}
          icon={Gauge}
        />
      </div>

      {/* الصف الثالث: المخزون والضمان */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="قطع غيار منخفضة المخزون"
          value={totalLowStockParts}
          icon={PackageX}
          tone={totalLowStockParts > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="ضمانات منتهية"
          value={totalExpiredWarranties}
          icon={ShieldAlert}
          tone={
            totalExpiredWarranties > 0 ? 'danger' : 'success'
          }
        />
        <StatCard
          label="ضمانات تنتهي خلال 30 يوم"
          value={totalExpiringWarranties}
          icon={CalendarClock}
          tone={
            totalExpiringWarranties > 0 ? 'warning' : 'success'
          }
        />
      </div>

      {/* اتجاه الأعطال الشهري */}
      <div className="card">
        <div className="mb-3">
          <h2 className="font-bold text-gray-900">
            اتجاه الأعطال الشهري
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            جميع الأعطال المسجلة في الأقسام المسموحة خلال آخر 6 أشهر
          </p>
        </div>
        <MonthlyFaultTrendChart data={monthlyFaultTrendData} />
      </div>

      {/* مقارنة مؤشرات أداء الأقسام */}
      <div className="card">
        <div className="mb-3">
          <h2 className="font-bold text-gray-900">
            مقارنة أداء الأقسام
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            مقارنة الجاهزية وإنجاز الصيانة الوقائية والعلاجية لكل قسم
          </p>
        </div>
        <DepartmentPerformanceChart data={departmentComparisonData} />
      </div>

      {/* المعدات الأكثر تكرارًا بالأعطال */}
      <div className="card">
        <div className="mb-4">
          <h2 className="font-bold text-gray-900">
            المعدات الأكثر تكرارًا بالأعطال
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            المعدات التي سُجل عليها عطلان أو أكثر خلال آخر 90 يوم
          </p>
        </div>

        {topRepeatedEquipment.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            لا توجد معدات بأعطال متكررة خلال آخر 90 يوم
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-3 py-2 text-start font-medium">المعدة</th>
                  <th className="px-3 py-2 text-start font-medium">رقم الأصل</th>
                  <th className="px-3 py-2 text-start font-medium">القسم</th>
                  <th className="px-3 py-2 text-start font-medium">المبنى</th>
                  <th className="px-3 py-2 text-center font-medium">عدد الأعطال</th>
                </tr>
              </thead>
              <tbody>
                {topRepeatedEquipment.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70"
                  >
                    <td className="px-3 py-3 font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-3 py-3 text-gray-600" dir="ltr">
                      {item.assetId ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {item.departmentName}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {item.buildingLabel}
                    </td>
                    <td
                      className={`px-3 py-3 text-center text-lg font-bold ${
                        item.faultCount >= 4
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {item.faultCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* المباني الأعلى أولوية */}
      <div className="card">
        <div className="mb-4">
          <h2 className="font-bold text-gray-900">
            المباني الأعلى أولوية
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            ترتيب تلقائي حسب الأعطال الحرجة والمفتوحة والصيانة المتأخرة عبر جميع الأقسام
          </p>
        </div>

        {buildingPriorityData.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            لا توجد مبانٍ تحتاج اهتمامًا حاليًا
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-3 py-2 text-start font-medium">المبنى</th>
                  <th className="px-3 py-2 text-start font-medium">الأقسام المعنية</th>
                  <th className="px-3 py-2 text-center font-medium">الأعطال المفتوحة</th>
                  <th className="px-3 py-2 text-center font-medium">الحرجة</th>
                  <th className="px-3 py-2 text-center font-medium">الصيانة المتأخرة</th>
                </tr>
              </thead>
              <tbody>
                {buildingPriorityData.map((building) => (
                  <tr
                    key={building.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70"
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">
                        {building.buildingNumber
                          ? `مبنى ${building.buildingNumber}`
                          : building.name}
                      </div>
                      {building.buildingNumber && building.name && (
                        <div className="mt-0.5 text-xs text-gray-400">
                          {building.name}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-gray-600">
                      {building.departmentNames.length > 0
                        ? building.departmentNames.join('، ')
                        : '—'}
                    </td>

                    <td className="px-3 py-3 text-center font-semibold">
                      {building.openFaultCount}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-semibold ${
                        building.criticalFaults > 0
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}
                    >
                      {building.criticalFaults}
                    </td>

                    <td className="px-3 py-3 text-center font-semibold">
                      {building.overdueMaintenanceCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* مقارنة ديناميكية بين الأقسام */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            أداء الأقسام
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            يتم إنشاء هذه البطاقات تلقائيًا من جدول الأقسام والصلاحيات، بدون قائمة أقسام ثابتة
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {sortedDepartments.map((department) => (
            <div
              key={department.id}
              className="rounded-2xl border bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {department.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">
                    {department.code}
                  </p>
                </div>

                <div className="text-left">
                  <p className="text-sm text-gray-500">الجاهزية</p>
                  <p
                    className={`mt-1 text-3xl font-bold ${
                      department.readiness === null
                        ? 'text-gray-400'
                        : department.readiness >= 90
                          ? 'text-emerald-600'
                          : department.readiness >= 75
                            ? 'text-amber-600'
                            : 'text-red-600'
                    }`}
                  >
                    {department.readiness === null
                      ? '—'
                      : `${department.readiness}%`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">الأصول</p>
                  <p className="mt-1 text-xl font-bold">
                    {department.totalAssets}
                  </p>
                </div>

                <Link
                  href={`/faults?department=${department.id}`}
                  className="rounded-xl bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-sm"
                >
                  <p className="text-xs text-gray-500">
                    الأعطال المفتوحة
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {department.openFaults}
                  </p>
                </Link>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    PM Completion
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {department.pmCompletion === null
                      ? '—'
                      : `${department.pmCompletion}%`}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    Corrective Completion
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {department.correctiveCompletion === null
                      ? '—'
                      : `${department.correctiveCompletion}%`}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">MTTR</p>
                  <p className="mt-1 text-xl font-bold">
                    {department.mttrHours === null
                      ? '—'
                      : `${department.mttrHours} س`}
                  </p>
                </div>

                <Link
                  href={`/faults?department=${department.id}`}
                  className="rounded-xl bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-sm"
                >
                  <p className="text-xs text-gray-500">
                    أعطال متكررة
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {department.repeatedFaultAssets}
                  </p>
                </Link>

                <Link
                  href={`/maintenance?department=${department.id}`}
                  className="rounded-xl bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-sm"
                >
                  <p className="text-xs text-gray-500">
                    صيانة متأخرة
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {department.overdueMaintenance}
                  </p>
                </Link>

                <Link
                  href={`/spare-parts?department=${department.id}`}
                  className="rounded-xl bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-sm"
                >
                  <p className="text-xs text-gray-500">
                    نقص قطع الغيار
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {department.lowStockParts}
                  </p>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ملخص تنبيهات الإدارة */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="إجمالي التنبيهات الإدارية"
          value={managementAlerts.length}
          icon={AlertTriangle}
          tone={managementAlerts.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="تنبيهات حرجة"
          value={criticalManagementAlerts}
          icon={ShieldAlert}
          tone={criticalManagementAlerts > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="تنبيهات عالية"
          value={highManagementAlerts}
          icon={AlertTriangle}
          tone={highManagementAlerts > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* تنبيهات الإدارة مرتبة حسب الأولوية */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              تنبيهات تحتاج اهتمام الإدارة
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              مرتبة تلقائيًا من الأعلى خطورة إلى الأقل
            </p>
          </div>
        </div>

        {managementAlerts.length === 0 ? (
          <p className="text-gray-500">
            لا توجد تنبيهات إدارية حالياً.
          </p>
        ) : (
          <div className="space-y-3">
            {managementAlerts.map((alert, index) => (
              <div
                key={`${alert.departmentId}-${alert.title}-${index}`}
                className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${
                  alert.severity === 'critical'
                    ? 'border-red-200 bg-red-50/60'
                    : alert.severity === 'high'
                      ? 'border-amber-200 bg-amber-50/60'
                      : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <AlertTriangle
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      alert.severity === 'critical'
                        ? 'text-red-600'
                        : alert.severity === 'high'
                          ? 'text-amber-600'
                          : 'text-gray-500'
                    }`}
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900">
                        {alert.departmentName}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="font-medium text-gray-800">
                        {alert.title}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {alert.detail}
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    alert.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : alert.severity === 'high'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {alert.severity === 'critical'
                    ? 'حرج'
                    : alert.severity === 'high'
                      ? 'عالي'
                      : 'متوسط'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
