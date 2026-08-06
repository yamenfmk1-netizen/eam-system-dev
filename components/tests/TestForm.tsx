'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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
  responsible_person: string;
  equipment_started_successfully: string;
  ats_worked: string;
  load_transferred: string;
  power_restored_normally: string;
  result: string;
  notes: string;
  recommendations: string;
  next_test_date: string;
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

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: test
      ? {
          test_number: test.test_number,
          test_type: test.test_type,
          building_id: test.building_id,
          equipment_id: test.equipment_id ?? '',
          test_date: test.test_date,
          responsible_person: test.responsible_person ?? '',
          result: test.result,
          notes: test.notes ?? '',
          next_test_date: test.next_test_date ?? '',
        }
      : { result: 'not_completed', test_date: new Date().toISOString().slice(0, 10) },
  });

  const selectedBuilding = watch('building_id');

  useEffect(() => {
    if (!selectedBuilding) {
      setEquipment([]);
      return;
    }
    supabase
      .from('equipment')
      .select('*')
      .eq('building_id', selectedBuilding)
      .is('deleted_at', null)
      .then(({ data }) => setEquipment(data ?? []));
  }, [selectedBuilding]);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      let pdf_report_url: string | null = null;
      if (pdfFile) {
        pdf_report_url = await uploadFile('documents', pdfFile);
      }

      const payload: any = {
        test_number: values.test_number,
        test_type: values.test_type,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        test_date: values.test_date,
        responsible_person: values.responsible_person,
        equipment_started_successfully: values.equipment_started_successfully === 'true' ? true : values.equipment_started_successfully === 'false' ? false : null,
        ats_worked: values.ats_worked === 'true' ? true : values.ats_worked === 'false' ? false : null,
        load_transferred: values.load_transferred === 'true' ? true : values.load_transferred === 'false' ? false : null,
        power_restored_normally: values.power_restored_normally === 'true' ? true : values.power_restored_normally === 'false' ? false : null,
        result: values.result,
        notes: values.notes,
        recommendations: values.recommendations,
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
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

          <BoolSelect label="هل اشتغلت المعدة بنجاح؟" name="equipment_started_successfully" register={register} />
          <BoolSelect label="هل عمل ATS؟" name="ats_worked" register={register} />
          <BoolSelect label="هل تم نقل الحمل؟" name="load_transferred" register={register} />
          <BoolSelect label="هل عادت الكهرباء طبيعيًا؟" name="power_restored_normally" register={register} />

          <div>
            <label className="label-field">نتيجة الاختبار</label>
            <select {...register('result')} className="input-field">
              <option value="passed">ناجح</option>
              <option value="passed_with_observation">ناجح مع ملاحظات</option>
              <option value="failed">فاشل</option>
              <option value="not_completed">غير مكتمل</option>
            </select>
          </div>

          <div>
            <label className="label-field">تاريخ الاختبار القادم</label>
            <input {...register('next_test_date')} type="date" className="input-field" />
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
