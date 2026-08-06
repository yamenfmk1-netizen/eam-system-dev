'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import FileUploadForm from '@/components/files/FileUploadForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Plus, Search, Loader2, FileText, Download, Trash2, Eye } from 'lucide-react';
import { ATTACHMENT_CATEGORY_LABELS } from '@/types/database.types';
import type { Building, Equipment, Attachment } from '@/types/database.types';
import toast from 'react-hot-toast';
import PrivateFileLink from '@/components/ui/PrivateFileLink';

export default function FilesPage() {
  const supabase = createClient();
  const [files, setFiles] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: f }, { data: b }, { data: e }] = await Promise.all([
      supabase.from('attachments').select('*, buildings(name), equipment(name, asset_id)').order('created_at', { ascending: false }),
      supabase.from('buildings').select('*').is('deleted_at', null).order('building_number'),
      supabase.from('equipment').select('*').is('deleted_at', null).order('name'),
    ]);
    setFiles(f ?? []);
    setBuildings(b ?? []);
    setEquipment(e ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = files.filter((f) => {
    const q = search.toLowerCase();
    const matchesSearch =
      f.file_name.toLowerCase().includes(q) ||
      (f.buildings?.name ?? '').toLowerCase().includes(q) ||
      (f.equipment?.name ?? '').toLowerCase().includes(q);
    const matchesCategory = categoryFilter === 'all' || f.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('attachments').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast.error('تعذر حذف الملف: ' + error.message);
      return;
    }
    toast.success('تم حذف الملف');
    loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المخططات والملفات</h1>
          <p className="text-sm text-gray-500">المخططات، الأدلة، نشرات البيانات، تقارير الاختبار والصيانة</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> رفع ملف</button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الملف، المبنى، المعدة..." className="input-field pe-9" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field sm:w-56">
          <option value="all">جميع الأنواع</option>
          {Object.entries(ATTACHMENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد ملفات مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">الملف</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">المبنى</th>
                <th className="px-4 py-3">المعدة</th>
                <th className="px-4 py-3">تاريخ الرفع</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="font-medium text-gray-800">{f.file_name}</span>
                    </div>
                    {f.description && <p className="mt-0.5 text-xs text-gray-400">{f.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{ATTACHMENT_CATEGORY_LABELS[f.category as keyof typeof ATTACHMENT_CATEGORY_LABELS]}</td>
                  <td className="px-4 py-3 text-gray-500">{f.buildings?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{f.equipment?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(f.created_at).toLocaleDateString('ar-SA')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <PrivateFileLink bucket="documents" path={f.file_url} mode="view" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600">
                        <Eye className="h-4 w-4" />
                      </PrivateFileLink>
                      <PrivateFileLink bucket="documents" path={f.file_url} mode="download" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600">
                        <Download className="h-4 w-4" />
                      </PrivateFileLink>
                      <button onClick={() => setDeleteTarget(f)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="حذف">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <FileUploadForm buildings={buildings} equipment={equipment} onClose={() => setShowForm(false)} onSaved={loadData} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف الملف"
        message={`هل أنت متأكد من حذف "${deleteTarget?.file_name}"؟`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
