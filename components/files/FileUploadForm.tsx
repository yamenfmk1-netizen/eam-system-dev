'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ATTACHMENT_CATEGORY_LABELS } from '@/types/database.types';
import type { Building, Equipment } from '@/types/database.types';
import { uploadFile } from '@/lib/storage/client';

interface FormValues {
  category: string;
  building_id: string;
  equipment_id: string;
  description: string;
}

export default function FileUploadForm({
  buildings,
  equipment,
  onClose,
  onSaved,
}: {
  buildings: Building[];
  equipment: Equipment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { register, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: { category: 'other' },
  });

  const selectedBuilding = watch('building_id');
  const filteredEquipment = equipment.filter((e) => !selectedBuilding || e.building_id === selectedBuilding);

  async function onSubmit(values: FormValues) {
    if (!file) {
      toast.error('يرجى اختيار ملف للرفع');
      return;
    }
    setLoading(true);
    try {
      const path = await uploadFile('documents', file);

      const { error } = await supabase.from('attachments').insert({
        file_name: file.name,
        file_url: path,
        file_type: file.type,
        category: values.category,
        building_id: values.building_id || null,
        equipment_id: values.equipment_id || null,
        description: values.description || null,
      });
      if (error) throw error;

      toast.success('تم رفع الملف بنجاح');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'حدث خطأ أثناء الرفع');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">رفع ملف جديد</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-field">الملف *</label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-center hover:border-primary-400">
              <Upload className="h-6 w-6 text-gray-400" />
              <span className="text-sm text-gray-500">{file ? file.name : 'اضغط لاختيار PDF أو صورة أو ملف Excel/Word'}</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div>
            <label className="label-field">نوع الملف *</label>
            <select {...register('category', { required: true })} className="input-field">
              {Object.entries(ATTACHMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">المبنى</label>
            <select {...register('building_id')} className="input-field">
              <option value="">بدون تحديد</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label-field">المعدة المرتبطة</label>
            <select {...register('equipment_id')} className="input-field">
              <option value="">بدون تحديد</option>
              {filteredEquipment.map((e) => <option key={e.id} value={e.id}>{e.asset_id} - {e.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label-field">وصف</label>
            <textarea {...register('description')} rows={2} className="input-field" />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} رفع الملف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
