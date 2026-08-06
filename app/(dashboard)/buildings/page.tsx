'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import BuildingCard from '@/components/buildings/BuildingCard';
import BuildingForm from '@/components/buildings/BuildingForm';
import { Plus, Search, Loader2 } from 'lucide-react';
import type { Building, BuildingStatus } from '@/types/database.types';

export default function BuildingsPage() {
  const supabase = createClient();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BuildingStatus | 'all'>('all');
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

  const filtered = buildings.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.building_number.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
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
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-400">لا توجد مبانٍ مطابقة</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((b) => (
            <BuildingCard key={b.id} building={b} />
          ))}
        </div>
      )}

      {showForm && (
        <BuildingForm onClose={() => setShowForm(false)} onSaved={loadBuildings} />
      )}
    </div>
  );
}
