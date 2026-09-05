'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import toast from 'react-hot-toast';
import type { Building, Equipment, MaintenanceRecord } from '@/types/database.types';
import { uploadFile } from '@/lib/storage/client';
import { useLanguage } from '@/lib/i18n/context';

interface FormValues {
  maintenance_number: string;
  building_id: string;
  equipment_id: string;
  maintenance_type: string;
  category: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  maintenance_date: string;
  work_description: string;
  problem_found: string;
  action_taken: string;
  technician_name: string;
  engineer_name: string;
  cost: string;
  notes: string;
  recommendations: string;
  next_maintenance_date: string;
  repeat_enabled: boolean;
  repeat_every_days: string;
}

interface SparePartOption {
  id: string;
  part_name: string;
  part_number: string | null;
  quantity_available: number;
}

interface UsedSparePart {
  id?: string;
  spare_part_id: string;
  quantity_used: number;
  deducted: boolean;
  deducted_at?: string | null;
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
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [beforePhotos, setBeforePhotos] = useState<FileList | null>(null);
  const [afterPhotos, setAfterPhotos] = useState<FileList | null>(null);

  const [spareParts, setSpareParts] = useState<SparePartOption[]>([]);
  const [usedSpareParts, setUsedSpareParts] = useState<UsedSparePart[]>([]);
  const [selectedSparePartId, setSelectedSparePartId] = useState('');
  const [selectedSparePartQty, setSelectedSparePartQty] = useState('1');

  const originalStatus = record
    ? ((record as any).status as FormValues['status'])
    : null;

  // إذا كان الطلب مكتملًا عند فتح الفورم، نقفل تعديل القطع.
  // إذا أردت تعديلها: غيّر الحالة إلى "جاري التنفيذ"، احفظ، ثم افتح الطلب مرة أخرى.
  const partsLocked = originalStatus === 'completed';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: record
      ? {
          maintenance_number: record.maintenance_number,
          building_id: record.building_id,
          equipment_id: record.equipment_id ?? '',
          maintenance_type: record.maintenance_type ?? '',
          category: record.category,
          status: ((record as any).status ?? 'completed') as FormValues['status'],
          maintenance_date: record.maintenance_date,
          work_description: record.work_description ?? '',
          problem_found: (record as any).problem_found ?? '',
          action_taken: (record as any).action_taken ?? '',
          technician_name: record.technician_name ?? '',
          engineer_name: record.engineer_name ?? '',
          cost:
            (record as any).cost !== null && (record as any).cost !== undefined
              ? String((record as any).cost)
              : '',
          notes: (record as any).notes ?? '',
          recommendations: (record as any).recommendations ?? '',
          next_maintenance_date: record.next_maintenance_date ?? '',
          repeat_enabled: false,
          repeat_every_days: '90',
        }
      : {
          maintenance_number: '',
          building_id: '',
          equipment_id: '',
          maintenance_type: '',
          category: 'preventive',
          status: 'completed',
          maintenance_date: new Date().toISOString().slice(0, 10),
          work_description: '',
          problem_found: '',
          action_taken: '',
          technician_name: '',
          engineer_name: '',
          cost: '',
          notes: '',
          recommendations: '',
          next_maintenance_date: '',
          repeat_enabled: false,
          repeat_every_days: '90',
        },
  });

  const selectedBuilding = watch('building_id');
  const maintenanceDate = watch('maintenance_date');
  const repeatEnabled = watch('repeat_enabled');
  const repeatEveryDays = watch('repeat_every_days');

  useEffect(() => {
    async function loadEquipment() {
      if (!selectedBuilding) {
        setEquipment([]);
        return;
      }

      const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (!department) {
        setEquipment([]);
        return;
      }

      const { data } = await supabase
        .from('equipment')
        .select('*')
        .eq('building_id', selectedBuilding)
        .eq('department_id', department.id)
        .is('deleted_at', null);

      setEquipment(data ?? []);
    }

    loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding]);

  useEffect(() => {
    async function loadSpareParts() {
      const { data, error } = await supabase
        .from('spare_parts')
        .select('id, part_name, part_number, quantity_available')
        .order('part_name');

      if (error) {
        toast.error(
          lang === 'ar'
            ? 'تعذر تحميل قطع الغيار'
            : 'Could not load spare parts'
        );
        return;
      }

      setSpareParts(
        (data ?? []).map((part: any) => ({
          id: part.id,
          part_name: part.part_name,
          part_number: part.part_number ?? null,
          quantity_available: Number(part.quantity_available ?? 0),
        }))
      );
    }

    loadSpareParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadUsedSpareParts() {
      if (!record?.id) {
        setUsedSpareParts([]);
        return;
      }

      const { data, error } = await supabase
        .from('maintenance_spare_parts')
        .select('id, spare_part_id, quantity_used, deducted, deducted_at')
        .eq('maintenance_id', record.id)
        .order('created_at');

      if (error) {
        toast.error(
          lang === 'ar'
            ? 'تعذر تحميل قطع الغيار المستخدمة'
            : 'Could not load used spare parts'
        );
        return;
      }

      setUsedSpareParts(
        (data ?? []).map((item: any) => ({
          id: item.id,
          spare_part_id: item.spare_part_id,
          quantity_used: Number(item.quantity_used),
          deducted: Boolean(item.deducted),
          deducted_at: item.deducted_at,
        }))
      );
    }

    loadUsedSpareParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  useEffect(() => {
    if (!repeatEnabled || !maintenanceDate) return;

    const days = Number(repeatEveryDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return;

    const d = new Date(`${maintenanceDate}T00:00:00`);
    d.setDate(d.getDate() + days);

    setValue('next_maintenance_date', d.toISOString().slice(0, 10), {
      shouldValidate: true,
    });
  }, [maintenanceDate, repeatEnabled, repeatEveryDays, setValue]);

  useEffect(() => {
    if (!record?.schedule_id) return;

    supabase
      .from('maintenance_schedules')
      .select('frequency, interval_count, is_active')
      .eq('id', record.schedule_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.frequency === 'days' && data.is_active) {
          setValue('repeat_enabled', true);
          setValue('repeat_every_days', String(data.interval_count));
        }
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.schedule_id]);

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

  function addSparePart() {
    if (partsLocked) {
      toast.error(
        lang === 'ar'
          ? 'لا يمكن تعديل قطع الغيار بعد إكمال الطلب'
          : 'Spare parts cannot be changed after completion'
      );
      return;
    }

    if (!selectedSparePartId) {
      toast.error(lang === 'ar' ? 'اختر قطعة غيار' : 'Select a spare part');
      return;
    }

    const quantity = Number(selectedSparePartQty);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error(lang === 'ar' ? 'أدخل كمية صحيحة' : 'Enter a valid quantity');
      return;
    }

    const part = spareParts.find(
      (item) => item.id === selectedSparePartId
    );

    if (!part) {
      toast.error(
        lang === 'ar' ? 'قطعة الغيار غير موجودة' : 'Spare part not found'
      );
      return;
    }

    if (quantity > part.quantity_available) {
      toast.error(
        lang === 'ar'
          ? `الكمية المتوفرة فقط ${part.quantity_available}`
          : `Only ${part.quantity_available} available`
      );
      return;
    }

    const alreadyAdded = usedSpareParts.some(
      (item) => item.spare_part_id === selectedSparePartId
    );

    if (alreadyAdded) {
      toast.error(
        lang === 'ar'
          ? 'هذه القطعة مضافة مسبقًا'
          : 'This spare part is already added'
      );
      return;
    }

    setUsedSpareParts((prev) => [
      ...prev,
      {
        spare_part_id: selectedSparePartId,
        quantity_used: quantity,
        deducted: false,
      },
    ]);

    setSelectedSparePartId('');
    setSelectedSparePartQty('1');
  }

  function updateSparePartQuantity(index: number, value: string) {
    const quantity = Number(value);

    setUsedSpareParts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity_used: Number.isFinite(quantity) ? quantity : 0,
            }
          : item
      )
    );
  }

  function removeSparePart(index: number) {
    setUsedSpareParts((prev) => {
      const item = prev[index];

      if (item?.deducted) {
        toast.error(
          lang === 'ar'
            ? 'لا يمكن حذف قطعة تم خصمها من المخزون'
            : 'A deducted spare part cannot be removed'
        );
        return prev;
      }

      return prev.filter((_, i) => i !== index);
    });
  }

  function buildSparePartsSummary() {
    return usedSpareParts
      .map((item) => {
        const part = spareParts.find(
          (p) => p.id === item.spare_part_id
        );

        return `${part?.part_name ?? 'Spare Part'} × ${item.quantity_used}`;
      })
      .join('، ');
  }

  async function saveUsedSpareParts(maintenanceId: string) {
    const editableRows = usedSpareParts.filter(
      (item) => !item.deducted
    );

    for (const item of editableRows) {
      if (
        !Number.isFinite(item.quantity_used) ||
        item.quantity_used <= 0
      ) {
        throw new Error(
          lang === 'ar'
            ? 'يوجد كمية غير صحيحة في قطع الغيار'
            : 'Invalid spare part quantity'
        );
      }

      const part = spareParts.find(
        (p) => p.id === item.spare_part_id
      );

      if (
        part &&
        item.quantity_used > part.quantity_available
      ) {
        throw new Error(
          lang === 'ar'
            ? `الكمية المطلوبة من ${part.part_name} أكبر من المتوفر`
            : `Requested quantity of ${part.part_name} exceeds available stock`
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('maintenance_spare_parts')
      .delete()
      .eq('maintenance_id', maintenanceId)
      .eq('deducted', false);

    if (deleteError) throw deleteError;

    if (editableRows.length === 0) return;

    const { error: insertError } = await supabase
      .from('maintenance_spare_parts')
      .insert(
        editableRows.map((item) => ({
          maintenance_id: maintenanceId,
          spare_part_id: item.spare_part_id,
          quantity_used: item.quantity_used,
        }))
      );

    if (insertError) throw insertError;
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);

    try {
      const { data: department, error: departmentError } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (departmentError || !department) {
        throw new Error(
          lang === 'ar' ? 'تعذر تحديد القسم' : 'Could not determine department'
        );
      }

      const finalStatus = values.status;

      const isCompletingNow =
        finalStatus === 'completed' &&
        originalStatus !== 'completed';

      const statusBeforeParts: FormValues['status'] =
        isCompletingNow
          ? originalStatus && originalStatus !== 'completed'
            ? originalStatus
            : 'in_progress'
          : finalStatus;

      const sparePartsSummary = buildSparePartsSummary();

      const payload: any = {
        department_id: department.id,
        maintenance_number: values.maintenance_number,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        maintenance_type: values.maintenance_type,
        category: values.category,

        // إذا الطلب سيُكمل الآن، نحفظه أولًا بحالة غير مكتملة،
        // ثم نحفظ القطع، وبعدها نحوله إلى completed لتشغيل الـ Trigger.
        status: statusBeforeParts,

        maintenance_date: values.maintenance_date,
        work_description: values.work_description,
        problem_found: values.problem_found,
        action_taken: values.action_taken,

        // نخلي الحقل القديم موجودًا للتقارير والبحث،
        // لكن المصدر الحقيقي للقطع أصبح جدول maintenance_spare_parts.
        spare_parts_used: sparePartsSummary || null,

        technician_name: values.technician_name,
        engineer_name: values.engineer_name,
        cost: values.cost ? Number(values.cost) : null,
        notes: values.notes,
        recommendations: values.recommendations,
        next_maintenance_date: values.next_maintenance_date || null,
      };

      let savedId = record?.id;

      if (record) {
        const { error } = await supabase
          .from('maintenance_records')
          .update(payload)
          .eq('id', record.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('maintenance_records')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;

        savedId = data.id;
      }

      if (!savedId) {
        throw new Error(
          lang === 'ar'
            ? 'تعذر تحديد رقم سجل الصيانة'
            : 'Could not determine maintenance record ID'
        );
      }

      // الطلبات المكتملة مسبقًا تكون قطعها مقفلة.
      // باقي الحالات: نحفظ القطع قبل أي انتقال إلى completed.
      if (originalStatus !== 'completed') {
        await saveUsedSpareParts(savedId);
      }

      // الآن فقط نغيّر الحالة إلى completed.
      // هنا يعمل Trigger في Supabase ويخصم المخزون تلقائيًا.
      if (isCompletingNow) {
        const { error: completeError } = await supabase
          .from('maintenance_records')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            spare_parts_used: sparePartsSummary || null,
          })
          .eq('id', savedId);

        if (completeError) throw completeError;
      }

      // إذا فُعّل التكرار، أنشئ/حدّث جدولة دورية تبدأ من موعد الصيانة القادمة.
      if (values.repeat_enabled) {
        const everyDays = Number(values.repeat_every_days);

        if (
          !Number.isInteger(everyDays) ||
          everyDays < 1 ||
          everyDays > 3650
        ) {
          throw new Error(
            lang === 'ar'
              ? 'عدد أيام التكرار يجب أن يكون بين 1 و3650'
              : 'Repeat interval must be between 1 and 3650 days'
          );
        }

        if (!values.next_maintenance_date) {
          throw new Error(
            lang === 'ar'
              ? 'تعذر حساب موعد الصيانة القادمة'
              : 'Could not calculate the next maintenance date'
          );
        }

        const selectedEquipment = equipment.find(
          (e) => e.id === values.equipment_id
        );

        const selectedBuildingRow = buildings.find(
          (b) => b.id === values.building_id
        );

        const targetName =
          selectedEquipment?.name ?? selectedBuildingRow?.name ?? '';

        const schedulePayload: any = {
          department_id: department.id,
          title: `${
            values.maintenance_type ||
            (lang === 'ar' ? 'صيانة دورية' : 'Recurring maintenance')
          }${targetName ? ` — ${targetName}` : ''}`,
          building_id: values.building_id,
          equipment_id: values.equipment_id || null,
          category: values.category,
          maintenance_type: values.maintenance_type || null,
          work_description: values.work_description || null,
          technician_name: values.technician_name || null,
          engineer_name: values.engineer_name || null,
          frequency: 'days',
          interval_count: everyDays,
          start_date: values.next_maintenance_date,
          next_due_date: values.next_maintenance_date,
          number_prefix: 'MNT-AUTO',
          auto_generate: true,
          is_active: true,
          notes: values.notes || null,
        };

        if (record?.schedule_id) {
          const { error } = await supabase
            .from('maintenance_schedules')
            .update(schedulePayload)
            .eq('id', record.schedule_id);

          if (error) throw error;
        } else {
          const { data: scheduleRow, error } = await supabase
            .from('maintenance_schedules')
            .insert(schedulePayload)
            .select('id')
            .single();

          if (error) throw error;

          if (savedId && scheduleRow?.id) {
            const { error: linkError } = await supabase
              .from('maintenance_records')
              .update({ schedule_id: scheduleRow.id })
              .eq('id', savedId);

            if (linkError) throw linkError;
          }
        }
      } else if (record?.schedule_id) {
        const { error } = await supabase
          .from('maintenance_schedules')
          .update({ is_active: false })
          .eq('id', record.schedule_id);

        if (error) throw error;
      }

      // رفع الصور كمرفقات مرتبطة بسجل الصيانة.
      const beforeUrls = await uploadPhotos(beforePhotos, 'documents');
      const afterUrls = await uploadPhotos(afterPhotos, 'documents');

      const attachmentRows = [
        ...beforeUrls.map((url) => ({
          file_name: 'صورة قبل العمل',
          file_url: url,
          category: 'maintenance_report',
          maintenance_id: savedId,
          description: 'قبل الصيانة',
        })),
        ...afterUrls.map((url) => ({
          file_name: 'صورة بعد العمل',
          file_url: url,
          category: 'maintenance_report',
          maintenance_id: savedId,
          description: 'بعد الصيانة',
        })),
      ];

      if (attachmentRows.length > 0) {
        const { error: attachmentError } = await supabase
          .from('attachments')
          .insert(attachmentRows);

        if (attachmentError) throw attachmentError;
      }

      toast.success(
        record
          ? lang === 'ar'
            ? 'تم تحديث سجل الصيانة'
            : 'Maintenance record updated'
          : lang === 'ar'
            ? 'تم تسجيل الصيانة بنجاح'
            : 'Maintenance recorded successfully'
      );

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
            {record ? 'تعديل سجل الصيانة' : 'تسجيل صيانة جديدة'}
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
            <label className="label-field">رقم الصيانة *</label>
            <input
              {...register('maintenance_number', { required: 'مطلوب' })}
              className="input-field"
              dir="ltr"
            />
            {errors.maintenance_number && (
              <p className="mt-1 text-xs text-red-600">
                {errors.maintenance_number.message}
              </p>
            )}
          </div>

          <div>
            <label className="label-field">نوع العمل</label>
            <input
              {...register('maintenance_type')}
              className="input-field"
              placeholder="مثال: تغيير زيت"
            />
          </div>

          <div>
            <label className="label-field">المبنى *</label>
            <select
              {...register('building_id', { required: true })}
              className="input-field"
            >
              <option value="">اختر المبنى</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">المعدة</label>
            <select {...register('equipment_id')} className="input-field">
              <option value="">بدون تحديد معدة</option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.asset_id})
                </option>
              ))}
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
            <label className="label-field">
              {lang === 'ar' ? 'حالة الصيانة' : 'Maintenance status'}
            </label>

            <select {...register('status')} className="input-field">
              <option value="pending">
                {lang === 'ar' ? 'قيد الانتظار' : 'Pending'}
              </option>
              <option value="in_progress">
                {lang === 'ar' ? 'جاري التنفيذ' : 'In progress'}
              </option>
              <option value="completed">
                {lang === 'ar' ? 'مكتملة' : 'Completed'}
              </option>
              <option value="cancelled">
                {lang === 'ar' ? 'ملغاة' : 'Cancelled'}
              </option>
            </select>
          </div>

          <div>
            <label className="label-field">تاريخ الصيانة *</label>
            <input
              {...register('maintenance_date', { required: true })}
              type="date"
              className="input-field"
            />
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
            <input
              {...register('cost')}
              type="number"
              step="0.01"
              className="input-field"
              dir="ltr"
            />
          </div>

          <div>
            <label className="label-field">
              {lang === 'ar'
                ? 'موعد الصيانة القادمة'
                : 'Next maintenance date'}
            </label>

            <input
              {...register('next_maintenance_date')}
              type="date"
              className="input-field"
              readOnly={repeatEnabled}
            />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input type="checkbox" {...register('repeat_enabled')} />
              {lang === 'ar'
                ? 'تكرار هذه الصيانة تلقائيًا'
                : 'Repeat this maintenance automatically'}
            </label>

            {repeatEnabled && (
              <div className="mt-3">
                <label className="label-field">
                  {lang === 'ar'
                    ? 'تتكرر كل كم يوم؟'
                    : 'Repeat every how many days?'}
                </label>

                <div className="flex flex-wrap gap-2">
                  <input
                    {...register('repeat_every_days')}
                    type="number"
                    min={1}
                    max={3650}
                    step={1}
                    className="input-field max-w-[180px]"
                    dir="ltr"
                  />

                  {[7, 14, 30, 60, 90, 180, 365].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() =>
                        setValue('repeat_every_days', String(days))
                      }
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      {days} {lang === 'ar' ? 'يوم' : 'days'}
                    </button>
                  ))}
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  {lang === 'ar'
                    ? 'مثال: 14 = كل أسبوعين، 30 = كل 30 يوم، 90 = كل 90 يوم. سيُحسب الموعد القادم تلقائيًا ويستمر النظام بنفس الفاصل.'
                    : 'Examples: 14 = every 2 weeks, 30 = every 30 days, 90 = every 90 days. The next date is calculated automatically and continues at the same interval.'}
                </p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">وصف العمل</label>
            <textarea
              {...register('work_description')}
              rows={2}
              className="input-field"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">المشكلة</label>
            <textarea
              {...register('problem_found')}
              rows={2}
              className="input-field"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الإجراء المتخذ</label>
            <textarea
              {...register('action_taken')}
              rows={2}
              className="input-field"
            />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">
                {lang === 'ar'
                  ? 'قطع الغيار المستخدمة'
                  : 'Used spare parts'}
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                {lang === 'ar'
                  ? 'سيتم خصم الكميات من المخزون تلقائيًا عند إكمال طلب العمل.'
                  : 'Quantities will be automatically deducted when the work order is completed.'}
              </p>
            </div>

            {partsLocked && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {lang === 'ar'
                  ? 'هذا الطلب مكتمل. لحماية المخزون لا يمكن تعديل قطع الغيار بعد الإكمال. إذا احتجت إضافة قطع جديدة، غيّر الحالة إلى جاري التنفيذ واحفظ الطلب، ثم افتحه مرة أخرى.'
                  : 'This work order is completed. Spare parts are locked to protect inventory. Reopen the work order first if you need to add new parts.'}
              </div>
            )}

            {!partsLocked && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]">
                <div>
                  <label className="label-field">
                    {lang === 'ar' ? 'قطعة الغيار' : 'Spare part'}
                  </label>

                  <select
                    value={selectedSparePartId}
                    onChange={(e) =>
                      setSelectedSparePartId(e.target.value)
                    }
                    className="input-field"
                  >
                    <option value="">
                      {lang === 'ar' ? 'اختر قطعة' : 'Select part'}
                    </option>

                    {spareParts.map((part) => {
                      const alreadyAdded = usedSpareParts.some(
                        (item) => item.spare_part_id === part.id
                      );

                      return (
                        <option
                          key={part.id}
                          value={part.id}
                          disabled={
                            part.quantity_available <= 0 || alreadyAdded
                          }
                        >
                          {part.part_name}
                          {part.part_number
                            ? ` (${part.part_number})`
                            : ''}
                          {' — '}
                          {lang === 'ar' ? 'المتوفر' : 'Available'}:{' '}
                          {part.quantity_available}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="label-field">
                    {lang === 'ar' ? 'الكمية' : 'Quantity'}
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={selectedSparePartQty}
                    onChange={(e) =>
                      setSelectedSparePartQty(e.target.value)
                    }
                    className="input-field"
                    dir="ltr"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addSparePart}
                    className="btn-secondary flex w-full items-center justify-center gap-2 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    {lang === 'ar' ? 'إضافة' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {usedSpareParts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  {lang === 'ar'
                    ? 'لم تتم إضافة قطع غيار'
                    : 'No spare parts added'}
                </div>
              ) : (
                usedSpareParts.map((item, index) => {
                  const part = spareParts.find(
                    (p) => p.id === item.spare_part_id
                  );

                  return (
                    <div
                      key={
                        item.id ?? `${item.spare_part_id}-${index}`
                      }
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900">
                          {part?.part_name ?? 'Spare Part'}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {part?.part_number && (
                            <>
                              {lang === 'ar'
                                ? 'رقم القطعة'
                                : 'Part no.'}
                              : {part.part_number}
                              {' • '}
                            </>
                          )}

                          {lang === 'ar'
                            ? 'المتوفر حاليًا'
                            : 'Current stock'}
                          : {part?.quantity_available ?? '-'}
                        </div>
                      </div>

                      <div className="w-full sm:w-28">
                        {item.deducted ? (
                          <div className="rounded-lg bg-green-50 px-3 py-2 text-center text-sm font-medium text-green-700">
                            × {item.quantity_used}
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity_used}
                            disabled={partsLocked}
                            onChange={(e) =>
                              updateSparePartQuantity(
                                index,
                                e.target.value
                              )
                            }
                            className="input-field"
                            dir="ltr"
                          />
                        )}
                      </div>

                      {item.deducted ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                          {lang === 'ar'
                            ? 'تم الخصم'
                            : 'Deducted'}
                        </span>
                      ) : (
                        !partsLocked && (
                          <button
                            type="button"
                            onClick={() => removeSparePart(index)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            title={
                              lang === 'ar'
                                ? 'حذف القطعة'
                                : 'Remove part'
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="label-field">صور قبل العمل</label>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/jpg"
              onChange={(e) => setBeforePhotos(e.target.files)}
              className="input-field"
            />
          </div>

          <div>
            <label className="label-field">صور بعد العمل</label>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/jpg"
              onChange={(e) => setAfterPhotos(e.target.files)}
              className="input-field"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الملاحظات والتوصيات</label>

            <textarea
              {...register('notes')}
              rows={2}
              className="input-field"
              placeholder="ملاحظات"
            />

            <textarea
              {...register('recommendations')}
              rows={2}
              className="input-field mt-2"
              placeholder="توصيات"
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
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {record ? 'حفظ التعديلات' : 'تسجيل الصيانة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
