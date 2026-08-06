import { createClient } from '@/lib/supabase/server';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { EquipmentStatusChart, FaultPriorityChart } from '@/components/dashboard/DashboardCharts';
import { BUILDING_STATUS_LABELS } from '@/types/database.types';
import {
  Building2, Zap, BatteryCharging, ToggleRight, Boxes,
  AlertTriangle, Wrench, ClipboardCheck, Gauge,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  const [
    { count: buildingsCount },
    { count: generatorsCount },
    { count: upsCount },
    { count: atsCount },
    { count: transformersCount },
    { count: openFaultsCount },
    { count: underMaintenanceCount },
    { data: buildings },
    { data: criticalEquipment },
    { data: openFaultsByPriority },
    { data: statusCounts },
  ] = await Promise.all([
    supabase.from('buildings').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('type', 'generator').is('deleted_at', null),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('type', 'ups').is('deleted_at', null),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('type', 'ats').is('deleted_at', null),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('type', 'transformer').is('deleted_at', null),
    supabase.from('faults').select('*', { count: 'exact', head: true }).in('status', ['open', 'assigned', 'in_progress', 'waiting_for_spare_parts']),
    supabase.from('equipment').select('*', { count: 'exact', head: true }).eq('status', 'under_maintenance').is('deleted_at', null),
    supabase.from('buildings').select('id, building_number, name, status').is('deleted_at', null).order('building_number').limit(6),
    supabase.from('equipment').select('status').eq('criticality', 'critical').is('deleted_at', null),
    supabase.from('faults').select('priority').in('status', ['open', 'assigned', 'in_progress', 'waiting_for_spare_parts']),
    supabase.from('equipment').select('status').is('deleted_at', null),
  ]);

  const faultBuildings = (buildings ?? []).filter((b) => b.status === 'fault');

  const criticalTotal = criticalEquipment?.length ?? 0;
  const criticalReady = (criticalEquipment ?? []).filter((e) =>
    ['available', 'running', 'standby'].includes(e.status)
  ).length;
  const readinessPct = criticalTotal > 0 ? Math.round((criticalReady / criticalTotal) * 100) : 100;

  const statusOrder = ['available', 'running', 'standby', 'under_maintenance', 'fault', 'out_of_service'];
  const statusData = statusOrder.map((status) => ({
    status,
    count: (statusCounts ?? []).filter((e) => e.status === status).length,
  }));

  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const priorityData = priorityOrder.map((priority) => ({
    priority,
    count: (openFaultsByPriority ?? []).filter((f) => f.priority === priority).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">لوحة التحكم</h1>
        <p className="text-sm text-gray-500">نظرة عامة على حالة المباني والمعدات والصيانة</p>
      </div>

      {/* المؤشرات الرئيسية */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="إجمالي المباني" value={buildingsCount ?? 0} icon={Building2} />
        <StatCard label="المولدات" value={generatorsCount ?? 0} icon={Zap} tone="warning" />
        <StatCard label="أجهزة UPS" value={upsCount ?? 0} icon={BatteryCharging} tone="success" />
        <StatCard label="أجهزة ATS" value={atsCount ?? 0} icon={ToggleRight} />
        <StatCard label="المحولات" value={transformersCount ?? 0} icon={Boxes} />
        <StatCard label="الأعطال المفتوحة" value={openFaultsCount ?? 0} icon={AlertTriangle} tone="danger" />
        <StatCard label="معدات تحت الصيانة" value={underMaintenanceCount ?? 0} icon={Wrench} tone="warning" />
        <StatCard label="جاهزية المعدات الحرجة" value={readinessPct} suffix="%" icon={Gauge} tone={readinessPct >= 90 ? 'success' : readinessPct >= 70 ? 'warning' : 'danger'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-bold text-gray-900">توزيع حالة المعدات</h2>
          <EquipmentStatusChart data={statusData} />
        </div>
        <div className="card">
          <h2 className="mb-2 font-bold text-gray-900">الأعطال المفتوحة حسب الأولوية</h2>
          <FaultPriorityChart data={priorityData} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* أحدث المباني */}
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">المباني</h2>
            <Link href="/buildings" className="text-sm font-medium text-primary-600 hover:underline">
              عرض الكل
            </Link>
          </div>
          <div className="space-y-2">
            {(buildings ?? []).map((b) => (
              <Link
                key={b.id}
                href={`/buildings/${b.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{b.name}</p>
                    <p className="text-xs text-gray-400">مبنى رقم {b.building_number}</p>
                  </div>
                </div>
                <StatusBadge
                  label={BUILDING_STATUS_LABELS[b.status as keyof typeof BUILDING_STATUS_LABELS]}
                  tone={b.status}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* المباني ذات الأعطال */}
        <div className="card">
          <h2 className="mb-4 font-bold text-gray-900">أكثر المباني بها أعطال</h2>
          {faultBuildings.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد مبانٍ بها أعطال حاليًا</p>
          ) : (
            <div className="space-y-3">
              {faultBuildings.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-gray-700">{b.name}</span>
                  </div>
                  <Link href={`/buildings/${b.id}`} className="text-xs font-medium text-primary-600 hover:underline">
                    التفاصيل
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-xs text-primary-700">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            جميع الاختبارات القادمة موثقة في صفحة الاختبارات
          </div>
        </div>
      </div>
    </div>
  );
}
