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
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Gauge,
  PackageX,
  RefreshCcw,
  ShieldAlert,
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
  if (days < 0) return `متأخر ${Math.abs(days)} ${Math.abs(days) === 1 ? 'يوم' : 'أيام'}`;
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  return `بعد ${days} أيام`;
}

function ageLabel(dateString: string, today: Date) {
  const days = Math.max(0, -daysFromToday(dateString.slice(0, 10), today));
  if (days === 0) return 'اليوم';
  if (days === 1) return 'منذ يوم';
  return `منذ ${days} أيام`;
}

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  generator: 'المولدات',
  ups: 'أجهزة UPS',
  ats: 'لوحات ATS',
  transformer: 'المحولات',
  switchgear: 'السويتش قير',
  rmu: 'وحدات RMU',
};

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
  const in7 = new Date(todayDate);
  in7.setDate(in7.getDate() + 7);
  const in7Str = dateOnly(in7);

  const oneYearAgo = new Date(todayDate);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const [
    { count: buildingsCount },
    { data: primaryAssets },
    { data: secondaryAssets },
    { data: openFaults },
    { data: statusCounts },
    { data: buildings },
    { data: spareParts },
    { data: schedules },
    { data: maintenanceFallback },
    { data: pmRecords },
    { data: correctiveRecords },
    { data: repairedFaults },
    { data: repeatedFaultRecords },
    { data: monthlyFaultRecords },
    { data: weeklyMaintenance },
    { data: testFollowUpRecords },
    { data: profiles },
    { data: scheduledTests },
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
      .select('id,fault_number,building_id,equipment_id,priority,status,description,reported_at,responsible_engineer,responsible_technician,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .in('status', OPEN_FAULT_STATUSES),

    supabase
      .from('equipment')
      .select('id,type,status')
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
      .from('maintenance_schedules')
      .select('id,title,building_id,equipment_id,next_due_date,is_active,engineer_name,technician_name,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .lt('next_due_date', today),

    supabase
      .from('maintenance_records')
      .select('id,maintenance_number,building_id,equipment_id,next_maintenance_date,engineer_name,technician_name,buildings(name,building_number),equipment(name,asset_id)')
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

    // أعمال الصيانة المستحقة خلال الأسبوع القادم.
    supabase
      .from('maintenance_schedules')
      .select('id,title,building_id,equipment_id,next_due_date,engineer_name,technician_name,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .gte('next_due_date', today)
      .lte('next_due_date', in7Str)
      .order('next_due_date', { ascending: true }),

    // آخر سنة تكفي لتحديد الملاحظات التي لم يتبعها اختبار ناجح أحدث.
    supabase
      .from('tests')
      .select('id,test_number,test_type,test_date,result,notes,recommendations,responsible_person,building_id,equipment_id,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .eq('status', 'completed')
      .gte('test_date', dateOnly(oneYearAgo))
      .order('test_date', { ascending: false }),

    supabase
      .from('profiles')
      .select('id,full_name')
      .eq('is_active', true),

    supabase
      .from('tests')
      .select('id,test_number,test_type,test_date,status,responsible_person,building_id,equipment_id,buildings(name,building_number),equipment(name,asset_id)')
      .eq('department_id', departmentId)
      .eq('status', 'scheduled')
      .lte('test_date', in30Str)
      .order('test_date', { ascending: true }),
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
  for (const test of scheduledTests ?? []) {
    if (!test.building_id || !test.test_date) continue;
    const days = daysFromToday(test.test_date, todayDate);
    const current = nextTestByBuilding.get(test.building_id);
    if (!current || days < current.days) nextTestByBuilding.set(test.building_id, { date: test.test_date, days });
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

  const profileNameById = new Map(
    (profiles ?? []).map((profile: any) => [profile.id, profile.full_name])
  );

  const pendingTestFollowUps: any[] = [];
  const latestTestByTarget = new Set<string>();
  for (const test of testFollowUpRecords ?? []) {
    const target = test.equipment_id
      ? `equipment:${test.equipment_id}:${test.test_type}`
      : `building:${test.building_id}:${test.test_type}`;
    if (latestTestByTarget.has(target)) continue;
    latestTestByTarget.add(target);
    if (test.result === 'failed' || test.result === 'passed_with_observation') {
      pendingTestFollowUps.push(test);
    }
  }

  const faultActions = (openFaults ?? []).map((fault: any) => ({
    id: `fault-${fault.id}`,
    kind: 'عطل',
    title: `${fault.fault_number} — ${fault.description}`,
    building: fault.buildings?.name ?? 'مبنى غير محدد',
    equipment: fault.equipment?.name ?? 'بدون تحديد معدة',
    responsible:
      profileNameById.get(fault.responsible_engineer) ??
      profileNameById.get(fault.responsible_technician) ??
      'غير مسند',
    timing: ageLabel(fault.reported_at, todayDate),
    href: '/faults',
    score:
      (fault.priority === 'critical' ? 400 : fault.priority === 'high' ? 300 : 150) +
      Math.max(0, -daysFromToday(fault.reported_at.slice(0, 10), todayDate)),
    tone: fault.priority === 'critical' ? 'critical' : fault.priority === 'high' ? 'high' : 'medium',
  }));

  const overdueActions = overdueRows.map((row: any) => {
    const dueDate = row.next_due_date ?? row.next_maintenance_date;
    return {
      id: `maintenance-${row.id}`,
      kind: 'صيانة',
      title: row.title ?? row.maintenance_number ?? 'صيانة مستحقة',
      building: row.buildings?.name ?? 'مبنى غير محدد',
      equipment: row.equipment?.name ?? 'بدون تحديد معدة',
      responsible: row.engineer_name ?? row.technician_name ?? 'غير مسند',
      timing: dueDate ? remainingLabel(daysFromToday(dueDate, todayDate)) : 'متأخرة',
      href: '/maintenance',
      score: 250 + (dueDate ? Math.max(0, -daysFromToday(dueDate, todayDate)) : 0),
      tone: 'high',
    };
  });

  const testActions = pendingTestFollowUps.map((test: any) => ({
    id: `test-${test.id}`,
    kind: 'اختبار',
    title: `${test.test_number} — ${TEST_TYPE_LABELS[test.test_type] ?? test.test_type}`,
    building: test.buildings?.name ?? 'مبنى غير محدد',
    equipment: test.equipment?.name ?? 'بدون تحديد معدة',
    responsible: test.responsible_person ?? 'غير مسند',
    timing: ageLabel(test.test_date, todayDate),
    href: '/tests',
    score: test.result === 'failed' ? 350 : 220,
    tone: test.result === 'failed' ? 'critical' : 'medium',
  }));

  const overdueTestActions = (scheduledTests ?? [])
    .filter((test: any) => test.test_date < today)
    .map((test: any) => ({
      id: `scheduled-test-${test.id}`,
      kind: 'اختبار متأخر',
      title: `${test.test_number} — ${TEST_TYPE_LABELS[test.test_type] ?? test.test_type}`,
      building: test.buildings?.name ?? 'مبنى غير محدد',
      equipment: test.equipment?.name ?? 'بدون تحديد معدة',
      responsible: test.responsible_person ?? 'غير مسند',
      timing: remainingLabel(daysFromToday(test.test_date, todayDate)),
      href: '/tests',
      score: 300 + Math.max(0, -daysFromToday(test.test_date, todayDate)),
      tone: 'high',
    }));

  const actionItems = [...faultActions, ...overdueActions, ...testActions, ...overdueTestActions]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const weeklyWork = [
    ...(weeklyMaintenance ?? []).map((item: any) => ({
      id: `maintenance-${item.id}`,
      date: item.next_due_date,
      type: 'صيانة',
      title: item.title ?? 'صيانة دورية',
      building: item.buildings?.name ?? 'مبنى غير محدد',
      equipment: item.equipment?.name ?? 'بدون تحديد معدة',
      responsible: item.engineer_name ?? item.technician_name ?? 'غير مسند',
      href: '/maintenance',
    })),
    ...(scheduledTests ?? [])
      .filter((item: any) => item.test_date >= today && item.test_date <= in7Str)
      .map((item: any) => ({
        id: `test-${item.id}`,
        date: item.test_date,
        type: 'اختبار',
        title: TEST_TYPE_LABELS[item.test_type] ?? item.test_type,
        building: item.buildings?.name ?? 'مبنى غير محدد',
        equipment: item.equipment?.name ?? 'بدون تحديد معدة',
        responsible: item.responsible_person ?? 'غير مسند',
        href: '/tests',
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const electricalSystemTypes = ['generator', 'ups', 'ats', 'transformer', 'switchgear', 'rmu'];
  const systemSummary = electricalSystemTypes.map((type) => {
    const assets = (statusCounts ?? []).filter((asset: any) => asset.type === type);
    const ready = assets.filter((asset: any) =>
      ['available', 'running', 'standby'].includes(asset.status)
    ).length;
    const attention = assets.length - ready;
    return {
      type,
      label: EQUIPMENT_TYPE_LABELS[type],
      total: assets.length,
      ready,
      attention,
      readiness: assets.length > 0 ? Math.round((ready / assets.length) * 100) : null,
    };
  }).filter((system) => system.total > 0);

  const criticalOpenFaults = (openFaults ?? []).filter(
    (fault: any) => fault.priority === 'critical'
  ).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{CURRENT_DASHBOARD_CONFIG.title}</h1>
        <p className="text-sm text-gray-500">متابعة الحالة التشغيلية والأعمال التي تحتاج إجراء</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
          <span>المباني: <strong className="text-gray-800">{buildingsCount ?? 0}</strong></span>
          <span>{CURRENT_DASHBOARD_CONFIG.primaryLabel}: <strong className="text-gray-800">{primaryTotal}</strong></span>
          <span>{CURRENT_DASHBOARD_CONFIG.secondaryLabel}: <strong className="text-gray-800">{secondaryTotal}</strong></span>
        </div>
      </div>

      <section aria-label="ملخص الحالة">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="الأعطال الحرجة" value={criticalOpenFaults} icon={ShieldAlert} tone={criticalOpenFaults > 0 ? 'danger' : 'success'} />
          <StatCard label="الأعطال المفتوحة" value={openFaults?.length ?? 0} icon={AlertTriangle} tone={(openFaults?.length ?? 0) > 0 ? 'danger' : 'success'} />
          <StatCard label="الصيانة المتأخرة" value={overdueMaintenanceCount} icon={Wrench} tone={overdueMaintenanceCount > 0 ? 'warning' : 'success'} />
          <StatCard label="ملاحظات اختبارات مفتوحة" value={pendingTestFollowUps.length} icon={ClipboardCheck} tone={pendingTestFollowUps.length > 0 ? 'warning' : 'success'} />
          <StatCard label="إنجاز الوقائية — الشهر" value={pmCompletion ?? '—'} suffix={pmCompletion === null ? undefined : '%'} icon={Gauge} tone={pmCompletion === null ? 'default' : pmCompletion >= 90 ? 'success' : pmCompletion >= 75 ? 'warning' : 'danger'} />
        </div>
        <p className="mt-2 text-xs text-gray-500">الأعطال والصيانة والملاحظات حسب الحالة الحالية، وإنجاز الوقائية من بداية الشهر حتى اليوم.</p>
      </section>

      <section className="card" aria-labelledby="actions-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="actions-title" className="font-bold text-gray-900">يحتاج إجراء</h2>
            <p className="mt-0.5 text-xs text-gray-500">الأعطال والصيانة المتأخرة وملاحظات الاختبارات مرتبة حسب الأولوية</p>
          </div>
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700">{faultActions.length + overdueActions.length + testActions.length + overdueTestActions.length}</span>
        </div>
        {actionItems.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />لا توجد أعمال عاجلة حاليًا</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b text-xs text-gray-500"><th className="px-3 py-2 text-start">النوع</th><th className="px-3 py-2 text-start">الإجراء</th><th className="px-3 py-2 text-start">الموقع / المعدة</th><th className="px-3 py-2 text-start">المسؤول</th><th className="px-3 py-2 text-start">العمر / التأخير</th></tr></thead>
              <tbody>{actionItems.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.tone === 'critical' ? 'bg-red-100 text-red-800' : item.tone === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>{item.kind}</span></td>
                  <td className="max-w-md px-3 py-3"><Link href={item.href} className="font-medium text-gray-900 hover:text-primary-600">{item.title}</Link></td>
                  <td className="px-3 py-3 text-gray-600">{item.building}<span className="block text-xs text-gray-400">{item.equipment}</span></td>
                  <td className={`px-3 py-3 ${item.responsible === 'غير مسند' ? 'font-medium text-red-600' : 'text-gray-700'}`}>{item.responsible}</td>
                  <td className="px-3 py-3 font-medium text-gray-700">{item.timing}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {faultActions.length + overdueActions.length + testActions.length + overdueTestActions.length > actionItems.length && <p className="mt-3 text-xs text-gray-400">يتم عرض أعلى 12 أولوية. افتح صفحة النوع لعرض البقية.</p>}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">المباني حسب الأولوية</h2><p className="text-xs text-gray-500">الأعطال أولًا، ثم الصيانة المتأخرة والاختبارات القريبة</p></div><Link href="/buildings" className="text-sm font-medium text-primary-600 hover:underline">عرض الكل</Link></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-xs text-gray-500"><th className="px-2 py-2 text-start">المبنى</th><th className="px-2 py-2 text-center">الحالة</th><th className="px-2 py-2 text-center">الأعطال</th><th className="px-2 py-2 text-center">المتأخرة</th><th className="px-2 py-2 text-center">الاختبار القادم</th></tr></thead>
            <tbody>{prioritizedBuildings.map((building) => <tr key={building.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50"><td className="px-2 py-3"><Link href={`/buildings/${building.id}`} className="font-medium text-gray-900 hover:text-primary-600">{building.name}<span className="block text-xs font-normal text-gray-400">مبنى رقم {building.building_number}</span></Link></td><td className="px-2 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${building.badgeClass}`}>{building.badge}</span></td><td className="px-2 py-3 text-center font-semibold">{building.faults.total}</td><td className="px-2 py-3 text-center font-semibold">{building.overdue}</td><td className="px-2 py-3 text-center">{building.nextTest ? remainingLabel(building.nextTest.days) : '—'}</td></tr>)}</tbody>
          </table></div>
        </section>

        <section className="card xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">أعمال الأسبوع</h2><p className="text-xs text-gray-500">الصيانة والاختبارات خلال 7 أيام</p></div><CalendarClock className="h-5 w-5 text-gray-400" /></div>
          {weeklyWork.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">لا توجد أعمال مجدولة هذا الأسبوع</p> : <div className="space-y-2">{weeklyWork.map((item) => <Link key={item.id} href={item.href} className="block rounded-xl border border-gray-100 p-3 hover:bg-gray-50"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{item.title}</p><p className="mt-1 truncate text-xs text-gray-500">{item.building} — {item.equipment}</p><p className="mt-1 text-xs text-gray-400">المسؤول: {item.responsible}</p></div><div className="shrink-0 text-left"><span className="block rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{item.type}</span><span className="mt-1 block text-xs text-gray-500">{remainingLabel(daysFromToday(item.date, todayDate))}</span></div></div></Link>)}</div>}
        </section>
      </div>

      <section className="card">
        <div className="mb-4"><h2 className="font-bold text-gray-900">حالة الأنظمة الكهربائية</h2><p className="text-xs text-gray-500">ملخص الجاهزية حسب نوع النظام</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{systemSummary.map((system) => <Link key={system.type} href={`/equipment?type=${system.type}`} className="rounded-xl border border-gray-100 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"><div className="flex items-center justify-between"><h3 className="font-medium text-gray-900">{system.label}</h3><span className={`text-xl font-bold ${system.attention > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{system.readiness === null ? '—' : `${system.readiness}%`}</span></div><div className="mt-3 flex gap-4 text-xs text-gray-500"><span>الإجمالي: {system.total}</span><span className="text-emerald-700">جاهز: {system.ready}</span><span className={system.attention > 0 ? 'font-medium text-amber-700' : ''}>يحتاج متابعة: {system.attention}</span></div></Link>)}</div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">متابعة نتائج الاختبارات</h2><p className="text-xs text-gray-500">تبقى الملاحظة مفتوحة حتى تسجيل اختبار أحدث ناجح لنفس المعدة ونوع الاختبار</p></div><Link href="/tests" className="text-sm font-medium text-primary-600 hover:underline">سجل الاختبارات</Link></div>
        {pendingTestFollowUps.length === 0 ? <p className="py-8 text-center text-sm text-emerald-700">لا توجد نتائج اختبار معلقة</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="px-3 py-2 text-start">الاختبار</th><th className="px-3 py-2 text-start">المبنى / المعدة</th><th className="px-3 py-2 text-start">النتيجة</th><th className="px-3 py-2 text-start">الملاحظة / التوصية</th><th className="px-3 py-2 text-start">المسؤول</th></tr></thead><tbody>{pendingTestFollowUps.slice(0, 10).map((test: any) => <tr key={test.id} className="border-b border-gray-100 last:border-0"><td className="px-3 py-3 font-medium">{test.test_number}<span className="block text-xs font-normal text-gray-400">{test.test_date}</span></td><td className="px-3 py-3 text-gray-600">{test.buildings?.name ?? '—'}<span className="block text-xs text-gray-400">{test.equipment?.name ?? 'بدون تحديد معدة'}</span></td><td className={`px-3 py-3 font-medium ${test.result === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{test.result === 'failed' ? 'فاشل' : 'ناجح مع ملاحظة'}</td><td className="max-w-md px-3 py-3 text-gray-600">{test.recommendations ?? test.notes ?? 'لم تُسجل توصية'}</td><td className="px-3 py-3">{test.responsible_person ?? 'غير مسند'}</td></tr>)}</tbody></table></div>}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={CURRENT_DASHBOARD_CONFIG.primaryReadinessLabel} value={primaryReadiness} suffix="%" icon={Zap} tone={primaryReadiness >= 90 ? 'success' : primaryReadiness >= 75 ? 'warning' : 'danger'} />
        <StatCard label={CURRENT_DASHBOARD_CONFIG.secondaryReadinessLabel} value={secondaryReadiness} suffix="%" icon={BatteryCharging} tone={secondaryReadiness >= 90 ? 'success' : secondaryReadiness >= 75 ? 'warning' : 'danger'} />
        <StatCard label="إنجاز العلاجية — الشهر" value={correctiveCompletion ?? '—'} suffix={correctiveCompletion === null ? undefined : '%'} icon={Wrench} tone={correctiveCompletion === null ? 'default' : correctiveCompletion >= 90 ? 'success' : correctiveCompletion >= 75 ? 'warning' : 'danger'} />
        <StatCard label="متوسط الإصلاح — الشهر" value={mttrHours ?? '—'} suffix={mttrHours === null ? undefined : ' ساعة'} icon={Clock3} />
        <StatCard label="معدات متكررة الأعطال (90 يوم)" value={repeatedFaultAssetsCount} icon={RefreshCcw} tone={repeatedFaultAssetsCount === 0 ? 'success' : repeatedFaultAssetsCount <= 2 ? 'warning' : 'danger'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><div className="card"><h2 className="mb-2 font-bold text-gray-900">الأعطال المفتوحة حسب الأولوية</h2><FaultPriorityChart data={priorityData} /></div><div className="card"><h2 className="mb-2 font-bold text-gray-900">توزيع حالة المعدات</h2><EquipmentStatusChart data={statusData} /></div></div>
      <div className="card"><div className="mb-3"><h2 className="font-bold text-gray-900">اتجاه الأعطال الشهري</h2><p className="text-xs text-gray-500">إجمالي الأعطال المسجلة خلال آخر 6 أشهر</p></div><MonthlyFaultTrendChart data={monthlyFaultTrendData} /></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="قطع غيار منخفضة المخزون" value={lowStockCount} icon={PackageX} tone={lowStockCount > 0 ? 'warning' : 'success'} />
        <StatCard label="ضمانات منتهية" value={expiredWarrantyCount} icon={ShieldAlert} tone={expiredWarrantyCount > 0 ? 'danger' : 'success'} />
        <StatCard label="ضمانات تنتهي خلال 30 يوم" value={expiringWarrantyCount} icon={CalendarClock} tone={expiringWarrantyCount > 0 ? 'warning' : 'success'} />
      </div>
    </div>
  );
}
