import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  DEPARTMENT_CODE,
  CURRENT_DASHBOARD_CONFIG,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';
import StatCard from '@/components/ui/StatCard';
import { EquipmentStatusChart, FaultPriorityChart, MonthlyFaultTrendChart } from '@/components/dashboard/DashboardCharts';
import {
  AlertTriangle,
  BatteryCharging,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  PackageX,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const OPEN_FAULT_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_for_spare_parts'];

const TEST_TYPE_LABELS: Record<string, string> = {
  generator_operational_test: 'اختبار مولد',
  actual_power_interruption_test: 'محاكاة انقطاع فعلي',
  ats_transfer_test: 'اختبار ATS',
  ups_battery_test: 'اختبار بطاريات UPS',
  ups_bypass_test: 'اختبار UPS Bypass',
  transformer_inspection: 'فحص محول',
  switchgear_test: 'اختبار Switchgear',
  rmu_inspection: 'فحص RMU',
  battery_test: 'اختبار بطاريات',
  custom_test: 'اختبار مخصص',
};

function dateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysFromToday(dateString: string, today: Date) {
  const target = new Date(`${dateString}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function remainingLabel(days: number) {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  return `بعد ${days} أيام`;
}

export default async function DashboardPage() {
  if (IS_MANAGEMENT_SITE) {
  redirect('/management');
}
  const supabase = createClient();

  // معرفة القسم الخاص بهذا الموقع
  const { data: department } = await supabase
    .from('departments')
    .select('id')
    .eq('code', DEPARTMENT_CODE)
    .single();

  if (!department) {
    throw new Error(`Department not found: ${DEPARTMENT_CODE}`);
  }

  const departmentId = department.id;

  const todayDate = new Date();
  const today = dateOnly(todayDate);
  const monthStart = dateOnly(
    new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  );
  const ninetyDaysAgo = new Date(todayDate);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
  const ninetyDaysAgoStr = dateOnly(ninetyDaysAgo);

  const sixMonthsStart = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth() - 5,
    1
  );
  const sixMonthsStartStr = dateOnly(sixMonthsStart);

  const in30 = new Date(todayDate);
  in30.setDate(in30.getDate() + 30);
  const in30Str = dateOnly(in30);

  const [
    { count: buildingsCount },
    { data: primaryAssets },
    { data: secondaryAssets },
    { data: openFaults },
    { data: statusCounts },
    { data: buildings },
    { data: spareParts },
    { data: upcomingTests },
    { data: schedules },
    { data: maintenanceFallback },
    { data: pmRecords },
    { data: correctiveRecords },
    { data: repairedFaults },
    { data: repeatedFaultRecords },
    { data: monthlyFaultRecords },
  ] = await Promise.all([
    supabase
      .from('buildings')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),

    supabase
      .from('equipment')
      .select('id,status')
      .eq('type', CURRENT_DASHBOARD_CONFIG.primaryType)
      .eq('department_id', departmentId)
      .is('deleted_at', null),

    supabase
      .from('equipment')
      .select('id,status')
      .eq('type', CURRENT_DASHBOARD_CONFIG.secondaryType)
      .eq('department_id', departmentId)
      .is('deleted_at', null),

    supabase
      .from('faults')
      .select('id,building_id,priority,status')
      .eq('department_id', departmentId)
      .in('status', OPEN_FAULT_STATUSES),

    supabase
      .from('equipment')
      .select('status')
      .eq('department_id', departmentId)
      .is('deleted_at', null),

    supabase
      .from('buildings')
      .select('id,building_number,name,status')
      .is('deleted_at', null),

    supabase
      .from('spare_parts')
      .select('id,quantity_available,minimum_stock,warranty_end_date')
      .eq('department_id', departmentId),

    supabase
      .from('tests')
      .select('id,test_number,test_type,next_test_date,building_id,equipment_id,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .not('next_test_date', 'is', null)
      .gte('next_test_date', today)
      .lte('next_test_date', in30Str)
      .order('next_test_date', { ascending: true })
      .limit(8),

    supabase
      .from('maintenance_schedules')
      .select('id,building_id,next_due_date,is_active')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .lt('next_due_date', today),

    supabase
      .from('maintenance_records')
      .select('id,building_id,next_maintenance_date')
      .eq('department_id', departmentId)
      .not('next_maintenance_date', 'is', null)
      .lt('next_maintenance_date', today),

    // الصيانة الوقائية المستحقة من بداية الشهر حتى اليوم
    supabase
      .from('maintenance_records')
      .select('id,status,category,maintenance_date')
      .eq('department_id', departmentId)
      .eq('category', 'preventive')
      .gte('maintenance_date', monthStart)
      .lte('maintenance_date', today),

    // الصيانة العلاجية المسجلة من بداية الشهر حتى اليوم
    supabase
      .from('maintenance_records')
      .select('id,status,category,maintenance_date')
      .eq('department_id', departmentId)
      .eq('category', 'corrective')
      .gte('maintenance_date', monthStart)
      .lte('maintenance_date', today),

    // الأعطال التي تم إغلاقها خلال الشهر الحالي لاستخدامها في حساب MTTR
    supabase
      .from('faults')
      .select('id,repair_time_minutes,closed_at')
      .eq('department_id', departmentId)
      .not('closed_at', 'is', null)
      .gte('closed_at', `${monthStart}T00:00:00`)
      .lte('closed_at', todayDate.toISOString()),

    // الأعطال المسجلة خلال آخر 90 يوم لاكتشاف المعدات ذات الأعطال المتكررة
    supabase
      .from('faults')
      .select('id,equipment_id,reported_at')
      .eq('department_id', departmentId)
      .not('equipment_id', 'is', null)
      .gte('reported_at', `${ninetyDaysAgoStr}T00:00:00`)
      .lte('reported_at', todayDate.toISOString()),

    // جميع الأعطال خلال آخر 6 أشهر لعرض الاتجاه الشهري.
    supabase
      .from('faults')
      .select('id,reported_at')
      .eq('department_id', departmentId)
      .gte('reported_at', `${sixMonthsStartStr}T00:00:00`)
      .lte('reported_at', todayDate.toISOString()),
  ]);

  const primaryTotal = primaryAssets?.length ?? 0;
const primaryReady = (primaryAssets ?? []).filter((e) =>
  ['available', 'running', 'standby'].includes(e.status)
).length;

const primaryReadiness =
  primaryTotal > 0
    ? Math.round((primaryReady / primaryTotal) * 100)
    : 100;

const secondaryTotal = secondaryAssets?.length ?? 0;
const secondaryReady = (secondaryAssets ?? []).filter((e) =>
  ['available', 'running', 'standby'].includes(e.status)
).length;

const secondaryReadiness =
  secondaryTotal > 0
    ? Math.round((secondaryReady / secondaryTotal) * 100)
    : 100;
  const statusOrder = ['available', 'running', 'standby', 'under_maintenance', 'fault', 'out_of_service'];
  const statusData = statusOrder.map((status) => ({
    status,
    count: (statusCounts ?? []).filter((e) => e.status === status).length,
  }));

  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const priorityData = priorityOrder.map((priority) => ({
    priority,
    count: (openFaults ?? []).filter((f) => f.priority === priority).length,
  }));

  const lowStockCount = (spareParts ?? []).filter(
    (p: any) => Number(p.quantity_available ?? 0) <= Number(p.minimum_stock ?? 0)
  ).length;
  const expiredWarrantyCount = (spareParts ?? []).filter(
    (p: any) => p.warranty_end_date && p.warranty_end_date < today
  ).length;
  const expiringWarrantyCount = (spareParts ?? []).filter(
    (p: any) => p.warranty_end_date && p.warranty_end_date >= today && p.warranty_end_date <= in30Str
  ).length;

  // في حال جدول الجدولة موجود نستخدمه، وإلا نرجع لسجلات الصيانة القديمة.
  const overdueRows: any[] = schedules !== null ? schedules ?? [] : maintenanceFallback ?? [];
  const overdueMaintenanceCount = overdueRows.length;

  // PM Completion % للشهر الحالي:
  // المكتمل ÷ جميع أعمال الصيانة الوقائية المستحقة حتى اليوم، مع استبعاد الملغاة.
  const pmDueRecords = (pmRecords ?? []).filter((record: any) => record.status !== 'cancelled');
  const pmDueCount = pmDueRecords.length;
  const pmCompletedCount = pmDueRecords.filter((record: any) => record.status === 'completed').length;
  const pmCompletion =
    pmDueCount > 0
      ? Math.round((pmCompletedCount / pmDueCount) * 100)
      : null;

  // Corrective Maintenance Completion % للشهر الحالي:
  // المكتمل ÷ جميع أعمال الصيانة العلاجية المسجلة، مع استبعاد الملغاة.
  const correctiveDueRecords = (correctiveRecords ?? []).filter(
    (record: any) => record.status !== 'cancelled'
  );
  const correctiveDueCount = correctiveDueRecords.length;
  const correctiveCompletedCount = correctiveDueRecords.filter(
    (record: any) => record.status === 'completed'
  ).length;
  const correctiveCompletion =
    correctiveDueCount > 0
      ? Math.round((correctiveCompletedCount / correctiveDueCount) * 100)
      : null;

  // MTTR للشهر الحالي:
  // متوسط وقت الإصلاح الفعلي للأعطال المغلقة التي لديها repair_time_minutes.
  const repairDurations = (repairedFaults ?? [])
    .map((fault: any) => Number(fault.repair_time_minutes))
    .filter((minutes: number) => Number.isFinite(minutes) && minutes >= 0);

  const mttrMinutes =
    repairDurations.length > 0
      ? repairDurations.reduce((sum: number, minutes: number) => sum + minutes, 0) / repairDurations.length
      : null;

  const mttrHours =
    mttrMinutes === null
      ? null
      : Math.round((mttrMinutes / 60) * 10) / 10;

  // Repeated Faults:
  // نعتبر المعدة ذات أعطال متكررة إذا سُجل عليها عطلان أو أكثر خلال آخر 90 يوم.
  const faultCountByEquipment = new Map<string, number>();
  for (const fault of repeatedFaultRecords ?? []) {
    if (!fault.equipment_id) continue;
    faultCountByEquipment.set(
      fault.equipment_id,
      (faultCountByEquipment.get(fault.equipment_id) ?? 0) + 1
    );
  }

  const repeatedFaultAssetsCount = Array.from(faultCountByEquipment.values()).filter(
    (count) => count >= 2
  ).length;

  // Monthly Fault Trend — آخر 6 أشهر بما فيها الشهر الحالي.
  const monthlyFaultCountMap = new Map<string, number>();
  for (const fault of monthlyFaultRecords ?? []) {
    if (!fault.reported_at) continue;
    const faultDate = new Date(fault.reported_at);
    const key = `${faultDate.getFullYear()}-${String(faultDate.getMonth() + 1).padStart(2, '0')}`;
    monthlyFaultCountMap.set(key, (monthlyFaultCountMap.get(key) ?? 0) + 1);
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

  const monthlyFaultTrendData = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth() - 5 + index,
      1
    );
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    return {
      month: monthNamesAr[monthDate.getMonth()],
      count: monthlyFaultCountMap.get(key) ?? 0,
    };
  });

  const faultByBuilding = new Map<string, { total: number; critical: number }>();
  for (const fault of openFaults ?? []) {
    const current = faultByBuilding.get(fault.building_id) ?? { total: 0, critical: 0 };
    current.total += 1;
    if (fault.priority === 'critical' || fault.priority === 'high') current.critical += 1;
    faultByBuilding.set(fault.building_id, current);
  }

  const overdueByBuilding = new Map<string, number>();
  for (const row of overdueRows) {
    if (!row.building_id) continue;
    overdueByBuilding.set(row.building_id, (overdueByBuilding.get(row.building_id) ?? 0) + 1);
  }

  const nextTestByBuilding = new Map<string, { date: string; days: number }>();
  for (const test of upcomingTests ?? []) {
    if (!test.building_id || !test.next_test_date) continue;
    const days = daysFromToday(test.next_test_date, todayDate);
    const current = nextTestByBuilding.get(test.building_id);
    if (!current || days < current.days) nextTestByBuilding.set(test.building_id, { date: test.next_test_date, days });
  }

  const prioritizedBuildings = (buildings ?? [])
    .map((building) => {
      const faults = faultByBuilding.get(building.id) ?? { total: 0, critical: 0 };
      const overdue = overdueByBuilding.get(building.id) ?? 0;
      const nextTest = nextTestByBuilding.get(building.id);
      const nearTest = nextTest && nextTest.days <= 7 ? 1 : 0;
      const statusBonus = building.status === 'fault' ? 25 : building.status === 'watch' ? 8 : 0;
      const score = faults.critical * 100 + faults.total * 40 + overdue * 20 + nearTest * 5 + statusBonus;

      let badge = 'جاهز';
      let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (faults.total > 0) {
        badge = 'عطل مفتوح';
        badgeClass = 'bg-red-50 text-red-700 border-red-200';
      } else if (overdue > 0) {
        badge = 'صيانة متأخرة';
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (nearTest) {
        badge = 'اختبار قريب';
        badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
      } else if (building.status === 'watch') {
        badge = 'يحتاج متابعة';
        badgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
      }

      return { ...building, faults, overdue, nextTest, score, badge, badgeClass };
    })
    .sort((a, b) => b.score - a.score || String(a.building_number).localeCompare(String(b.building_number), 'ar', { numeric: true }))
    .slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
       <h1 className="text-xl font-bold text-gray-900">
  {CURRENT_DASHBOARD_CONFIG.title}
</h1>

<p className="text-sm text-gray-500">
  {CURRENT_DASHBOARD_CONFIG.subtitle}
</p>
      </div>

      {/* الصف الأول: الحالة التشغيلية */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="إجمالي المباني" value={buildingsCount ?? 0} icon={Building2} />
        <StatCard
  label={CURRENT_DASHBOARD_CONFIG.primaryLabel}
  value={primaryTotal}
  icon={Zap}
  tone="warning"
/>

<StatCard
  label={CURRENT_DASHBOARD_CONFIG.secondaryLabel}
  value={secondaryTotal}
  icon={BatteryCharging}
  tone="success"
/>
        <StatCard label="الأعطال المفتوحة" value={openFaults?.length ?? 0} icon={AlertTriangle} tone="danger" />
        <StatCard
          label="معدات بأعطال متكررة (90 يوم)"
          value={repeatedFaultAssetsCount}
          icon={RefreshCcw}
          tone={
            repeatedFaultAssetsCount === 0
              ? 'success'
              : repeatedFaultAssetsCount <= 2
                ? 'warning'
                : 'danger'
          }
        />
        <StatCard label="الصيانة المتأخرة" value={overdueMaintenanceCount} icon={Wrench} tone={overdueMaintenanceCount > 0 ? 'warning' : 'success'} />
      </div>

      {/* الصف الثاني: مؤشرات الأداء KPI */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
  label={CURRENT_DASHBOARD_CONFIG.primaryReadinessLabel}
  value={primaryReadiness}
  suffix="%"
  icon={Gauge}
  tone={
    primaryReadiness >= 90
      ? 'success'
      : primaryReadiness >= 75
        ? 'warning'
        : 'danger'
  }
/>

<StatCard
  label={CURRENT_DASHBOARD_CONFIG.secondaryReadinessLabel}
  value={secondaryReadiness}
  suffix="%"
  icon={ShieldCheck}
  tone={
    secondaryReadiness >= 90
      ? 'success'
      : secondaryReadiness >= 75
        ? 'warning'
        : 'danger'
  }
/>

        <StatCard
          label="إنجاز الصيانة الوقائية"
          value={pmCompletion ?? '—'}
          suffix={pmCompletion === null ? undefined : '%'}
          icon={ClipboardCheck}
          tone={
            pmCompletion === null
              ? 'default'
              : pmCompletion >= 90
                ? 'success'
                : pmCompletion >= 75
                  ? 'warning'
                  : 'danger'
          }
        />

        <StatCard
          label="إنجاز الصيانة العلاجية"
          value={correctiveCompletion ?? '—'}
          suffix={correctiveCompletion === null ? undefined : '%'}
          icon={Wrench}
          tone={
            correctiveCompletion === null
              ? 'default'
              : correctiveCompletion >= 90
                ? 'success'
                : correctiveCompletion >= 75
                  ? 'warning'
                  : 'danger'
          }
        />

        <StatCard
          label="متوسط وقت الإصلاح (MTTR)"
          value={mttrHours ?? '—'}
          suffix={mttrHours === null ? undefined : ' ساعة'}
          icon={Gauge}
        />
      </div>

      {/* الصف الثالث: المخزون والضمان */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="قطع غيار منخفضة المخزون"
          value={lowStockCount}
          icon={PackageX}
          tone={lowStockCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="ضمانات منتهية"
          value={expiredWarrantyCount}
          icon={ShieldAlert}
          tone={expiredWarrantyCount > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="ضمانات تنتهي خلال 30 يوم"
          value={expiringWarrantyCount}
          icon={CalendarClock}
          tone={expiringWarrantyCount > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* الرسوم */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-bold text-gray-900">الأعطال المفتوحة حسب الأولوية</h2>
          <FaultPriorityChart data={priorityData} />
        </div>
        <div className="card">
          <h2 className="mb-2 font-bold text-gray-900">توزيع حالة المعدات</h2>
          <EquipmentStatusChart data={statusData} />
        </div>
      </div>

      <div className="card">
        <div className="mb-3">
          <h2 className="font-bold text-gray-900">اتجاه الأعطال الشهري</h2>
          <p className="mt-0.5 text-xs text-gray-400">إجمالي الأعطال المسجلة خلال آخر 6 أشهر</p>
        </div>
        <MonthlyFaultTrendChart data={monthlyFaultTrendData} />
      </div>

      {/* المباني حسب الأولوية + الاختبارات القادمة */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">المباني حسب الأولوية</h2>
              <p className="mt-0.5 text-xs text-gray-400">الأعطال أولًا، ثم الصيانة المتأخرة، ثم الاختبارات القريبة</p>
            </div>
            <Link href="/buildings" className="text-sm font-medium text-primary-600 hover:underline">عرض جميع المباني</Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-2 py-2 text-start font-medium">المبنى</th>
                  <th className="px-2 py-2 text-center font-medium">الحالة</th>
                  <th className="px-2 py-2 text-center font-medium">الأعطال المفتوحة</th>
                  <th className="px-2 py-2 text-center font-medium">الصيانة المتأخرة</th>
                  <th className="px-2 py-2 text-center font-medium">الاختبار القادم</th>
                </tr>
              </thead>
              <tbody>
                {prioritizedBuildings.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
                    <td className="px-2 py-3">
                      <Link href={`/buildings/${b.id}`} className="flex items-center gap-2 font-medium text-gray-800 hover:text-primary-600">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Building2 className="h-4 w-4" /></span>
                        <span>
                          <span className="block">{b.name}</span>
                          <span className="block text-xs font-normal text-gray-400">مبنى رقم {b.building_number}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${b.badgeClass}`}>{b.badge}</span></td>
                    <td className={`px-2 py-3 text-center font-semibold ${b.faults.total > 0 ? 'text-red-600' : 'text-gray-500'}`}>{b.faults.total}</td>
                    <td className={`px-2 py-3 text-center font-semibold ${b.overdue > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{b.overdue}</td>
                    <td className="px-2 py-3 text-center text-gray-600">{b.nextTest ? remainingLabel(b.nextTest.days) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">الاختبارات القادمة</h2>
              <p className="mt-0.5 text-xs text-gray-400">خلال الـ 30 يوم القادمة</p>
            </div>
            <Link href="/tests" className="text-sm font-medium text-primary-600 hover:underline">عرض الكل</Link>
          </div>

          {(upcomingTests ?? []).length === 0 ? (
            <div className="py-10 text-center">
              <CalendarClock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">لا توجد اختبارات مجدولة خلال 30 يوم</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(upcomingTests ?? []).slice(0, 6).map((test: any) => {
                const days = daysFromToday(test.next_test_date, todayDate);
                return (
                  <Link key={test.id} href="/tests" className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                        <p className="truncate text-sm font-medium text-gray-800">{test.buildings?.name ?? 'مبنى غير محدد'}</p>
                      </div>
                      <p className="mt-1 truncate ps-6 text-xs text-gray-500">{TEST_TYPE_LABELS[test.test_type] ?? test.test_type}{test.equipment?.name ? ` — ${test.equipment.name}` : ''}</p>
                    </div>
                    <span className={`ms-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${days <= 3 ? 'bg-red-50 text-red-700' : days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                      {remainingLabel(days)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
