'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type OpenFaultItem = {
  id: string;
  number: string;
  description: string;
  equipmentName: string;
  buildingLabel: string;
  priority?: string | null;
};

type RepeatedFaultItem = {
  id: string;
  name: string;
  assetId: string;
  buildingLabel: string;
  count: number;
};

type OverdueMaintenanceItem = {
  id: string;
  title: string;
  dueDate: string | null;
  equipmentName: string;
  buildingLabel: string;
};

type LowStockItem = {
  id: string;
  name: string;
  partNumber: string;
  available: number;
  minimum: number;
};

type ActivePanel =
  | 'open-faults'
  | 'repeated-faults'
  | 'overdue-maintenance'
  | 'low-stock'
  | null;

export default function DepartmentMetricsPanel({
  totalAssets,
  openFaults,
  pmCompletion,
  correctiveCompletion,
  mttrHours,
  repeatedFaultAssets,
  overdueMaintenance,
  lowStockParts,
  openFaultItems,
  repeatedFaultItems,
  overdueMaintenanceItems,
  lowStockItems,
}: {
  totalAssets: number;
  openFaults: number;
  pmCompletion: number | null;
  correctiveCompletion: number | null;
  mttrHours: number | null;
  repeatedFaultAssets: number;
  overdueMaintenance: number;
  lowStockParts: number;
  openFaultItems: OpenFaultItem[];
  repeatedFaultItems: RepeatedFaultItem[];
  overdueMaintenanceItems: OverdueMaintenanceItem[];
  lowStockItems: LowStockItem[];
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  function toggle(panel: ActivePanel) {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="الأصول" value={totalAssets} />

        <ClickableMetricCard
          label="الأعطال المفتوحة"
          value={openFaults}
          active={activePanel === 'open-faults'}
          onClick={() => toggle('open-faults')}
          tone="danger"
        />

        <MetricCard
          label="PM Completion"
          value={pmCompletion === null ? '—' : `${pmCompletion}%`}
        />

        <MetricCard
          label="Corrective Completion"
          value={
            correctiveCompletion === null
              ? '—'
              : `${correctiveCompletion}%`
          }
        />

        <MetricCard
          label="MTTR"
          value={mttrHours === null ? '—' : `${mttrHours} س`}
        />

        <ClickableMetricCard
          label="أعطال متكررة"
          value={repeatedFaultAssets}
          active={activePanel === 'repeated-faults'}
          onClick={() => toggle('repeated-faults')}
          tone="warning"
        />

        <ClickableMetricCard
          label="صيانة متأخرة"
          value={overdueMaintenance}
          active={activePanel === 'overdue-maintenance'}
          onClick={() => toggle('overdue-maintenance')}
          tone="warning"
        />

        <ClickableMetricCard
          label="نقص قطع الغيار"
          value={lowStockParts}
          active={activePanel === 'low-stock'}
          onClick={() => toggle('low-stock')}
          tone="warning"
        />
      </div>

      {activePanel && (
        <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
          {activePanel === 'open-faults' && (
            <OpenFaultsList items={openFaultItems} />
          )}

          {activePanel === 'repeated-faults' && (
            <RepeatedFaultsList items={repeatedFaultItems} />
          )}

          {activePanel === 'overdue-maintenance' && (
            <OverdueMaintenanceList items={overdueMaintenanceItems} />
          )}

          {activePanel === 'low-stock' && (
            <LowStockList items={lowStockItems} />
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ClickableMetricCard({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: 'danger' | 'warning';
}) {
  const activeClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : 'border-amber-200 bg-amber-50';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`rounded-xl border p-4 text-start transition ${
        active
          ? activeClass
          : 'border-transparent bg-gray-50 hover:border-gray-200 hover:bg-gray-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
            active ? 'rotate-180' : ''
          }`}
        />
      </div>
    </button>
  );
}

function OpenFaultsList({ items }: { items: OpenFaultItem[] }) {
  if (items.length === 0) {
    return <Empty text="لا توجد أعطال مفتوحة." />;
  }

  return (
    <div className="space-y-2">
      <h4 className="mb-3 font-bold text-gray-900">الأعطال المفتوحة</h4>

      {items.map((fault) => (
        <div key={fault.id} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-gray-900" dir="ltr">
              {fault.number}
            </span>
            <span className="text-xs text-gray-500">
              {fault.buildingLabel} · {fault.equipmentName}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{fault.description}</p>
        </div>
      ))}
    </div>
  );
}

function RepeatedFaultsList({ items }: { items: RepeatedFaultItem[] }) {
  if (items.length === 0) {
    return (
      <Empty text="لا توجد معدات بأعطال متكررة خلال آخر 90 يوم." />
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="mb-3 font-bold text-gray-900">الأعطال المتكررة</h4>

      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"
        >
          <div>
            <p className="font-medium text-gray-900">{item.name}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {item.buildingLabel} · {item.assetId}
            </p>
          </div>
          <span className="text-lg font-bold text-amber-700">
            {item.count} أعطال
          </span>
        </div>
      ))}
    </div>
  );
}

function OverdueMaintenanceList({
  items,
}: {
  items: OverdueMaintenanceItem[];
}) {
  if (items.length === 0) {
    return <Empty text="لا توجد صيانة متأخرة." />;
  }

  return (
    <div className="space-y-2">
      <h4 className="mb-3 font-bold text-gray-900">الصيانة المتأخرة</h4>

      {items.map((item) => (
        <div key={item.id} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-gray-900">{item.title}</span>
            <span className="text-xs font-medium text-red-600">
              {item.dueDate ?? '—'}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {item.buildingLabel} · {item.equipmentName}
          </p>
        </div>
      ))}
    </div>
  );
}

function LowStockList({ items }: { items: LowStockItem[] }) {
  if (items.length === 0) {
    return <Empty text="لا توجد قطع غيار منخفضة المخزون." />;
  }

  return (
    <div className="space-y-2">
      <h4 className="mb-3 font-bold text-gray-900">نقص قطع الغيار</h4>

      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"
        >
          <div>
            <p className="font-medium text-gray-900">{item.name}</p>
            <p className="mt-0.5 text-xs text-gray-500" dir="ltr">
              {item.partNumber}
            </p>
          </div>

          <div className="text-left text-sm">
            <p className="font-bold text-red-600">
              المتوفر: {item.available}
            </p>
            <p className="text-xs text-gray-500">
              الحد الأدنى: {item.minimum}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-center text-sm text-gray-500">{text}</p>;
}
