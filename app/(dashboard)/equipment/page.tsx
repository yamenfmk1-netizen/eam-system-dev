'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import EquipmentForm from '@/components/equipment/EquipmentForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Search, Loader2, MapPin } from 'lucide-react';
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS } from '@/types/database.types';
import type { Building, Equipment, EquipmentType } from '@/types/database.types';
type EquipmentTypeOption = {
  id: string;
  code: string;
  name: string;
};

export default function EquipmentPage() {
  const supabase = createClient();
  const [equipment, setEquipment] = useState<(Equipment & { buildings: { name: string; building_number: string; station: string } })[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentTypeOption[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function loadData() {
  setLoading(true);

  const { data: department } = await supabase
    .from('departments')
    .select('id')
    .eq('code', DEPARTMENT_CODE)
    .single();

  if (!department) {
    setEquipment([]);
    setBuildings([]);
    setLoading(false);
    return;
  }

  const [{ data: eq }, { data: b }, { data: types }] = await Promise.all([
  supabase
    .from('equipment')
    .select('*, buildings(name, building_number, station)')
    .eq('department_id', department.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false }),

  supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .order('building_number'),

  supabase
    .from('equipment_types')
    .select('id, code, name')
    .eq('department_id', department.id)
    .eq('is_active', true)
    .order('name'),
]);
    supabase
      .from('equipment')
      .select('*, buildings(name, building_number, station)')
      .eq('department_id', department.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),

    supabase
      .from('buildings')
      .select('*')
      .is('deleted_at', null)
      .order('building_number'),
  ]);

  setEquipment((eq as any) ?? []);
  setBuildings(b ?? []);
  setEquipmentTypes((types ?? []) as EquipmentTypeOption[]);  
  setLoading(false);
}

  useEffect(() => {
    loadData();
  }, []);

  const stations = Array.from(new Set(buildings.map((b) => b.station).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ar')
  );

  const visibleBuildings = stationFilter === 'all'
    ? buildings
    : buildings.filter((b) => b.station === stationFilter);

  const filtered = equipment.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch =
      e.asset_id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      (e.manufacturer ?? '').toLowerCase().includes(q) ||
      (e.serial_number ?? '').toLowerCase().includes(q) ||
      (e.buildings?.station ?? '').toLowerCase().includes(q);
    const matchesType = typeFilter === 'all' || e.type === typeFilter;
    const matchesStation = stationFilter === 'all' || e.buildings?.station === stationFilter;
    const matchesBuilding = buildingFilter === 'all' || e.building_id === buildingFilter;
    return matchesSearch && matchesType && matchesStation && matchesBuilding;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المعدات</h1>
          <p className="text-sm text-gray-500">جميع الأصول الكهربائية عبر كل المباني</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> إضافة معدة
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم الأصل، الاسم، الشركة المصنعة، الرقم التسلسلي..."
            className="input-field pe-9"
          />
        </div>
        <select
  value={typeFilter}
  onChange={(e) => setTypeFilter(e.target.value)}
  className="input-field sm:w-48"
>
  <option value="all">جميع الأنواع</option>

  {equipmentTypes.map((item) => (
    <option key={item.id} value={item.code}>
      {item.name}
    </option>
  ))}
</select>
        <div className="relative sm:w-52">
          <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={stationFilter}
            onChange={(e) => {
              setStationFilter(e.target.value);
              setBuildingFilter('all');
            }}
            className="input-field pe-9"
          >
            <option value="all">جميع المحطات / المواقع</option>
            {stations.map((station) => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>
        </div>
        <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} className="input-field sm:w-48">
          <option value="all">جميع المباني</option>
          {visibleBuildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد معدات مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">رقم الأصل</th>
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">المحطة / الموقع</th>
                <th className="px-4 py-3">المبنى</th>
                <th className="px-4 py-3">الشركة المصنعة</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">الأهمية</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">
  {equipmentTypes.find((item) => item.code === e.type)?.name
    ?? EQUIPMENT_TYPE_LABELS[e.type]
    ?? e.type}
</td>
                  <td className="px-4 py-3">{e.name}</td>
                  <td className="px-4 py-3 text-gray-500">{EQUIPMENT_TYPE_LABELS[e.type]}</td>
                  <td className="px-4 py-3 text-gray-500">{e.buildings?.station ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{e.buildings?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{e.manufacturer ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={EQUIPMENT_STATUS_LABELS[e.status]}
                      tone={e.status === 'fault' ? 'fault' : e.status === 'under_maintenance' ? 'watch' : 'ready'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={e.criticality === 'critical' ? 'حرجة' : e.criticality === 'high' ? 'عالية' : e.criticality === 'medium' ? 'متوسطة' : 'منخفضة'}
                      tone={e.criticality === 'critical' ? 'fault' : e.criticality === 'high' ? 'watch' : 'info'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <EquipmentForm buildings={buildings} onClose={() => setShowForm(false)} onSaved={loadData} />
      )}
    </div>
  );
}
