import clsx from 'clsx';

type Tone = 'ready' | 'watch' | 'fault' | 'unknown' | 'info';

const toneStyles: Record<Tone, string> = {
  ready: 'bg-green-50 text-green-700 ring-1 ring-green-600/20',
  watch: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20',
  fault: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  unknown: 'bg-gray-100 text-gray-600 ring-1 ring-gray-400/20',
  info: 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20',
};

export default function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        toneStyles[tone]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
