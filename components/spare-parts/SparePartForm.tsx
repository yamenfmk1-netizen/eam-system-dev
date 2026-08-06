'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { EQUIPMENT_TYPE_LABELS } from '@/types/database.types';
import type { SparePart } from '@/types/database.types';
import { zodResolver } from '@hookform/resolvers/zod';
import { sparePartSchema, type SparePartInput } from '@/lib/validation/schemas';
import { validateFile, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, FileValidationError } from '@/lib/storage/upload';
import { uploadFile } from '@/lib/storage/client';

export default function SparePartForm({
  sparePart,
  onClose,
  onSaved,
}: {
  sparePart?: SparePart;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<SparePartInput>({
    resolver: zodResolver(sparePartSchema),
    defaultValues: sparePart
      ? {
          part_name: sparePart.part_name,
          part_number: sparePart.part_number ?? '',
          manufacturer: sparePart.manufacturer ?? '',
          compatible_equipment_type: sparePart.compatible_equipment_type ?? '',
          quantity_available: sparePart.quantity_available ?? 0,
          minimum_stock: sparePart.minimum_stock ?? 0,
          storage_location: sparePart.storage_location ?? '',
          supplier: sparePart.supplier ?? '',
          price: sparePart.price?.toString() ?? '',
        }
      : { quantity_available: 0, minimum_stock: 0 },
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

  async function onSubmit(values: SparePartInput) {
    setLoading(true);
    try {
      let image_url: string | null = null;

      if (imageFile) {
        image_url = await uploadFile('documents', imageFile);
      }

      const payload: any = {
        part_name: values.part_name,
        part_number: values.part_number || null,
        manufacturer: values.manufacturer || null,
        compatible_equipment_type: values.compatible_equipment_type || null,
        quantity_available: values.quantity_available,
        minimum_stock: values.minimum_stock,
        storage_location: values.storage_location || null,
        supplier: values.supplier || null,
        price: values.price ? Number(values.price) : null,
        purchase_date: values.purchase_date || null,
        expiry_date: values.expiry_date || null,
        notes: values.notes || null,
      };
      if (image_url) payload.image_url = image_url;

      if (sparePart) {
        const { error } = await supabase.from('spare_parts').update(payload).eq('id', sparePart.id);
        if (error) throw error;
        toast.success('تم تحديث قطعة الغيار');
      } else {
        const { error } = await supabase.from('spare_parts').insert(payload);
        if (error) throw error;
        toast.success('تمت إضافة قطعة الغيار بنجاح');
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
          <h2 className="text-lg font-bold text-gray-900">{sparePart ? 'تعديل قطعة الغيار' : 'إضافة قطعة غيار'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">اسم القطعة *</label>
            <input {...register('part_name', { required: 'مطلوب' })} className="input-field" />
            {errors.part_name && <p className="mt-1 text-xs text-red-600">{errors.part_name.message}</p>}
          </div>

          <div>
            <label className="label-field">Part Number</label>
            <input {...register('part_number')} className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">الشركة المصنعة</label>
            <input {...register('manufacturer')} className="input-field" />
          </div>

          <div>
            <label className="label-field">نوع المعدات المناسبة</label>
            <select {...register('compatible_equipment_type')} className="input-field">
              <option value="">غير محدد</option>
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">الكمية المتوفرة *</label>
            <input {...register('quantity_available', { required: true })} type="number" step="1" className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">الحد الأدنى للمخزون *</label>
            <input {...register('minimum_stock', { required: true })} type="number" step="1" className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">موقع التخزين</label>
            <input {...register('storage_location')} className="input-field" />
          </div>

          <div>
            <label className="label-field">المورد</label>
            <input {...register('supplier')} className="input-field" />
          </div>

          <div>
            <label className="label-field">السعر</label>
            <input {...register('price')} type="number" step="0.01" className="input-field" dir="ltr" />
          </div>

          <div>
            <label className="label-field">تاريخ الشراء</label>
            <input {...register('purchase_date')} type="date" className="input-field" />
          </div>

          <div>
            <label className="label-field">تاريخ الانتهاء (إن وجد)</label>
            <input {...register('expiry_date')} type="date" className="input-field" />
          </div>

          <div>
            <label className="label-field">صورة القطعة</label>
            <input type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleImageChange} className="input-field" />
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">ملاحظات</label>
            <textarea {...register('notes')} rows={2} className="input-field" />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {sparePart ? 'حفظ التعديلات' : 'إضافة القطعة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
