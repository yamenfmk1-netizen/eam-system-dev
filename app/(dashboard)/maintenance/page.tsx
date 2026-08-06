'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Search, Loader2 } from 'lucide-react';
import { MAINTENANCE_CATEGORY_LABELS } from '@/types/database.types';
import type { Building } from '@/types/database.types';

export default function MaintenancePage() {
  const supabase = createClient();
  const [records, setRecords] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: b }] = await Promise.all([
      supabase.from('maintenance_records').select('*, buildings(name), equipment(name, asset_id)').order('maintenance_date', { ascending: false }),
      supabase.from('buildings').select('*').is('deleted_at', null).order('building_number'),
    ]);
    setRecords(m ?? []);
    setBuildings(b ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      r.maintenance_number.toLowerCase().includes(q) ||
      (r.buildings?.name ?? '').toLowerCase().includes(q) ||
      (r.equipment?.name ?? '').toLowerCase().includes(q);
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الصيانة</h1>
          <p className="text-sm text-gray-500">سجل أعمال الصيانة الوقائية والعلاجية</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> تسجيل صيانة</button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم الصيانة، المبنى، المعدة..." className="input-field pe-9" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field sm:w-48">
          <option value="all">جميع الأنواع</option>
          <option value="preventive">وقائية</option>
          <option value="corrective">علاجية</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد سجلات صيانة مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">رقم الصيانة</th>
                <th className="px-4 py-3">المبنى</th>
                <th className="px-4 py-3">المعدة</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">الفني</th>
                <th className="px-4 py-3">القادمة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800" dir="ltr">{r.maintenance_number}</td>
                  <td className="px-4 py-3 text-gray-500">{r.buildings?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.equipment?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={MAINTENANCE_CATEGORY_LABELS[r.category as keyof typeof MAINTENANCE_CATEGORY_LABELS]} tone={r.category === 'preventive' ? 'ready' : 'watch'} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.maintenance_date).toLocaleDateString('ar-SA')}</td>
                  <td className="px-4 py-3 text-gray-500">{r.technician_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.next_maintenance_date ? new Date(r.next_maintenance_date).toLocaleDateString('ar-SA') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <MaintenanceForm buildings={buildings} onClose={() => setShowForm(false)} onSaved={loadData} />}
    </div>
  );
}
