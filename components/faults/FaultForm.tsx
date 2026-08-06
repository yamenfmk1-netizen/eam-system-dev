'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { Building, Equipment, Fault, ProfileDirectoryEntry } from '@/types/database.types';
import { uploadFile } from '@/lib/storage/client';

interface FormValues {
  fault_number: string;
  building_id: string;
  equipment_id: string;
  reported_by: string;
  description: string;
  priority: string;
  impact: string;
  status: string;
  responsible_engineer: string;
  responsible_technician: string;
  root_cause: string;
  temporary_action: string;
  final_resolution: string;
  spare_parts_used: string;
}

export default function FaultForm({
  fault,
  buildings,
  currentUserRole,
  onClose,
  onSaved,
}: {
  fault?: Fault;
  buildings: Building[];
  currentUserRole?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const canAssign = currentUserRole === 'admin' || currentUserRole === 'engineer';
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photos, setPhotos] = useState<FileList | null>(null);
  const [engineers, setEngineers] = useState<ProfileDirectoryEntry[]>([]);
  const [technicians, setTechnicians] = useState<ProfileDirectoryEntry[]>([]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: fault
      ? {
          fault_number: fault.fault_number,
          building_id: fault.building_id,
          equipment_id: fault.equipment_id ?? '',
          reported_by: fault.reported_by ?? '',
          description: fault.description,
          priority: fault.priority,
          impact: fault.impact ?? '',
          status: fault.status,
          responsible_engineer: fault.responsible_engineer ?? '',
          responsible_technician: fault.responsible_technician ?? '',
          root_cause: fault.root_cause ?? '',
          temporary_action: fault.temporary_action ?? '',
          final_resolution: fault.final_resolution ?? '',
        }
      : { priority: 'medium', status: 'open' },
  });

  const selectedBuilding = watch('building_id');
  const selectedStatus = watch('status');

  useEffect(() => {
    if (!selectedBuilding) { setEquipment([]); return; }
    supabase.from('equipment').select('*').eq('building_id', selectedBuilding).is('deleted_at', null).then(({ data }) => setEquipment(data ?? []));
  }, [selectedBuilding]);

  // دليل المستخدمين المحدود (اسم + دور فقط، بدون بريد/جوال) لإسناد العطل
  // لمهندس أو فني — القراءة عبر profiles_directory وليس جدول profiles مباشرة،
  // لأن الأخير أصبح مقيّدًا بعد المراجعة الأمنية (كل مستخدم يرى صفّه فقط).
  useEffect(() => {
    supabase.from('profiles_directory').select('*').eq('role', 'engineer').then(({ data }) => setEngineers(data ?? []));
    supabase.from('profiles_directory').select('*').eq('role', 'technician').then(({ data }) => setTechnicians(data ?? []));
  }, []);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const payload: any = {
        fault_number: values.fault_number,
        building_id: values.building_id,
        equipment_id: values.equipment_id || null,
        reported_by: values.reported_by,
        description: values.description,
        priority: values.priority,
        impact: values.impact,
        status: values.status,
        // إسناد المهندس/الفني يبقى بدون تغيير إن لم يكن المستخدم الحالي admin/engineer
        // (بدل الاعتماد على "disabled" وحده في الواجهة، الذي قد يُسقط القيمة من values
        // ويؤدي لمسح الإسناد الحالي عن طريق الخطأ عند حفظ الفني لتعديلات أخرى بالعطل)
        responsible_engineer: canAssign ? (values.responsible_engineer || null) : (fault?.responsible_engineer ?? null),
        responsible_technician: canAssign ? (values.responsible_technician || null) : (fault?.responsible_technician ?? null),
        root_cause: values.root_cause,
        temporary_action: values.temporary_action,
        final_resolution: values.final_resolution,
        spare_parts_used: values.spare_parts_used,
      };

      if (values.status === 'closed' || values.status === 'resolved') {
        payload.closed_at = new Date().toISOString();
      }

      let savedId = fault?.id;

      if (fault) {
        const { error } = await supabase.from('faults').update(payload).eq('id', fault.id);
        if (error) throw error;
        toast.success('تم تحديث العطل');
      } else {
        const { data, error } = await supabase.from('faults').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
        toast.success('تم تسجيل العطل بنجاح');
      }

      if (photos && photos.length > 0) {
        const rows = [];
        for (const file of Array.from(photos)) {
          try {
            const path = await uploadFile('documents', file);
            rows.push({ file_name: file.name, file_url: path, category: 'other', fault_id: savedId });
          } catch {
            toast.error(`تعذر رفع الملف: ${file.name}`);
          }
        }
        if (rows.length) await supabase.from('attachments').insert(rows);
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
          <h2 className="text-lg font-bold text-gray-900">{fault ? 'تعديل بلاغ العطل' : 'بلاغ عطل جديد'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">رقم العطل *</label>
            <input {...register('fault_number', { required: 'مطلوب' })} className="input-field" dir="ltr" />
            {errors.fault_number && <p className="mt-1 text-xs text-red-600">{errors.fault_number.message}</p>}
          </div>

          <div>
            <label className="label-field">مقدم البلاغ</label>
            <input {...register('reported_by')} className="input-field" />
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
            <label className="label-field">مستوى الأولوية</label>
            <select {...register('priority')} className="input-field">
              <option value="low">منخفضة</option>
              <option value="medium">متوسطة</option>
              <option value="high">عالية</option>
              <option value="critical">حرجة</option>
            </select>
          </div>

          <div>
            <label className="label-field">حالة العطل</label>
            <select {...register('status')} className="input-field">
              <option value="open">مفتوح</option>
              <option value="assigned">تم الإسناد</option>
              <option value="in_progress">قيد المعالجة</option>
              <option value="waiting_for_spare_parts">بانتظار قطع الغيار</option>
              <option value="resolved">تم الحل</option>
              <option value="closed">مغلق</option>
            </select>
          </div>

          <div>
            <label className="label-field">المهندس المسؤول</label>
            <select {...register('responsible_engineer')} disabled={!canAssign} className="input-field disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">بدون إسناد</option>
              {engineers.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            {!canAssign && <p className="mt-1 text-xs text-gray-400">إسناد الأعطال متاح فقط للمهندس أو مدير النظام</p>}
          </div>

          <div>
            <label className="label-field">الفني المسؤول</label>
            <select {...register('responsible_technician')} disabled={!canAssign} className="input-field disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">بدون إسناد</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-400">الفني يستطيع تعديل الأعطال المسندة إليه هنا فقط</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">وصف العطل *</label>
            <textarea {...register('description', { required: 'مطلوب' })} rows={2} className="input-field" />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">تأثير العطل</label>
            <textarea {...register('impact')} rows={2} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">السبب الجذري</label>
            <input {...register('root_cause')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الإجراء المؤقت</label>
            <input {...register('temporary_action')} className="input-field" />
          </div>

          {(selectedStatus === 'resolved' || selectedStatus === 'closed') && (
            <div className="sm:col-span-2">
              <label className="label-field">الحل النهائي</label>
              <textarea {...register('final_resolution')} rows={2} className="input-field" />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-field">قطع الغيار المستخدمة</label>
            <input {...register('spare_parts_used')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="label-field">الصور</label>
            <input type="file" multiple accept="image/jpeg,image/png,image/jpg" onChange={(e) => setPhotos(e.target.files)} className="input-field" />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {fault ? 'حفظ التعديلات' : 'تسجيل العطل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
