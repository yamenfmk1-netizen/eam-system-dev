'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SparePartForm from '@/components/spare-parts/SparePartForm';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Plus, Search, Loader2, AlertTriangle, ShieldAlert, Pencil, Trash2 } from 'lucide-react';
import { EQUIPMENT_TYPE_LABELS, warrantyStatus, warrantyDaysLeft } from '@/types/database.types';
import type { SparePart } from '@/types/database.types';
import { useLanguage } from '@/lib/i18n/context';
import toast from 'react-hot-toast';

const EQUIPMENT_TYPE_LABELS_EN: Record<string, string> = {
  generator: 'Generator', ats: 'ATS', ups: 'UPS', transformer: 'Transformer',
  switchgear: 'Switchgear', rmu: 'RMU', main_distribution_board: 'Main DB',
  sub_main_distribution_board: 'Sub-main DB', synchronizing_panel: 'Sync panel',
  battery_bank: 'Battery bank', pdu: 'PDU', pdm: 'PDM', other: 'Other',
};

export default function SparePartsPage() {
  const supabase = createClient();
  const { t, lang, formatDate } = useLanguage();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [warrantyIssuesOnly, setWarrantyIssuesOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<SparePart | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('spare_parts').select('*').order('part_name');
    setParts((data ?? []) as SparePart[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => parts.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.part_name.toLowerCase().includes(q) ||
      (p.part_number ?? '').toLowerCase().includes(q) ||
      (p.manufacturer ?? '').toLowerCase().includes(q);
    const isLow = p.quantity_available <= p.minimum_stock;
    const w = warrantyStatus(p.warranty_end_date);
    const hasWarrantyIssue = w === 'expired' || w === 'expiring_soon';
    return matchesSearch && (!lowStockOnly || isLow) && (!warrantyIssuesOnly || hasWarrantyIssue);
  }), [parts, search, lowStockOnly, warrantyIssuesOnly]);

  function openEdit(part: SparePart) { setEditingPart(part); setShowForm(true); }
  function openNew() { setEditingPart(undefined); setShowForm(true); }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('spare_parts').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast.error((lang === 'ar' ? 'تعذر الحذف: ' : 'Delete failed: ') + error.message);
      return;
    }
    toast.success(lang === 'ar' ? 'تم حذف القطعة' : 'Part deleted');
    loadData();
  }

  const lowStockCount = parts.filter((p) => p.quantity_available <= p.minimum_stock).length;
  const expiredCount = parts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expired').length;
  const expiringCount = parts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expiring_soon').length;

  function warrantyCell(p: SparePart) {
    const status = warrantyStatus(p.warranty_end_date);
    const days = warrantyDaysLeft(p.warranty_end_date);
    if (status === 'none') return <span className="text-gray-400">{t('spare.warrantyNone')}</span>;
    const tone = status === 'expired' ? 'fault' : status === 'expiring_soon' ? 'watch' : 'ready';
    const label =
      status === 'expired' ? t('spare.warrantyExpired')
      : status === 'expiring_soon' ? t('spare.warrantyExpiring')
      : t('spare.warrantyValid');
    return (
      <div className="flex flex-col gap-1">
        <StatusBadge label={label} tone={tone as any} />
        <span className="text-xs text-gray-400">
          {formatDate(p.warranty_end_date)}
          {days !== null && (
            <> · {status === 'expired' ? `${Math.abs(days)} ${t('spare.daysAgo')}` : `${days} ${t('spare.daysLeft')}`}</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('spare.title')}</h1>
          <p className="text-sm text-gray-500">{t('spare.subtitle')}</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> {t('spare.add')}</button>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lowStockCount} {t('spare.lowStockBanner')}
        </div>
      )}

      {expiredCount > 0 && (
        <button
          onClick={() => setWarrantyIssuesOnly(true)}
          className="flex w-full items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-start text-sm text-red-700 hover:bg-red-100"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {expiredCount} {t('spare.warrantyExpiredBanner')}
        </button>
      )}

      {expiringCount > 0 && (
        <button
          onClick={() => setWarrantyIssuesOnly(true)}
          className="flex w-full items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-start text-sm text-amber-700 hover:bg-amber-100"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {expiringCount} {t('spare.warrantyExpiringBanner')}
        </button>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('spare.searchPlaceholder')} className="input-field pe-9" />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          {t('spare.lowStockOnly')}
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={warrantyIssuesOnly} onChange={(e) => setWarrantyIssuesOnly(e.target.checked)} />
          {t('spare.warrantyIssuesOnly')}
        </label>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{t('spare.empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-start text-xs text-gray-500">
                <th className="px-4 py-3 text-start">{t('spare.name')}</th>
                <th className="px-4 py-3 text-start">Part Number</th>
                <th className="px-4 py-3 text-start">{t('spare.compatibleType')}</th>
                <th className="px-4 py-3 text-start">{t('spare.quantity')}</th>
                <th className="px-4 py-3 text-start">{t('spare.minStock')}</th>
                <th className="px-4 py-3 text-start">{t('spare.location')}</th>
                <th className="px-4 py-3 text-start">{t('spare.warrantyEnd')}</th>
                <th className="px-4 py-3 text-start">{t('common.status')}</th>
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
                      {p.compatible_equipment_type
                        ? (lang === 'ar'
                            ? EQUIPMENT_TYPE_LABELS[p.compatible_equipment_type]
                            : EQUIPMENT_TYPE_LABELS_EN[p.compatible_equipment_type] ?? p.compatible_equipment_type)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.quantity_available}</td>
                    <td className="px-4 py-3 text-gray-500">{p.minimum_stock}</td>
                    <td className="px-4 py-3 text-gray-500">{p.storage_location ?? '—'}</td>
                    <td className="px-4 py-3">{warrantyCell(p)}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <StatusBadge label={t('spare.lowStock')} tone="fault" />
                      ) : (
                        <StatusBadge label={t('spare.available')} tone="ready" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} title={t('common.edit')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} title={t('common.delete')} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
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
        title={lang === 'ar' ? 'حذف قطعة الغيار' : 'Delete spare part'}
        message={`${lang === 'ar' ? 'هل أنت متأكد من حذف' : 'Delete'} "${deleteTarget?.part_name}"؟`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
