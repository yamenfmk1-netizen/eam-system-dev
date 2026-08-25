'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import { Loader2, AlertTriangle, Wrench, ClipboardCheck, Package, Bell } from 'lucide-react';

interface AlertItem {
  id: string;
  type: 'low_stock' | 'maintenance_due' | 'test_due' | 'open_fault';
  title: string;
  message: string;
  link: string;
  severity: 'critical' | 'warning' | 'info';
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
            const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (!department) {
        setAlerts([]);
        setLoading(false);
        return;
      }
      const in7days = new Date();
      in7days.setDate(in7days.getDate() + 7);
      const todayStr = new Date().toISOString().slice(0, 10);
      const in7Str = in7days.toISOString().slice(0, 10);

            const [
        { data: lowStock },
        { data: dueMaintenance },
        { data: dueTests },
        { data: openFaults },
      ] = await Promise.all([

        supabase
          .from('spare_parts')
          .select('id, part_name, quantity_available, minimum_stock')
          .eq('department_id', department.id),

        supabase
          .from('maintenance_records')
          .select('id, maintenance_number, next_maintenance_date, building_id, buildings(name)')
          .eq('department_id', department.id)
          .gte('next_maintenance_date', todayStr)
          .lte('next_maintenance_date', in7Str),

        supabase
          .from('tests')
          .select('id, test_number, next_test_date, building_id, buildings(name)')
          .eq('department_id', department.id)
          .gte('next_test_date', todayStr)
          .lte('next_test_date', in7Str),

        supabase
          .from('faults')
          .select('id, fault_number, priority, description, buildings(name)')
          .eq('department_id', department.id)
          .in('status', ['open', 'assigned', 'in_progress'])
          .eq('priority', 'critical'),
      ]);

      const items: AlertItem[] = [];

      (lowStock ?? []).filter((p: any) => p.quantity_available <= p.minimum_stock).forEach((p: any) => {
        items.push({
          id: 'low-' + p.id,
          type: 'low_stock',
          title: 'مخزون منخفض',
          message: `${p.part_name} — الكمية المتوفرة (${p.quantity_available}) وصلت أو تجاوزت الحد الأدنى (${p.minimum_stock})`,
          link: '/spare-parts',
          severity: 'warning',
        });
      });

      (dueMaintenance ?? []).forEach((m: any) => {
        items.push({
          id: 'maint-' + m.id,
          type: 'maintenance_due',
          title: 'صيانة مستحقة قريبًا',
          message: `${m.maintenance_number} في ${m.buildings?.name ?? ''} — موعدها ${new Date(m.next_maintenance_date).toLocaleDateString('ar-SA')}`,
          link: '/maintenance',
          severity: 'info',
        });
      });

      (dueTests ?? []).forEach((t: any) => {
        items.push({
          id: 'test-' + t.id,
          type: 'test_due',
          title: 'اختبار قادم قريبًا',
          message: `${t.test_number} في ${t.buildings?.name ?? ''} — موعده ${new Date(t.next_test_date).toLocaleDateString('ar-SA')}`,
          link: '/tests',
          severity: 'info',
        });
      });

      (openFaults ?? []).forEach((f: any) => {
        items.push({
          id: 'fault-' + f.id,
          type: 'open_fault',
          title: 'عطل حرج مفتوح',
          message: `${f.fault_number} في ${f.buildings?.name ?? ''} — ${f.description}`,
          link: '/faults',
          severity: 'critical',
        });
      });

      setAlerts(items);
      setLoading(false);
    }
    load();
  }, []);

  const icons: Record<AlertItem['type'], any> = {
    low_stock: Package,
    maintenance_due: Wrench,
    test_due: ClipboardCheck,
    open_fault: AlertTriangle,
  };

  const severityStyles: Record<AlertItem['severity'], string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    info: 'border-primary-200 bg-primary-50 text-primary-700',
  };

  const critical = alerts.filter((a) => a.severity === 'critical');
  const warning = alerts.filter((a) => a.severity === 'warning');
  const info = alerts.filter((a) => a.severity === 'info');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">مركز التنبيهات</h1>
        <p className="text-sm text-gray-500">الأعطال الحرجة، الصيانة المستحقة، الاختبارات القادمة، والمخزون المنخفض</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <Bell className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-400">لا توجد تنبيهات حاليًا — كل شيء تحت السيطرة</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { title: `حرجة (${critical.length})`, items: critical },
            { title: `تحتاج متابعة (${warning.length})`, items: warning },
            { title: `معلومات (${info.length})`, items: info },
          ].filter((g) => g.items.length > 0).map((group) => (
            <div key={group.title}>
              <h2 className="mb-3 text-sm font-bold text-gray-700">{group.title}</h2>
              <div className="space-y-2">
                {group.items.map((a) => {
                  const Icon = icons[a.type];
                  return (
                    <Link
                      key={a.id}
                      href={a.link}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition hover:opacity-90 ${severityStyles[a.severity]}`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="mt-0.5 opacity-90">{a.message}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
