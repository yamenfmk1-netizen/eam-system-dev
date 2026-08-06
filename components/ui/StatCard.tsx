import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  suffix,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  suffix?: string;
}) {
  const toneStyles = {
    default: 'bg-primary-50 text-primary-600',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-yellow-50 text-yellow-600',
    danger: 'bg-red-50 text-red-600',
  };

  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1.5 text-2xl font-bold text-gray-900">
          {value}
          {suffix && <span className="ms-1 text-sm font-normal text-gray-400">{suffix}</span>}
        </p>
      </div>
      <div className={clsx('flex h-11 w-11 items-center justify-center rounded-xl', toneStyles[tone])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}
