'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { Building, Equipment, MaintenanceRecord } from '@/types/database.types';
import { uploadFile } from '@/lib/storage/client';

interface FormValues {
  maintenance_number: string;
  building_id: string;
  equipment_id: string;
  maintenance_type: string;
  category: string;
  maintenance_date: string;
  work_description: string;
  problem_found: string;
  action_taken: string;
  spare_parts_used: string;
  technician_name: string;
  engineer_name: string;
  cost: string;
  notes: string;
  recommendations: string;
  next_maintenance_date: string;
}

export default function MaintenanceForm({
  record,
  buildings,
  onClose,
  onSaved,
}: {
  record?: MaintenanceRecord;
  buildings: Building[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [beforePhotos, setBeforePhotos] = useState<FileList | null>(null);
  const [afterPhotos, setAfterPhotos] = useState<FileList | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: record
      ? {
          maintenance_number: record.maintenance_number,
          building_id: record.building_id,
          equipment_id: record.equipment_id ?? '',
          maintenance_type: record.maintenance_type ?? '',
          category: record.category,
          maintenance_date: record.maintenance_date,
          work_description: record.work_description ?? '',
          technician_name: record.technician_name ?? '',
          engineer_name: record.engineer_name ?? '',
          next_maintenance_date: record.next_maintenance_date ?? '',
        }
      : { category: 'preventive', maintenance_date: new Date().toISOString().slice(0, 10) },
  });

  const selectedBuilding = watch('building_id');

  useEffect(() => {
    if (!selectedBuilding) { setEquipment([]); return; }
    supabase.from('equipment').select('*').eq('building_id', selectedBuilding).is('deleted_at', null).then(({ data }) => setEquipment(data ?? []));
  }, [selectedBuilding]);

  async function uploadPhotos(files: FileList | null, bucket: string) {
    if (!files || files.length === 0) return [];
    const paths: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const path = await uploadFile(bucket, file);
        paths.push(path);
      } catch {
        toast.error(`تعذر رفع الملف: ${file.name}`);
      }
    }
    return paths;
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const payload: any = {
        maintenance_number: values.maintenance_number,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        maintenance_type: values.maintenance_type,
        category: values.category,
        maintenance_date: values.maintenance_date,
        work_description: values.work_description,
        problem_found: values.problem_found,
        action_taken: values.action_taken,
        spare_parts_used: values.spare_parts_used,
        technician_name: values.technician_name,
        engineer_name: values.engineer_name,
        cost: values.cost ? Number(values.cost) : null,
        notes: values.notes,
        recommendations: values.recommendations,
        next_maintenance_date: values.next_maintenance_date || null,
      };

      let savedId = record?.id;

      if (record) {
        const { error } = await supabase.from('maintenance_records').update(payload).eq('id', record.id);
        if (error) throw error;
        toast.success('تم تحديث سجل الصيانة');
      } else {
        const { data, error } = await supabase.from('maintenance_records').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
        toast.success('تم تسجيل الصيانة بنجاح');
      }

      // رفع الصور كمرفقات مرتبطة بسجل الصيانة
      const beforeUrls = await uploadPhotos(beforePhotos, 'documents');
      const afterUrls = await uploadPhotos(afterPhotos, 'documents');
      const attachmentRows = [
        ...beforeUrls.map((url) => ({ file_name: 'صورة قبل العمل', file_url: url, category: 'maintenance_report', maintenance_id: savedId, description: 'قبل الصيانة' })),
        ...afterUrls.map((url) => ({ file_name: 'صورة بعد العمل', file_url: url, category: 'maintenance_report', maintenance_id: savedId, description: 'بعد الصيانة' })),
      ];
      if (attachmentRows.length > 0) {
        await supabase.from('attachments').insert(attachmentRows);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{record ? 'تعديل سجل الصيانة' : 'تسجيل صيانة جديدة'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">رقم الصيانة *</label>
            <input {...register('maintenance_number', { required: 'مطلوب' })} className="input-field" dir="ltr" />
            {errors.maintenance_number && <p className="mt-1 text-xs text-red-600">{errors.maintenance_number.message}</p>}
          </div>

          <div>
            <label className="label-field">نوع العمل</label>
            <input {...register('maintenance_type')} className="input-field" placeholder="مثال: تغيير زيت" />
          </div>

          <div>
            <label className="label-field">المبنى *</label>
            <select {...register('building_id', { required: true })} className="input-field">
              <option value="">اختر المبنى</option>
              {buildings.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </div>

          <div>
            <label className="label-field">المعدة</label>
            <select {...register('equipment_id')} className="input-field">
              <option value="">بدون تحديد معدة</option>
              {equipment.map((e) => (<option key={e.id} value={e.id}>{e.name} ({e.asset_id})</option>))}
            </select>
          </div>

          <div>
            <label className="label-field">نوع الصيانة</label>
            <select {...register('category')} className="input-field">
              <option value="preventive">وقائية</option>
              <option value="corrective">علاجية</option>
            </select>
          </div>

          <div>
            <label className="label-field">تاريخ الصيانة *</label>
            <input {...register('maintenance_date', { required: true })} type="date" className="input-field" />
          </div>

          <div>
            <label className="label-field">اسم الفني</label>
            <input {...register('technician_name')} className="input-field" />
          </div>

          <div>
            <label className="label-field">اسم المهندس</label>
            <input {...register('engineer_name')} className="input-field" />
          </div>

          <div>
            <label className="label-field">تكلفة الصيانة</label>
            <input {...register('cost')} type="number" step="0.01" className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">موعد الصيانة القادمة</label>
            <input {...register('next_maintenance_date')} type="date" className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">وصف العمل</label>
            <textarea {...register('work_description')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">المشكلة</label>
            <textarea {...register('problem_found')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الإجراء المتخذ</label>
            <textarea {...register('action_taken')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">قطع الغيار المستخدمة</label>
            <input {...register('spare_parts_used')} className="input-field" />
          </div>

          <div>
            <label className="label-field">صور قبل العمل</label>
            <input type="file" multiple accept="image/jpeg,image/png,image/jpg" onChange={(e) => setBeforePhotos(e.target.files)} className="input-field" />
          </div>

          <div>
            <label className="label-field">صور بعد العمل</label>
            <input type="file" multiple accept="image/jpeg,image/png,image/jpg" onChange={(e) => setAfterPhotos(e.target.files)} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الملاحظات والتوصيات</label>
            <textarea {...register('notes')} rows={2} className="input-field" placeholder="ملاحظات" />
            <textarea {...register('recommendations')} rows={2} className="input-field mt-2" placeholder="توصيات" />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {record ? 'حفظ التعديلات' : 'تسجيل الصيانة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
