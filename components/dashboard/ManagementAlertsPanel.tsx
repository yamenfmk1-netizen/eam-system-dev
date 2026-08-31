'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react';

type ManagementAlert = {
  departmentId: string;
  departmentName: string;
  title: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium';
  score: number;
};

type ActiveAlertPanel = 'all' | 'critical' | 'high' | null;

export default function ManagementAlertsPanel({
  alerts,
  totalCount,
  criticalCount,
  highCount,
}: {
  alerts: ManagementAlert[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
}) {
  const [activePanel, setActivePanel] =
    useState<ActiveAlertPanel>(null);

  const visibleAlerts = useMemo(() => {
    if (activePanel === 'critical') {
      return alerts.filter(
        (alert) => alert.severity === 'critical'
      );
    }

    if (activePanel === 'high') {
      return alerts.filter(
        (alert) => alert.severity === 'high'
      );
    }

    return alerts;
  }, [activePanel, alerts]);

  function toggle(panel: Exclude<ActiveAlertPanel, null>) {
    setActivePanel((current) =>
      current === panel ? null : panel
    );
  }

  const panelTitle =
    activePanel === 'critical'
      ? 'التنبيهات الحرجة'
      : activePanel === 'high'
        ? 'التنبيهات العالية'
        : 'جميع التنبيهات الإدارية';

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AlertMetricCard
          label="إجمالي التنبيهات الإدارية"
          value={totalCount}
          active={activePanel === 'all'}
          onClick={() => toggle('all')}
          tone="warning"
          icon="warning"
        />

        <AlertMetricCard
          label="تنبيهات حرجة"
          value={criticalCount}
          active={activePanel === 'critical'}
          onClick={() => toggle('critical')}
          tone="danger"
          icon="critical"
        />

        <AlertMetricCard
          label="تنبيهات عالية"
          value={highCount}
          active={activePanel === 'high'}
          onClick={() => toggle('high')}
          tone="warning"
          icon="warning"
        />
      </div>

      {activePanel && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-bold text-gray-900">
              {panelTitle}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              مرتبة تلقائيًا من الأعلى خطورة إلى الأقل
            </p>
          </div>

          {visibleAlerts.length === 0 ? (
            <p className="py-5 text-center text-sm text-gray-500">
              لا توجد تنبيهات في هذا التصنيف.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleAlerts.map((alert, index) => (
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
      )}
    </div>
  );
}

function AlertMetricCard({
  label,
  value,
  active,
  onClick,
  tone,
  icon,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: 'danger' | 'warning';
  icon: 'critical' | 'warning';
}) {
  const Icon =
    icon === 'critical' ? ShieldAlert : AlertTriangle;

  const iconClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-600'
      : 'bg-amber-50 text-amber-600';

  const activeClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50/40'
      : 'border-amber-200 bg-amber-50/40';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex items-center justify-between rounded-2xl border p-5 text-start transition ${
        active
          ? activeClass
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div>
        <p className="text-sm text-gray-500">
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-bold text-gray-900">
          {value}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${
            active ? 'rotate-180' : ''
          }`}
        />
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  );
}
