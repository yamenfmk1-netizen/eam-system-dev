'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import BuildingCard from '@/components/buildings/BuildingCard';
import BuildingForm from '@/components/buildings/BuildingForm';
import { Plus, Search, Loader2, MapPin, ShieldAlert } from 'lucide-react';
import type { Building, BuildingStatus, BuildingCriticality } from '@/types/database.types';

export default function BuildingsPage() {
  const supabase = createClient();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BuildingStatus | 'all'>('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [criticalityFilter, setCriticalityFilter] = useState<BuildingCriticality | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  async function loadBuildings() {
    setLoading(true);
    const { data } = await supabase
      .from('buildings')
      .select('*, equipment(count)')
      .is('deleted_at', null)
      .order('building_number');

    const mapped = (data ?? []).map((b: any) => ({
      ...b,
      equipment_count: b.equipment?.[0]?.count ?? 0,
    }));

    setBuildings(mapped);
    setLoading(false);
  }

  useEffect(() => {
    loadBuildings();
  }, []);

  const stations = Array.from(new Set(buildings.map((b) => b.station).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ar')
  );

  const filtered = buildings.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      b.name.toLowerCase().includes(q) ||
      b.building_number.toLowerCase().includes(q) ||
      (b.station ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesStation = stationFilter === 'all' || b.station === stationFilter;
    const matchesCriticality = criticalityFilter === 'all' || b.criticality === criticalityFilter;
    return matchesSearch && matchesStatus && matchesStation && matchesCriticality;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.criticality === 'critical' && b.criticality !== 'critical') return -1;
    if (a.criticality !== 'critical' && b.criticality === 'critical') return 1;
    return a.building_number.localeCompare(b.building_number, 'ar', { numeric: true });
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المباني</h1>
          <p className="text-sm text-gray-500">إدارة المباني والاطلاع على حالتها العامة</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> إضافة مبنى
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم المبنى أو الاسم..."
            className="input-field pe-9"
          />
        </div>
        <div className="relative sm:w-56">
          <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="input-field pe-9"
          >
            <option value="all">جميع المحطات / المواقع</option>
            {stations.map((station) => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>
        </div>
        <div className="relative sm:w-44">
          <ShieldAlert className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={criticalityFilter}
            onChange={(e) => setCriticalityFilter(e.target.value as BuildingCriticality | 'all')}
            className="input-field pe-9"
          >
            <option value="all">كل مستويات الأهمية</option>
            <option value="critical">حرج</option>
            <option value="normal">عادي</option>
          </select>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="input-field sm:w-56"
        >
          <option value="all">جميع الحالات</option>
          <option value="ready">جاهز</option>
          <option value="watch">يحتاج متابعة</option>
          <option value="fault">يوجد عطل</option>
          <option value="unknown">بيانات غير كافية</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-400">لا توجد مبانٍ مطابقة</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedFiltered.map((b) => (
            <BuildingCard key={b.id} building={b} />
          ))}
        </div>
      )}

      {showForm && (
        <BuildingForm stations={stations} onClose={() => setShowForm(false)} onSaved={loadBuildings} />
      )}
    </div>
  );
}
