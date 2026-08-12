'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { Building } from '@/types/database.types';
import { buildingSchema, type BuildingInput } from '@/lib/validation/schemas';
import { validateFile, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, FileValidationError } from '@/lib/storage/upload';
import { uploadFile } from '@/lib/storage/client';

export default function BuildingForm({
  building,
  stations,
  onClose,
  onSaved,
}: {
  building?: Building;
  stations?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<BuildingInput>({
    resolver: zodResolver(buildingSchema),
    defaultValues: building
      ? {
          building_number: building.building_number,
          name: building.name,
          department: building.department ?? '',
          location: building.location ?? '',
          station: building.station ?? 'الحرم الرئيسي',
          responsible_person: building.responsible_person ?? '',
          contact_phone: building.contact_phone ?? '',
          contact_email: building.contact_email ?? '',
          description: building.description ?? '',
          status: building.status,
          criticality: building.criticality ?? 'normal',
          notes: building.notes ?? '',
        }
      : { status: 'unknown', station: 'الحرم الرئيسي', criticality: 'normal' },
  });

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageError(null);
    if (!file) {
      setImageFile(null);
      return;
    }
    try {
      validateFile(file, { allowedTypes: ALLOWED_IMAGE_TYPES, maxSizeBytes: MAX_IMAGE_SIZE_BYTES });
      setImageFile(file);
    } catch (err) {
      if (err instanceof FileValidationError) setImageError(err.message);
      setImageFile(null);
      e.target.value = '';
    }
  }

  async function onSubmit(values: BuildingInput) {
    setLoading(true);
    try {
      // image_url يخزّن الآن مسار التخزين (path) داخل bucket خاص، وليس رابطًا عامًا.
      let image_url = building?.image_url ?? null;

      if (imageFile) {
        image_url = await uploadFile('building-images', imageFile);
      }

      const payload = { ...values, image_url };

      if (building) {
        const { error } = await supabase.from('buildings').update(payload).eq('id', building.id);
        if (error) throw error;
        toast.success('تم تحديث بيانات المبنى بنجاح');
      } else {
        const { error } = await supabase.from('buildings').insert(payload);
        if (error) throw error;
        toast.success('تمت إضافة المبنى بنجاح');
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
          <h2 className="text-lg font-bold text-gray-900">
            {building ? 'تعديل بيانات المبنى' : 'إضافة مبنى جديد'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">رقم المبنى *</label>
            <input {...register('building_number')} className="input-field" />
            {errors.building_number && <p className="mt-1 text-xs text-red-600">{errors.building_number.message}</p>}
          </div>

          <div>
            <label className="label-field">اسم المبنى *</label>
            <input {...register('name')} className="input-field" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label-field">القسم / الجهة</label>
            <input {...register('department')} className="input-field" />
          </div>

          <div>
            <label className="label-field">المحطة / الموقع *</label>
            <input
              {...register('station')}
              list="building-stations"
              placeholder="مثال: الحرم الرئيسي أو محطة جدة"
              className="input-field"
            />
            <datalist id="building-stations">
              {(stations ?? []).map((station) => (
                <option key={station} value={station} />
              ))}
            </datalist>
            {errors.station && <p className="mt-1 text-xs text-red-600">{errors.station.message}</p>}
          </div>

          <div>
            <label className="label-field">الموقع التفصيلي</label>
            <input {...register('location')} placeholder="مثال: المنطقة الشرقية من المحطة" className="input-field" />
          </div>

          <div>
            <label className="label-field">المسؤول</label>
            <input {...register('responsible_person')} className="input-field" />
          </div>

          <div>
            <label className="label-field">رقم التواصل</label>
            <input {...register('contact_phone')} className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input {...register('contact_email')} type="email" className="input-field" dir="ltr" />
            {errors.contact_email && <p className="mt-1 text-xs text-red-600">{errors.contact_email.message}</p>}
          </div>

          <div>
            <label className="label-field">حالة المبنى</label>
            <select {...register('status')} className="input-field">
              <option value="ready">جاهز</option>
              <option value="watch">يحتاج متابعة</option>
              <option value="fault">يوجد عطل</option>
              <option value="unknown">بيانات غير كافية</option>
            </select>
          </div>

          <div>
            <label className="label-field">أهمية المبنى *</label>
            <select {...register('criticality')} className="input-field">
              <option value="normal">عادي</option>
              <option value="critical">حرج</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">استخدم «حرج» للمباني التي تؤثر أعطالها مباشرة على التشغيل أو الخدمات الأساسية.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">صورة المبنى (JPG/PNG، حتى 10MB)</label>
            <input type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleImageChange} className="input-field" />
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الوصف</label>
            <textarea {...register('description')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">ملاحظات</label>
            <textarea {...register('notes')} rows={2} className="input-field" />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {building ? 'حفظ التعديلات' : 'إضافة المبنى'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
