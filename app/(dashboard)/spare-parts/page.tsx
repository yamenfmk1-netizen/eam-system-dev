'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SparePartForm from '@/components/spare-parts/SparePartForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Plus, Search, Loader2, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { EQUIPMENT_TYPE_LABELS } from '@/types/database.types';
import type { SparePart } from '@/types/database.types';
import toast from 'react-hot-toast';

export default function SparePartsPage() {
  const supabase = createClient();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<SparePart | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('spare_parts').select('*').order('part_name');
    setParts(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = parts.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.part_name.toLowerCase().includes(q) ||
      (p.part_number ?? '').toLowerCase().includes(q) ||
      (p.manufacturer ?? '').toLowerCase().includes(q);
    const isLow = p.quantity_available <= p.minimum_stock;
    return matchesSearch && (!lowStockOnly || isLow);
  });

  function openEdit(part: SparePart) {
    setEditingPart(part);
    setShowForm(true);
  }

  function openNew() {
    setEditingPart(undefined);
    setShowForm(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('spare_parts').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast.error('تعذر الحذف: ' + error.message);
      return;
    }
    toast.success('تم حذف القطعة');
    loadData();
  }

  const lowStockCount = parts.filter((p) => p.quantity_available <= p.minimum_stock).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">قطع الغيار</h1>
          <p className="text-sm text-gray-500">إدارة مخزون قطع الغيار والحد الأدنى للتنبيه</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> إضافة قطعة غيار</button>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          يوجد {lowStockCount} قطعة وصلت أو تجاوزت الحد الأدنى للمخزون ويجب إعادة الطلب
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم القطعة أو Part Number أو الشركة المصنعة..." className="input-field pe-9" />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          المخزون المنخفض فقط
        </label>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد قطع غيار مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">اسم القطعة</th>
                <th className="px-4 py-3">Part Number</th>
                <th className="px-4 py-3">النوع المناسب</th>
                <th className="px-4 py-3">الكمية</th>
                <th className="px-4 py-3">الحد الأدنى</th>
                <th className="px-4 py-3">الموقع</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isLow = p.quantity_available <= p.minimum_stock;
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.part_name}</td>
                    <td className="px-4 py-3 text-gray-500" dir="ltr">{p.part_number ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {p.compatible_equipment_type ? EQUIPMENT_TYPE_LABELS[p.compatible_equipment_type] : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.quantity_available}</td>
                    <td className="px-4 py-3 text-gray-500">{p.minimum_stock}</td>
                    <td className="px-4 py-3 text-gray-500">{p.storage_location ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <StatusBadge label="مخزون منخفض" tone="fault" />
                      ) : (
                        <StatusBadge label="متوفر" tone="ready" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <SparePartForm sparePart={editingPart} onClose={() => setShowForm(false)} onSaved={loadData} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف قطعة الغيار"
        message={`هل أنت متأكد من حذف "${deleteTarget?.part_name}"؟`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
