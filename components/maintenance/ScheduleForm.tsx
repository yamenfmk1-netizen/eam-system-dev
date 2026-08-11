'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { Building, Equipment, MaintenanceSchedule, ScheduleFrequency } from '@/types/database.types';
import { maintenanceScheduleSchema, type MaintenanceScheduleInput } from '@/lib/validation/schemas';
import { useLanguage } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/dictionary';

const FREQUENCIES: { value: ScheduleFrequency; key: TranslationKey }[] = [
  { value: 'days', key: 'schedule.days' },
  { value: 'weekly', key: 'schedule.weekly' },
  { value: 'monthly', key: 'schedule.monthly' },
  { value: 'quarterly', key: 'schedule.quarterly' },
  { value: 'semiannual', key: 'schedule.semiannual' },
  { value: 'yearly', key: 'schedule.yearly' },
];

/** نفس منطق الدالة next_schedule_date في قاعدة البيانات — للمعاينة الفورية فقط */
function nextDate(base: string, frequency: ScheduleFrequency, steps: number): string {
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return base;
  if (frequency === 'days') d.setDate(d.getDate() + steps);
  else if (frequency === 'weekly') d.setDate(d.getDate() + steps * 7);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + steps);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + steps * 3);
  else if (frequency === 'semiannual') d.setMonth(d.getMonth() + steps * 6);
  else d.setFullYear(d.getFullYear() + steps);
  return d.toISOString().slice(0, 10);
}

export default function ScheduleForm({
  schedule,
  buildings,
  onClose,
  onSaved,
}: {
  schedule?: MaintenanceSchedule;
  buildings: Building[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const { t, lang, formatDate } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<MaintenanceScheduleInput>({
    resolver: zodResolver(maintenanceScheduleSchema),
    defaultValues: schedule
      ? {
          title: schedule.title,
          building_id: schedule.building_id,
          equipment_id: schedule.equipment_id ?? '',
          category: schedule.category,
          maintenance_type: schedule.maintenance_type ?? '',
          work_description: schedule.work_description ?? '',
          technician_name: schedule.technician_name ?? '',
          engineer_name: schedule.engineer_name ?? '',
          frequency: schedule.frequency,
          interval_count: schedule.interval_count,
          start_date: schedule.start_date,
          end_date: schedule.end_date ?? '',
          number_prefix: schedule.number_prefix,
          auto_generate: schedule.auto_generate,
          is_active: schedule.is_active,
          notes: schedule.notes ?? '',
        }
      : {
          category: 'preventive',
          frequency: 'monthly',
          interval_count: 1,
          start_date: new Date().toISOString().slice(0, 10),
          number_prefix: 'MNT-AUTO',
          auto_generate: true,
          is_active: true,
        },
  });

  const selectedBuilding = watch('building_id');
  const startDate = watch('start_date');
  const frequency = watch('frequency');
  const intervalCount = watch('interval_count');

  useEffect(() => {
    if (!selectedBuilding) { setEquipment([]); return; }
    supabase.from('equipment').select('*').eq('building_id', selectedBuilding).is('deleted_at', null)
      .then(({ data }) => setEquipment((data ?? []) as Equipment[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding]);

  const preview = startDate && frequency
    ? [1, 2, 3].map((i) => {
        let d = startDate;
        for (let k = 0; k < i; k++) d = nextDate(d, frequency, Number(intervalCount) || 1);
        return d;
      })
    : [];

  async function onSubmit(values: MaintenanceScheduleInput) {
    setLoading(true);
    try {
      const payload: any = {
        title: values.title,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        category: values.category,
        maintenance_type: values.maintenance_type || null,
        work_description: values.work_description || null,
        technician_name: values.technician_name || null,
        engineer_name: values.engineer_name || null,
        frequency: values.frequency,
        interval_count: Number(values.interval_count),
        start_date: values.start_date,
        end_date: values.end_date || null,
        number_prefix: values.number_prefix,
        auto_generate: values.auto_generate,
        is_active: values.is_active,
        notes: values.notes || null,
      };

      if (schedule) {
        const { error } = await supabase.from('maintenance_schedules').update(payload).eq('id', schedule.id);
        if (error) throw error;
        toast.success(lang === 'ar' ? 'تم تحديث الجدولة' : 'Schedule updated');
      } else {
        // أول استحقاق = تاريخ البداية نفسه
        const { error } = await supabase.from('maintenance_schedules').insert({ ...payload, next_due_date: values.start_date });
        if (error) throw error;
        toast.success(lang === 'ar' ? 'تمت إضافة الجدولة' : 'Schedule created');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? (lang === 'ar' ? 'حدث خطأ، حاول مرة أخرى' : 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{schedule ? t('schedule.edit') : t('schedule.add')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label-field">{t('schedule.name')} *</label>
            <input {...register('title')} className="input-field" placeholder={lang === 'ar' ? 'مثال: الصيانة الشهرية لمولدات مبنى 43' : 'e.g. Monthly PM — Building 43 generators'} />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label-field">{t('common.building')} *</label>
            <select {...register('building_id')} className="input-field">
              <option value="">{lang === 'ar' ? 'اختر المبنى' : 'Select building'}</option>
              {buildings.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
            {errors.building_id && <p className="mt-1 text-xs text-red-600">{errors.building_id.message}</p>}
          </div>

          <div>
            <label className="label-field">{t('common.equipment')}</label>
            <select {...register('equipment_id')} className="input-field">
              <option value="">{lang === 'ar' ? 'بدون تحديد معدة' : 'No specific equipment'}</option>
              {equipment.map((e) => (<option key={e.id} value={e.id}>{e.name} ({e.asset_id})</option>))}
            </select>
          </div>

          <div>
            <label className="label-field">{t('maintenance.type')}</label>
            <select {...register('category')} className="input-field">
              <option value="preventive">{t('maintenance.preventive')}</option>
              <option value="corrective">{t('maintenance.corrective')}</option>
            </select>
          </div>

          <div>
            <label className="label-field">{lang === 'ar' ? 'نوع العمل' : 'Work type'}</label>
            <input {...register('maintenance_type')} className="input-field" placeholder={lang === 'ar' ? 'مثال: تنظيف وتشحيم' : 'e.g. Cleaning & lubrication'} />
          </div>

          <div>
            <label className="label-field">{t('schedule.frequency')} *</label>
            <select {...register('frequency')} className="input-field">
              {FREQUENCIES.map((f) => (<option key={f.value} value={f.value}>{t(f.key)}</option>))}
            </select>
          </div>

          <div>
            <label className="label-field">{t('schedule.every')} *</label>
            <input {...register('interval_count')} type="number" min={1} max={frequency === 'days' ? 3650 : 12} step={1} className="input-field" dir="ltr" />
            {errors.interval_count && <p className="mt-1 text-xs text-red-600">{errors.interval_count.message}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {frequency === 'days'
                ? (lang === 'ar'
                    ? 'اكتب عدد الأيام مباشرة: 14 = كل أسبوعين، 30 = كل 30 يوم، 90 = كل 90 يوم'
                    : 'Enter days directly: 14 = every 2 weeks, 30 = every 30 days, 90 = every 90 days')
                : (lang === 'ar'
                    ? 'المضاعف: 1 = كل دورة، 2 = كل دورتين (مثال: شهري × 2 = كل شهرين)'
                    : 'Multiplier: 1 = every cycle, 2 = every second cycle (monthly × 2 = every 2 months)')}
            </p>
          </div>

          <div>
            <label className="label-field">{t('schedule.startDate')} *</label>
            <input {...register('start_date')} type="date" className="input-field" />
            {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>}
          </div>

          <div>
            <label className="label-field">{t('schedule.endDate')}</label>
            <input {...register('end_date')} type="date" className="input-field" />
            {errors.end_date && <p className="mt-1 text-xs text-red-600">{errors.end_date.message}</p>}
          </div>

          <div>
            <label className="label-field">{t('schedule.prefix')} *</label>
            <input {...register('number_prefix')} className="input-field" dir="ltr" />
            <p className="mt-1 text-xs text-gray-400">
              {lang === 'ar' ? 'رقم السجل المولّد = البادئة + تاريخ الاستحقاق، مثال: MNT-AUTO-20260901' : 'Generated number = prefix + due date, e.g. MNT-AUTO-20260901'}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">{lang === 'ar' ? 'وصف العمل' : 'Work description'}</label>
            <textarea {...register('work_description')} rows={2} className="input-field" />
          </div>

          <div>
            <label className="label-field">{t('maintenance.technician')}</label>
            <input {...register('technician_name')} className="input-field" />
          </div>

          <div>
            <label className="label-field">{lang === 'ar' ? 'اسم المهندس' : 'Engineer'}</label>
            <input {...register('engineer_name')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">{t('common.notes')}</label>
            <textarea {...register('notes')} rows={2} className="input-field" />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register('auto_generate')} />
              {t('schedule.autoGenerate')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register('is_active')} />
              {t('common.active')}
            </label>
          </div>

          {preview.length > 0 && (
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 sm:col-span-2">
              <p className="mb-1 font-medium text-gray-700">{lang === 'ar' ? 'المواعيد الثلاثة القادمة بعد البداية:' : 'Next three occurrences after the start date:'}</p>
              <p dir="ltr" className="text-start">{preview.map((d) => formatDate(d)).join('  ·  ')}</p>
            </div>
          )}

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {schedule ? t('common.saveChanges') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
