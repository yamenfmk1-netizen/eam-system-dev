'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import toast from 'react-hot-toast';
import { TEST_TYPE_LABELS } from '@/types/database.types';
import type { Building, Equipment, TestRecord } from '@/types/database.types';
import { uploadFile } from '@/lib/storage/client';

interface FormValues {
  test_number: string;
  test_type: string;
  building_id: string;
  equipment_id: string;
  test_date: string;
  start_time: string;
  end_time: string;
  interruption_duration_minutes: string;
  responsible_person: string;
  equipment_started_successfully: string;
  ats_worked: string;
  load_transferred: string;
  power_restored_normally: string;
  readings_json: string;
  result: string;
  notes: string;
  recommendations: string;
  next_test_date: string;
}

function boolToFormValue(value: boolean | null | undefined): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

export default function TestForm({
  test,
  buildings,
  onClose,
  onSaved,
}: {
  test?: TestRecord;
  buildings: Building[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const currentTest = test as any;

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: test
      ? {
          test_number: currentTest.test_number ?? '',
          test_type: currentTest.test_type ?? 'generator_operational_test',
          building_id: currentTest.building_id ?? '',
          equipment_id: currentTest.equipment_id ?? '',
          test_date: currentTest.test_date ?? '',
          start_time: currentTest.start_time?.slice?.(0, 5) ?? '',
          end_time: currentTest.end_time?.slice?.(0, 5) ?? '',
          interruption_duration_minutes: currentTest.interruption_duration_minutes?.toString?.() ?? '',
          responsible_person: currentTest.responsible_person ?? '',
          equipment_started_successfully: boolToFormValue(currentTest.equipment_started_successfully),
          ats_worked: boolToFormValue(currentTest.ats_worked),
          load_transferred: boolToFormValue(currentTest.load_transferred),
          power_restored_normally: boolToFormValue(currentTest.power_restored_normally),
          readings_json: currentTest.readings ? JSON.stringify(currentTest.readings, null, 2) : '',
          result: currentTest.result ?? 'not_completed',
          notes: currentTest.notes ?? '',
          recommendations: currentTest.recommendations ?? '',
          next_test_date: currentTest.next_test_date ?? '',
        }
      : {
          test_number: '',
          test_type: 'generator_operational_test',
          building_id: '',
          equipment_id: '',
          test_date: new Date().toISOString().slice(0, 10),
          start_time: '',
          end_time: '',
          interruption_duration_minutes: '',
          responsible_person: '',
          equipment_started_successfully: '',
          ats_worked: '',
          load_transferred: '',
          power_restored_normally: '',
          readings_json: '',
          result: 'not_completed',
          notes: '',
          recommendations: '',
          next_test_date: '',
        },
  });

  // إذا تغيّر السجل المختار أثناء بقاء النافذة مفتوحة، أعد تعبئة النموذج بالقيم الصحيحة.
  useEffect(() => {
    if (!test) return;
    reset({
      test_number: currentTest.test_number ?? '',
      test_type: currentTest.test_type ?? 'generator_operational_test',
      building_id: currentTest.building_id ?? '',
      equipment_id: currentTest.equipment_id ?? '',
      test_date: currentTest.test_date ?? '',
      start_time: currentTest.start_time?.slice?.(0, 5) ?? '',
      end_time: currentTest.end_time?.slice?.(0, 5) ?? '',
      interruption_duration_minutes: currentTest.interruption_duration_minutes?.toString?.() ?? '',
      responsible_person: currentTest.responsible_person ?? '',
      equipment_started_successfully: boolToFormValue(currentTest.equipment_started_successfully),
      ats_worked: boolToFormValue(currentTest.ats_worked),
      load_transferred: boolToFormValue(currentTest.load_transferred),
      power_restored_normally: boolToFormValue(currentTest.power_restored_normally),
      readings_json: currentTest.readings ? JSON.stringify(currentTest.readings, null, 2) : '',
      result: currentTest.result ?? 'not_completed',
      notes: currentTest.notes ?? '',
      recommendations: currentTest.recommendations ?? '',
      next_test_date: currentTest.next_test_date ?? '',
    });
  }, [test]);

  const selectedBuilding = watch('building_id');

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
}, [selectedBuilding]);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
            const { data: department, error: departmentError } = await supabase
        .from('departments')
        .select('id')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (departmentError || !department) {
        throw new Error('تعذر تحديد القسم');
      }
      let readings: Record<string, unknown> | null = null;
      if (values.readings_json.trim()) {
        try {
          readings = JSON.parse(values.readings_json);
        } catch {
          toast.error('صيغة القراءات غير صحيحة. استخدم صيغة JSON صحيحة.');
          setLoading(false);
          return;
        }
      }

      let pdf_report_url: string | null = null;
      if (pdfFile) {
        pdf_report_url = await uploadFile('documents', pdfFile);
      }

      const toNullableBool = (value: string) => value === 'true' ? true : value === 'false' ? false : null;

      const payload: any = {
        department_id: department.id,
        test_number: values.test_number.trim(),
        test_type: values.test_type,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        test_date: values.test_date,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        interruption_duration_minutes: values.interruption_duration_minutes === '' ? null : Number(values.interruption_duration_minutes),
        responsible_person: values.responsible_person.trim() || null,
        equipment_started_successfully: toNullableBool(values.equipment_started_successfully),
        ats_worked: toNullableBool(values.ats_worked),
        load_transferred: toNullableBool(values.load_transferred),
        power_restored_normally: toNullableBool(values.power_restored_normally),
        readings,
        result: values.result,
        notes: values.notes.trim() || null,
        recommendations: values.recommendations.trim() || null,
        next_test_date: values.next_test_date || null,
      };
      if (pdf_report_url) payload.pdf_report_url = pdf_report_url;

      if (test) {
        const { error } = await supabase.from('tests').update(payload).eq('id', test.id);
        if (error) throw error;
        toast.success('تم تحديث الاختبار');
      } else {
        const { error } = await supabase.from('tests').insert(payload);
        if (error) throw error;
        toast.success('تم تسجيل الاختبار بنجاح');
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
          <h2 className="text-lg font-bold text-gray-900">{test ? 'تعديل الاختبار' : 'تسجيل اختبار جديد'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">رقم الاختبار *</label>
            <input {...register('test_number', { required: 'مطلوب' })} className="input-field" dir="ltr" />
            {errors.test_number && <p className="mt-1 text-xs text-red-600">{errors.test_number.message}</p>}
          </div>

          <div>
            <label className="label-field">نوع الاختبار *</label>
            <select {...register('test_type', { required: true })} className="input-field">
              {Object.entries(TEST_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">المبنى *</label>
            <select {...register('building_id', { required: true })} className="input-field">
              <option value="">اختر المبنى</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">المعدة</label>
            <select {...register('equipment_id')} className="input-field">
              <option value="">بدون تحديد معدة</option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.asset_id})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">تاريخ الاختبار *</label>
            <input {...register('test_date', { required: true })} type="date" className="input-field" />
          </div>

          <div>
            <label className="label-field">الشخص المسؤول</label>
            <input {...register('responsible_person')} className="input-field" />
          </div>

          <div>
            <label className="label-field">وقت البداية</label>
            <input {...register('start_time')} type="time" className="input-field" />
          </div>

          <div>
            <label className="label-field">وقت النهاية</label>
            <input {...register('end_time')} type="time" className="input-field" />
          </div>

          <div>
            <label className="label-field">مدة الانقطاع (دقيقة)</label>
            <input {...register('interruption_duration_minutes', { min: { value: 0, message: 'يجب أن تكون القيمة صفر أو أكبر' } })} type="number" min="0" step="0.1" className="input-field" />
            {errors.interruption_duration_minutes && <p className="mt-1 text-xs text-red-600">{errors.interruption_duration_minutes.message}</p>}
          </div>

          <div>
            <label className="label-field">نتيجة الاختبار</label>
            <select {...register('result')} className="input-field">
              <option value="passed">ناجح</option>
              <option value="passed_with_observation">ناجح مع ملاحظات</option>
              <option value="failed">فاشل</option>
              <option value="not_completed">غير مكتمل</option>
            </select>
          </div>

          <BoolSelect label="هل اشتغلت المعدة بنجاح؟" name="equipment_started_successfully" register={register} />
          <BoolSelect label="هل عمل ATS؟" name="ats_worked" register={register} />
          <BoolSelect label="هل تم نقل الحمل؟" name="load_transferred" register={register} />
          <BoolSelect label="هل عادت الكهرباء طبيعيًا؟" name="power_restored_normally" register={register} />

          <div>
            <label className="label-field">تاريخ الاختبار القادم</label>
            <input {...register('next_test_date')} type="date" className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">القراءات</label>
            <textarea
              {...register('readings_json')}
              rows={4}
              className="input-field font-mono text-xs"
              dir="ltr"
              placeholder={'مثال: {"voltage": 400, "frequency": 50}'}
            />
            <p className="mt-1 text-xs text-gray-400">يمكن تعديل القراءات المسجلة بصيغة JSON. اتركها فارغة إذا لا توجد قراءات.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الملاحظات</label>
            <textarea {...register('notes')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">التوصيات</label>
            <textarea {...register('recommendations')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">تقرير PDF</label>
            {test && currentTest.pdf_report_url && (
              <p className="mb-2 text-xs text-gray-500">يوجد تقرير حالي. اختيار ملف جديد سيستبدل رابط التقرير الحالي في سجل الاختبار.</p>
            )}
            <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} className="input-field" />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {test ? 'حفظ التعديلات' : 'تسجيل الاختبار'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BoolSelect({ label, name, register }: { label: string; name: keyof FormValues; register: any }) {
  return (
    <div>
      <label className="label-field">{label}</label>
      <select {...register(name)} className="input-field">
        <option value="">—</option>
        <option value="true">نعم</option>
        <option value="false">لا</option>
      </select>
    </div>
  );
}
