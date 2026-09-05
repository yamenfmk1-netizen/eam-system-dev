'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import toast from 'react-hot-toast';
import { EQUIPMENT_TYPE_LABELS } from '@/types/database.types';
import type { SparePart } from '@/types/database.types';
import { warrantyStatus, warrantyDaysLeft } from '@/types/database.types';
import { zodResolver } from '@hookform/resolvers/zod';
import { sparePartSchema, type SparePartInput } from '@/lib/validation/schemas';
import {
  validateFile,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  FileValidationError,
} from '@/lib/storage/upload';
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
  const [loadingDepartmentData, setLoadingDepartmentData] = useState(true);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SparePartInput>({
    resolver: zodResolver(sparePartSchema),
    defaultValues: sparePart
      ? {
          part_name: sparePart.part_name,
          part_number: sparePart.part_number ?? '',
          manufacturer: sparePart.manufacturer ?? '',
          compatible_equipment_type:
            sparePart.compatible_equipment_type ?? '',
          quantity_available: sparePart.quantity_available ?? 0,
          minimum_stock: sparePart.minimum_stock ?? 0,
          storage_location: sparePart.storage_location ?? '',
          supplier: sparePart.supplier ?? '',
          price: sparePart.price?.toString() ?? '',
          purchase_date: sparePart.purchase_date ?? '',
          expiry_date: sparePart.expiry_date ?? '',
          warranty_start_date: sparePart.warranty_start_date ?? '',
          warranty_end_date: sparePart.warranty_end_date ?? '',
          warranty_provider: sparePart.warranty_provider ?? '',
          notes: sparePart.notes ?? '',
        }
      : {
          quantity_available: 0,
          minimum_stock: 0,
        },
  });

  const warrantyEnd = watch('warranty_end_date');
  const warrantyState = warrantyStatus(warrantyEnd || null);
  const warrantyDays = warrantyDaysLeft(warrantyEnd || null);

  useEffect(() => {
    let cancelled = false;

    async function loadDepartmentEquipmentTypes() {
      setLoadingDepartmentData(true);

      try {
        // 1) نحدد القسم تلقائيًا من الموقع الحالي.
        const {
          data: department,
          error: departmentError,
        } = await supabase
          .from('departments')
          .select('id')
          .eq('code', DEPARTMENT_CODE)
          .single();

        if (departmentError || !department) {
          throw new Error('تعذر تحديد القسم الخاص بالموقع الحالي');
        }

        if (cancelled) return;

        setDepartmentId(department.id);

        // 2) نقرأ أنواع المعدات الموجودة فعليًا في هذا القسم فقط.
        const {
          data: equipmentRows,
          error: equipmentError,
        } = await supabase
          .from('equipment')
          .select('equipment_type')
          .eq('department_id', department.id)
          .is('deleted_at', null);

        if (equipmentError) {
          throw equipmentError;
        }

        const uniqueTypes = Array.from(
          new Set(
            (equipmentRows ?? [])
              .map((row: any) => row.equipment_type)
              .filter(
                (value: unknown): value is string =>
                  typeof value === 'string' && value.length > 0
              )
          )
        ).sort((a, b) => {
          const labelA =
            (EQUIPMENT_TYPE_LABELS as Record<string, string>)[a] ?? a;
          const labelB =
            (EQUIPMENT_TYPE_LABELS as Record<string, string>)[b] ?? b;
          return labelA.localeCompare(labelB, 'ar');
        });

        // عند تعديل قطعة قديمة، نضمن أن نوعها الحالي يظل ظاهرًا
        // حتى لو لم تعد توجد معدة حالية من نفس النوع.
        const currentType = sparePart?.compatible_equipment_type ?? null;

        if (
          currentType &&
          !uniqueTypes.includes(currentType as string)
        ) {
          uniqueTypes.push(currentType as string);
        }

        if (!cancelled) {
          setEquipmentTypes(uniqueTypes);
        }
      } catch (err: any) {
        if (!cancelled) {
          setDepartmentId(null);
          setEquipmentTypes([]);
          toast.error(
            err?.message ??
              'تعذر تحميل بيانات القسم وأنواع المعدات'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDepartmentData(false);
        }
      }
    }

    loadDepartmentEquipmentTypes();

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function equipmentTypeLabel(value: string) {
    return (
      (EQUIPMENT_TYPE_LABELS as Record<string, string>)[value] ??
      value.replaceAll('_', ' ')
    );
  }

  function handleImageChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0] ?? null;

    setImageError(null);

    if (!file) {
      setImageFile(null);
      return;
    }

    try {
      validateFile(file, {
        allowedTypes: ALLOWED_IMAGE_TYPES,
        maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
      });

      setImageFile(file);
    } catch (err) {
      if (err instanceof FileValidationError) {
        setImageError(err.message);
      }

      setImageFile(null);
      e.target.value = '';
    }
  }

  async function onSubmit(values: SparePartInput) {
    setLoading(true);

    try {
      if (!departmentId) {
        throw new Error(
          'تعذر تحديد القسم. أعد فتح النافذة وحاول مرة أخرى.'
        );
      }

      let image_url: string | null = null;

      if (imageFile) {
        image_url = await uploadFile('documents', imageFile);
      }

      const payload: any = {
        // القسم لا يختاره المستخدم يدويًا.
        // يتم ربط القطعة تلقائيًا بقسم الموقع الحالي.
        department_id: departmentId,

        part_name: values.part_name,
        part_number: values.part_number || null,
        manufacturer: values.manufacturer || null,
        compatible_equipment_type:
          values.compatible_equipment_type || null,
        quantity_available: values.quantity_available,
        minimum_stock: values.minimum_stock,
        storage_location: values.storage_location || null,
        supplier: values.supplier || null,
        price: values.price ? Number(values.price) : null,
        purchase_date: values.purchase_date || null,
        expiry_date: values.expiry_date || null,
        warranty_start_date:
          values.warranty_start_date || null,
        warranty_end_date: values.warranty_end_date || null,
        warranty_provider:
          values.warranty_provider || null,
        notes: values.notes || null,
      };

      if (image_url) {
        payload.image_url = image_url;
      }

      if (sparePart) {
        const { error } = await supabase
          .from('spare_parts')
          .update(payload)
          .eq('id', sparePart.id);

        if (error) throw error;

        toast.success('تم تحديث قطعة الغيار');
      } else {
        const { error } = await supabase
          .from('spare_parts')
          .insert(payload);

        if (error) throw error;

        toast.success('تمت إضافة قطعة الغيار بنجاح');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(
        err.message ?? 'حدث خطأ، حاول مرة أخرى'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {sparePart
              ? 'تعديل قطعة الغيار'
              : 'إضافة قطعة غيار'}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div>
            <label className="label-field">
              اسم القطعة *
            </label>

            <input
              {...register('part_name', {
                required: 'مطلوب',
              })}
              className="input-field"
            />

            {errors.part_name && (
              <p className="mt-1 text-xs text-red-600">
                {errors.part_name.message}
              </p>
            )}
          </div>

          <div>
            <label className="label-field">
              Part Number
            </label>

            <input
              {...register('part_number')}
              className="input-field"
              dir="ltr"
            />
          </div>

          <div>
            <label className="label-field">
              الشركة المصنعة
            </label>

            <input
              {...register('manufacturer')}
              className="input-field"
            />
          </div>

          <div>
            <label className="label-field">
              نوع المعدات المناسبة
            </label>

            <select
              {...register(
                'compatible_equipment_type'
              )}
              className="input-field"
              disabled={loadingDepartmentData}
            >
              <option value="">
                {loadingDepartmentData
                  ? 'جاري تحميل أنواع معدات القسم...'
                  : 'غير محدد'}
              </option>

              {equipmentTypes.map((value) => (
                <option
                  key={value}
                  value={value}
                >
                  {equipmentTypeLabel(value)}
                </option>
              ))}
            </select>

            {!loadingDepartmentData &&
              equipmentTypes.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  لا توجد أنواع معدات مسجلة لهذا
                  القسم حاليًا. يمكنك ترك الخيار
                  «غير محدد».
                </p>
              )}
          </div>

          <div>
            <label className="label-field">
              الكمية المتوفرة *
            </label>

            <input
              {...register('quantity_available', {
                required: true,
              })}
              type="number"
              step="1"
              className="input-field"
              dir="ltr"
            />
          </div>

          <div>
            <label className="label-field">
              الحد الأدنى للمخزون *
            </label>

            <input
              {...register('minimum_stock', {
                required: true,
              })}
              type="number"
              step="1"
              className="input-field"
              dir="ltr"
            />
          </div>

          <div>
            <label className="label-field">
              موقع التخزين
            </label>

            <input
              {...register('storage_location')}
              className="input-field"
            />
          </div>

          <div>
            <label className="label-field">
              المورد
            </label>

            <input
              {...register('supplier')}
              className="input-field"
            />
          </div>

          <div>
            <label className="label-field">
              السعر
            </label>

            <input
              {...register('price')}
              type="number"
              step="0.01"
              className="input-field"
              dir="ltr"
            />
          </div>

          <div>
            <label className="label-field">
              تاريخ الشراء
            </label>

            <input
              {...register('purchase_date')}
              type="date"
              className="input-field"
            />
          </div>

          <div>
            <label className="label-field">
              تاريخ الانتهاء (إن وجد)
            </label>

            <input
              {...register('expiry_date')}
              type="date"
              className="input-field"
            />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-800">
              بيانات الضمان
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label-field">
                  بداية الضمان
                </label>

                <input
                  {...register(
                    'warranty_start_date'
                  )}
                  type="date"
                  className="input-field"
                />
              </div>

              <div>
                <label className="label-field">
                  انتهاء الضمان
                </label>

                <input
                  {...register(
                    'warranty_end_date'
                  )}
                  type="date"
                  className="input-field"
                />

                {errors.warranty_end_date && (
                  <p className="mt-1 text-xs text-red-600">
                    {
                      errors.warranty_end_date
                        .message
                    }
                  </p>
                )}
              </div>

              <div>
                <label className="label-field">
                  جهة الضمان
                </label>

                <input
                  {...register(
                    'warranty_provider'
                  )}
                  className="input-field"
                  placeholder="المورد أو الوكيل"
                />
              </div>
            </div>

            {warrantyEnd && (
              <p
                className={`mt-3 text-xs ${
                  warrantyState === 'expired'
                    ? 'text-red-600'
                    : warrantyState ===
                        'expiring_soon'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                }`}
              >
                {warrantyState === 'expired'
                  ? `الضمان منتهٍ منذ ${Math.abs(
                      warrantyDays ?? 0
                    )} يومًا`
                  : warrantyState ===
                      'expiring_soon'
                    ? `ينتهي الضمان خلال ${warrantyDays} يومًا`
                    : `الضمان ساري — متبقٍ ${warrantyDays} يومًا`}
              </p>
            )}
          </div>

          <div>
            <label className="label-field">
              صورة القطعة
            </label>

            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleImageChange}
              className="input-field"
            />

            {imageError && (
              <p className="mt-1 text-xs text-red-600">
                {imageError}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">
              ملاحظات
            </label>

            <textarea
              {...register('notes')}
              rows={2}
              className="input-field"
            />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={
                loading || loadingDepartmentData
              }
              className="btn-primary flex-1"
            >
              {(loading ||
                loadingDepartmentData) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}

              {sparePart
                ? 'حفظ التعديلات'
                : 'إضافة القطعة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
