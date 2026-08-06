'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { EQUIPMENT_TYPE_LABELS } from '@/types/database.types';
import type { Building, Equipment } from '@/types/database.types';
import { equipmentSchema, type EquipmentInput } from '@/lib/validation/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { validateFile, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, FileValidationError } from '@/lib/storage/upload';
import { uploadFile } from '@/lib/storage/client';

export default function EquipmentForm({
  equipment,
  buildings,
  defaultBuildingId,
  onClose,
  onSaved,
}: {
  equipment?: Equipment;
  buildings: Building[];
  defaultBuildingId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<EquipmentInput>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: equipment
      ? {
          asset_id: equipment.asset_id,
          name: equipment.name,
          type: equipment.type,
          building_id: equipment.building_id,
          location_in_building: equipment.location_in_building ?? '',
          manufacturer: equipment.manufacturer ?? '',
          model: equipment.model ?? '',
          serial_number: equipment.serial_number ?? '',
          manufacturing_year: equipment.manufacturing_year?.toString() ?? '',
          installation_date: equipment.installation_date ?? '',
          status: equipment.status,
          criticality: equipment.criticality,
          notes: equipment.notes ?? '',
        }
      : { status: 'available', criticality: 'medium', building_id: defaultBuildingId ?? '' },
  });

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageError(null);
    if (!file) { setImageFile(null); return; }
    try {
      validateFile(file, { allowedTypes: ALLOWED_IMAGE_TYPES, maxSizeBytes: MAX_IMAGE_SIZE_BYTES });
      setImageFile(file);
    } catch (err) {
      if (err instanceof FileValidationError) setImageError(err.message);
      setImageFile(null);
      e.target.value = '';
    }
  }

  async function onSubmit(values: EquipmentInput) {
    setLoading(true);
    try {
      // image_url يخزّن مسار التخزين (path) وليس رابطًا عامًا
      let image_url = equipment?.image_url ?? null;

      if (imageFile) {
        image_url = await uploadFile('equipment-images', imageFile);
      }

      const payload = {
        ...values,
        manufacturing_year: values.manufacturing_year ? Number(values.manufacturing_year) : null,
        installation_date: values.installation_date || null,
        image_url,
      };

      if (equipment) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', equipment.id);
        if (error) throw error;
        toast.success('تم تحديث بيانات المعدة');
      } else {
        const { error } = await supabase.from('equipment').insert(payload);
        if (error) throw error;
        toast.success('تمت إضافة المعدة بنجاح');
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
            {equipment ? 'تعديل بيانات المعدة' : 'إضافة معدة جديدة'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">رقم الأصل (Asset ID) *</label>
            <input {...register('asset_id', { required: 'مطلوب' })} className="input-field" dir="ltr" />
            {errors.asset_id && <p className="mt-1 text-xs text-red-600">{errors.asset_id.message}</p>}
          </div>

          <div>
            <label className="label-field">اسم المعدة *</label>
            <input {...register('name', { required: 'مطلوب' })} className="input-field" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label-field">نوع المعدة *</label>
            <select {...register('type', { required: true })} className="input-field">
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">المبنى *</label>
            <select {...register('building_id', { required: true })} className="input-field">
              <option value="">اختر المبنى</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name} (مبنى {b.building_number})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">الموقع داخل المبنى</label>
            <input {...register('location_in_building')} className="input-field" />
          </div>

          <div>
            <label className="label-field">الشركة المصنعة</label>
            <input {...register('manufacturer')} className="input-field" />
          </div>

          <div>
            <label className="label-field">الموديل</label>
            <input {...register('model')} className="input-field" />
          </div>

          <div>
            <label className="label-field">الرقم التسلسلي</label>
            <input {...register('serial_number')} className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">سنة التصنيع</label>
            <input {...register('manufacturing_year')} type="number" className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">تاريخ التركيب</label>
            <input {...register('installation_date')} type="date" className="input-field" />
          </div>

          <div>
            <label className="label-field">حالة المعدة</label>
            <select {...register('status')} className="input-field">
              <option value="available">متاح</option>
              <option value="running">يعمل</option>
              <option value="standby">استعداد</option>
              <option value="under_maintenance">تحت الصيانة</option>
              <option value="fault">يوجد عطل</option>
              <option value="out_of_service">خارج الخدمة</option>
            </select>
          </div>

          <div>
            <label className="label-field">درجة الأهمية</label>
            <select {...register('criticality')} className="input-field">
              <option value="low">منخفضة</option>
              <option value="medium">متوسطة</option>
              <option value="high">عالية</option>
              <option value="critical">حرجة</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">صورة المعدة (JPG/PNG، حتى 10MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleImageChange}
              className="input-field"
            />
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
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
              {equipment ? 'حفظ التعديلات' : 'إضافة المعدة'}
            </button>
          </div>
        </form>

        <p className="mt-3 text-xs text-gray-400">
          ملاحظة: الحقول التفصيلية الخاصة بكل نوع معدة (مثل ساعات تشغيل المولد، أو نسبة حمل UPS) تُدار من صفحة تفاصيل المعدة بعد إنشائها.
        </p>
      </div>
    </div>
  );
}
