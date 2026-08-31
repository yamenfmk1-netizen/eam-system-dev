'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  available: '#16a34a',
  running: '#16a34a',
  standby: '#2f82ff',
  under_maintenance: '#eab308',
  fault: '#dc2626',
  out_of_service: '#6b7280',
};

const STATUS_LABELS_AR: Record<string, string> = {
  available: 'متاح',
  running: 'يعمل',
  standby: 'استعداد',
  under_maintenance: 'تحت الصيانة',
  fault: 'يوجد عطل',
  out_of_service: 'خارج الخدمة',
};

export function EquipmentStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const chartData = data.map((d) => ({
    name: STATUS_LABELS_AR[d.status] ?? d.status,
    value: d.count,
    status: d.status,
  }));

  if (chartData.every((d) => d.value === 0)) {
    return <p className="py-10 text-center text-sm text-gray-400">لا توجد بيانات كافية بعد</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FaultPriorityChart({ data }: { data: { priority: string; count: number }[] }) {
  const labels: Record<string, string> = {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
    critical: 'حرجة',
  };
  const colors: Record<string, string> = {
    low: '#94a3b8',
    medium: '#2f82ff',
    high: '#eab308',
    critical: '#dc2626',
  };
  const chartData = data.map((d) => ({
    name: labels[d.priority] ?? d.priority,
    value: d.count,
    priority: d.priority,
  }));

  if (chartData.every((d) => d.value === 0)) {
    return <p className="py-10 text-center text-sm text-gray-400">لا توجد أعطال مفتوحة حاليًا</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} fontSize={11} />
        <YAxis type="category" dataKey="name" width={70} fontSize={12} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.priority} fill={colors[entry.priority] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyFaultTrendChart({
  data,
}: {
  data: { month: string; count: number }[];
}) {
  if (data.every((item) => item.count === 0)) {
    return (
      <p className="py-14 text-center text-sm text-gray-400">
        لا توجد أعطال مسجلة خلال آخر 6 أشهر
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis allowDecimals={false} fontSize={11} width={35} />
        <Tooltip
          formatter={(value: number) => [value, 'عدد الأعطال']}
          labelFormatter={(label) => `الشهر: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#2f82ff"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
