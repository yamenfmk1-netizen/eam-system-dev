import Link from 'next/link';
import { Building2, Cpu, ClipboardCheck, Wrench, MapPin, ShieldAlert } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { BUILDING_STATUS_LABELS } from '@/types/database.types';
import type { Building } from '@/types/database.types';

export default function BuildingCard({ building }: { building: Building }) {
  return (
    <Link href={`/buildings/${building.id}`} className="card block transition hover:shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {building.criticality === 'critical' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
              <ShieldAlert className="h-3.5 w-3.5" /> حرج
            </span>
          )}
          <StatusBadge label={BUILDING_STATUS_LABELS[building.status]} tone={building.status} />
        </div>
      </div>

      <h3 className="font-bold text-gray-900">{building.name}</h3>
      <p className="text-xs text-gray-400">مبنى رقم {building.building_number}</p>
      <p className="mb-4 mt-1 flex items-center gap-1 text-xs text-gray-500">
        <MapPin className="h-3.5 w-3.5" /> {building.station || 'غير محدد'}
      </p>

      <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
            <Cpu className="h-3.5 w-3.5" /> المعدات
          </p>
          <p className="mt-1 text-sm font-bold text-gray-800">{building.equipment_count ?? '—'}</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
            <ClipboardCheck className="h-3.5 w-3.5" /> آخر اختبار
          </p>
          <p className="mt-1 text-sm font-bold text-gray-800">
            {building.last_test_date ? new Date(building.last_test_date).toLocaleDateString('ar-SA') : '—'}
          </p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
            <Wrench className="h-3.5 w-3.5" /> آخر صيانة
          </p>
          <p className="mt-1 text-sm font-bold text-gray-800">
            {building.last_maintenance_date ? new Date(building.last_maintenance_date).toLocaleDateString('ar-SA') : '—'}
          </p>
        </div>
      </div>
    </Link>
  );
}
