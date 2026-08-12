'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STATUS_COLORS = {
  ready: '#16a34a',
  under_maintenance: '#2f82ff',
  fault: '#dc2626',
  out_of_service: '#6b7280',
};

const STATUS_LABELS = {
  ready: 'جاهزة',
  under_maintenance: 'تحت الصيانة',
  fault: 'عطل',
  out_of_service: 'متوقفة',
};

export function EquipmentStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const countOf = (...statuses: string[]) =>
    data.filter((d) => statuses.includes(d.status)).reduce((sum, d) => sum + d.count, 0);

  const chartData = [
    { key: 'ready', name: STATUS_LABELS.ready, value: countOf('available', 'running', 'standby') },
    { key: 'under_maintenance', name: STATUS_LABELS.under_maintenance, value: countOf('under_maintenance') },
    { key: 'fault', name: STATUS_LABELS.fault, value: countOf('fault') },
    { key: 'out_of_service', name: STATUS_LABELS.out_of_service, value: countOf('out_of_service') },
  ];

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">لا توجد بيانات كافية بعد</p>;
  }

  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-5">
      <div className="sm:col-span-3">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value} معدة`, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3 sm:col-span-2">
        {chartData.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.key as keyof typeof STATUS_COLORS] }} />
                <span>{item.name}</span>
              </div>
              <span className="font-semibold text-gray-800">{pct}% <span className="font-normal text-gray-400">({item.value})</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FaultPriorityChart({ data }: { data: { priority: string; count: number }[] }) {
  const labels: Record<string, string> = {
    critical: 'حرجة',
    high: 'عالية',
    medium: 'متوسطة',
    low: 'منخفضة',
  };
  const colors: Record<string, string> = {
    critical: '#dc2626',
    high: '#f59e0b',
    medium: '#2f82ff',
    low: '#94a3b8',
  };
  const chartData = data.map((d) => ({ name: labels[d.priority] ?? d.priority, value: d.count, priority: d.priority }));

  if (chartData.every((d) => d.value === 0)) {
    return <p className="py-10 text-center text-sm text-gray-400">لا توجد أعطال مفتوحة حاليًا</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 24, top: 6, bottom: 6 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis type="number" allowDecimals={false} fontSize={11} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={72} fontSize={12} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value: number) => [`${value}`, 'عدد الأعطال']} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
          {chartData.map((entry) => (
            <Cell key={entry.priority} fill={colors[entry.priority] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
