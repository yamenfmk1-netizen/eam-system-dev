'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import toast from 'react-hot-toast';
import { EQUIPMENT_TYPE_LABELS } from '@/types/database.types';
import type { Building, Equipment, EquipmentType } from '@/types/database.types';
import { equipmentSchema, type EquipmentInput } from '@/lib/validation/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { validateFile, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, FileValidationError } from '@/lib/storage/upload';
import { uploadFile } from '@/lib/storage/client';
type EquipmentTypeOption = {
  id: string;
  code: string;
  name: string;
};

type TechState = Record<string, string>;

const SPECIAL_DETAIL_TABLES: Partial<Record<EquipmentType, string>> = {
  generator: 'generators',
  ats: 'ats_units',
  ups: 'ups_units',
  transformer: 'transformers',
};

function numberOrNull(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value: string | undefined): number | null {
  const n = numberOrNull(value);
  return n == null ? null : Math.trunc(n);
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function buildTechState(type: EquipmentType, details?: Record<string, any> | null): TechState {
  if (!details) return {};
  const d = details;
  const state: TechState = {};
  Object.entries(d).forEach(([key, value]) => {
    if (key !== 'equipment_id' && key !== 'created_at' && key !== 'updated_at') state[key] = stringValue(value);
  });
  // مواصفات الجهد المتوسط تُعرض للمستخدم بالكيلو فولت لكن تُخزن بالفولت.
  if ((type === 'switchgear' || type === 'rmu') && d.rated_voltage != null) {
    state.rated_voltage_kv = stringValue(Number(d.rated_voltage) / 1000);
  }
  return state;
}

export default function EquipmentForm({
  equipment,
  buildings,
  defaultBuildingId,
  typeDetails,
  onClose,
  onSaved,
}: {
  equipment?: Equipment;
  buildings: Building[];
  defaultBuildingId?: string;
  typeDetails?: Record<string, any> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentTypeOption[]>([]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<EquipmentInput>({
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
      : {
          type: 'generator',
          status: 'available',
          criticality: 'medium',
          building_id: defaultBuildingId ?? '',
        },
  });
  useEffect(() => {
  async function loadEquipmentTypes() {
    const { data: department } = await supabase
      .from('departments')
      .select('id')
      .eq('code', DEPARTMENT_CODE)
      .single();

    if (!department) {
      setEquipmentTypes([]);
      return;
    }

    const { data: types } = await supabase
      .from('equipment_types')
      .select('id, code, name')
      .eq('department_id', department.id)
      .eq('is_active', true)
      .order('name');

    const availableTypes = (types ?? []) as EquipmentTypeOption[];
    setEquipmentTypes(availableTypes);

    if (!equipment && availableTypes.length > 0) {
      const currentType = watch('type');

      const currentTypeExists = availableTypes.some(
        (item) => item.code === currentType
      );

      if (!currentTypeExists) {
        setValue('type', availableTypes[0].code, {
          shouldValidate: true,
        });
      }
    }
  }

  loadEquipmentTypes();
}, [equipment]);

  const selectedType = (watch('type') || equipment?.type || 'generator') as EquipmentType;
  const initialBuildingId = equipment?.building_id ?? defaultBuildingId ?? '';
  const initialStation = buildings.find((b) => b.id === initialBuildingId)?.station ?? '';
  const [selectedStation, setSelectedStation] = useState(initialStation);
  const stationOptions = Array.from(new Set(buildings.map((b) => b.station).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ar')
  );
  const filteredBuildings = selectedStation
    ? buildings.filter((b) => b.station === selectedStation)
    : [];
  const [tech, setTech] = useState<TechState>(() => buildTechState(equipment?.type ?? 'generator', typeDetails));
  const previousType = useRef<EquipmentType>(selectedType);

  useEffect(() => {
    if (!equipment && previousType.current !== selectedType) {
      setTech({});
      previousType.current = selectedType;
    }
  }, [selectedType, equipment]);

  function setTechValue(key: string, value: string) {
    setTech((prev) => ({ ...prev, [key]: value }));
  }

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

  async function upsertTechnicalDetails(equipmentId: string, type: EquipmentType) {
    let table = SPECIAL_DETAIL_TABLES[type] ?? 'equipment_specs';
    let payload: Record<string, any> = { equipment_id: equipmentId };

    if (type === 'generator') {
      payload = {
        ...payload,
        generator_number: tech.generator_number || null,
        rated_power_kva: numberOrNull(tech.rated_power_kva),
        rated_power_kw: numberOrNull(tech.rated_power_kw),
        voltage: numberOrNull(tech.voltage),
        frequency: numberOrNull(tech.frequency),
        number_of_phases: intOrNull(tech.number_of_phases),
        power_factor: numberOrNull(tech.power_factor),
        running_hours: numberOrNull(tech.running_hours),
      };
    } else if (type === 'transformer') {
      payload = {
        ...payload,
        transformer_number: tech.transformer_number || null,
        capacity_kva: numberOrNull(tech.capacity_kva),
        primary_voltage: numberOrNull(tech.primary_voltage),
        secondary_voltage: numberOrNull(tech.secondary_voltage),
        transformer_type: tech.transformer_type || null,
        cooling_type: tech.cooling_type || null,
        vector_group: tech.vector_group || null,
        impedance: numberOrNull(tech.impedance),
        current_load_percentage: numberOrNull(tech.current_load_percentage),
      };
    } else if (type === 'ups') {
      payload = {
        ...payload,
        ups_number: tech.ups_number || null,
        capacity_kva: numberOrNull(tech.capacity_kva),
        capacity_kw: numberOrNull(tech.capacity_kw),
        input_voltage: numberOrNull(tech.input_voltage),
        output_voltage: numberOrNull(tech.output_voltage),
        number_of_phases: intOrNull(tech.number_of_phases),
        current_load_percentage: numberOrNull(tech.current_load_percentage),
        current_load_kva: numberOrNull(tech.current_load_kva),
        operating_mode: tech.operating_mode || 'online',
        battery_quantity: intOrNull(tech.battery_quantity),
        battery_voltage: numberOrNull(tech.battery_voltage),
        battery_capacity_ah: numberOrNull(tech.battery_capacity_ah),
      };
    } else if (type === 'ats') {
      payload = {
        ...payload,
        ats_number: tech.ats_number || null,
        rated_current: numberOrNull(tech.rated_current),
        rated_voltage: numberOrNull(tech.rated_voltage),
        number_of_poles: intOrNull(tech.number_of_poles),
        transfer_delay: numberOrNull(tech.transfer_delay),
        return_delay: numberOrNull(tech.return_delay),
        cool_down_time: numberOrNull(tech.cool_down_time),
      };
    } else {
      const isMv = type === 'switchgear' || type === 'rmu';
      const mvKv = numberOrNull(tech.rated_voltage_kv);
      payload = {
        ...payload,
        rated_power_kva: numberOrNull(tech.rated_power_kva),
        rated_power_kw: numberOrNull(tech.rated_power_kw),
        rated_voltage: isMv ? (mvKv == null ? null : mvKv * 1000) : numberOrNull(tech.rated_voltage),
        rated_current: numberOrNull(tech.rated_current),
        frequency: numberOrNull(tech.frequency),
        number_of_phases: intOrNull(tech.number_of_phases),
        number_of_poles: intOrNull(tech.number_of_poles),
        breaking_capacity_ka: numberOrNull(tech.breaking_capacity_ka),
        battery_voltage: numberOrNull(tech.battery_voltage),
        battery_capacity_ah: numberOrNull(tech.battery_capacity_ah),
        battery_quantity: intOrNull(tech.battery_quantity),
        generator_count: intOrNull(tech.generator_count),
        ways_count: intOrNull(tech.ways_count),
      };
    }

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'equipment_id' });
    if (error) throw error;
  }

  async function onSubmit(values: EquipmentInput) {
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
      let image_url = equipment?.image_url ?? null;
      if (imageFile) image_url = await uploadFile('equipment-images', imageFile);

      const payload = {
  ...values,
  department_id: department.id,
  manufacturing_year: values.manufacturing_year ? Number(values.manufacturing_year) : null,
  installation_date: values.installation_date || null,
  image_url,
};

      let equipmentId = equipment?.id;

      if (equipment) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', equipment.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('equipment').insert(payload).select('id').single();
        if (error) throw error;
        equipmentId = data?.id;
      }

      if (!equipmentId) throw new Error('تعذر تحديد رقم المعدة بعد الحفظ');

      // احفظ المواصفات الجديدة أولًا، ثم نظّف جدول النوع السابق إذا تغير النوع.
      await upsertTechnicalDetails(equipmentId, values.type as EquipmentType);

      if (equipment && equipment.type !== values.type) {
        const oldTable = SPECIAL_DETAIL_TABLES[equipment.type] ?? 'equipment_specs';
        const newTable = SPECIAL_DETAIL_TABLES[values.type as EquipmentType] ?? 'equipment_specs';
        if (oldTable !== newTable) {
          const { error: cleanupError } = await supabase.from(oldTable).delete().eq('equipment_id', equipmentId);
          if (cleanupError) throw cleanupError;
        }
      }

      toast.success(equipment ? 'تم تحديث بيانات المعدة والمواصفات الفنية' : 'تمت إضافة المعدة ومواصفاتها بنجاح');
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
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {equipment ? 'تعديل بيانات المعدة' : 'إضافة معدة جديدة'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

  <select
    {...register('type', { required: true })}
    className="input-field"
    disabled={equipmentTypes.length === 0}
  >
    {equipmentTypes.length === 0 ? (
      <option value="">لا توجد أنواع معدات</option>
    ) : (
      equipmentTypes.map((item) => (
        <option key={item.id} value={item.code}>
          {item.name}
        </option>
      ))
    )}
  </select>
</div>

            <div>
              <label className="label-field">المحطة / الموقع *</label>
              <select
                value={selectedStation}
                onChange={(e) => {
                  setSelectedStation(e.target.value);
                  setValue('building_id', '', { shouldValidate: false, shouldDirty: true });
                }}
                className="input-field"
              >
                <option value="">اختر المحطة / الموقع</option>
                {stationOptions.map((station) => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">اختيار المحطة يفلتر قائمة المباني تلقائيًا.</p>
            </div>

            <div>
              <label className="label-field">المبنى *</label>
              <select
                {...register('building_id', { required: true })}
                className="input-field"
                disabled={!selectedStation}
              >
                <option value="">{selectedStation ? 'اختر المبنى' : 'اختر المحطة أولًا'}</option>
                {filteredBuildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} (مبنى {b.building_number})</option>
                ))}
              </select>
              {errors.building_id && <p className="mt-1 text-xs text-red-600">{errors.building_id.message}</p>}
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
          </div>

          <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary-600" />
              <div>
               <h3 className="font-bold text-gray-900">
  المواصفات الفنية — {
    equipmentTypes.find((item) => item.code === selectedType)?.name
    ?? EQUIPMENT_TYPE_LABELS[selectedType]
    ?? selectedType
  }
</h3>
                <p className="text-xs text-gray-500">تتغير الحقول تلقائيًا حسب نوع الأصل.</p>
              </div>
            </div>
            <TechnicalFields type={selectedType} tech={tech} setTechValue={setTechValue} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label-field">صورة المعدة (JPG/PNG، حتى 10MB)</label>
              <input type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleImageChange} className="input-field" />
              {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label-field">ملاحظات</label>
              <textarea {...register('notes')} rows={2} className="input-field" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {equipment ? 'حفظ التعديلات' : 'إضافة المعدة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TechnicalFields({
  type,
  tech,
  setTechValue,
}: {
  type: EquipmentType;
  tech: TechState;
  setTechValue: (key: string, value: string) => void;
}) {
  const field = (key: string, label: string, opts?: { step?: string; min?: number; placeholder?: string; type?: 'number' | 'text' }) => (
    <div key={key}>
      <label className="label-field">{label}</label>
      <input
        type={opts?.type ?? 'number'}
        step={opts?.step ?? 'any'}
        min={opts?.min}
        value={tech[key] ?? ''}
        onChange={(e) => setTechValue(key, e.target.value)}
        placeholder={opts?.placeholder}
        className="input-field"
        dir={opts?.type === 'text' ? undefined : 'ltr'}
      />
    </div>
  );

  if (type === 'generator') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('generator_number', 'رقم المولد', { type: 'text' })}
      {field('rated_power_kva', 'القدرة المقننة (kVA)', { min: 0 })}
      {field('rated_power_kw', 'القدرة الفعلية (kW)', { min: 0 })}
      {field('voltage', 'الجهد (V)', { min: 0 })}
      {field('frequency', 'التردد (Hz)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
      {field('power_factor', 'معامل القدرة PF', { min: 0, step: '0.01' })}
      {field('running_hours', 'ساعات التشغيل', { min: 0 })}
    </div>;
  }

  if (type === 'transformer') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('transformer_number', 'رقم المحول', { type: 'text' })}
      {field('capacity_kva', 'القدرة (kVA)', { min: 0 })}
      {field('primary_voltage', 'جهد الابتدائي (V)', { min: 0 })}
      {field('secondary_voltage', 'جهد الثانوي (V)', { min: 0 })}
      {field('transformer_type', 'نوع المحول', { type: 'text', placeholder: 'Distribution / Power...' })}
      {field('cooling_type', 'نوع التبريد', { type: 'text', placeholder: 'ONAN / AN...' })}
      {field('vector_group', 'Vector Group', { type: 'text', placeholder: 'Dyn11' })}
      {field('impedance', 'الممانعة (%)', { min: 0 })}
      {field('current_load_percentage', 'الحمل الحالي (%)', { min: 0 })}
    </div>;
  }

  if (type === 'ups') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('ups_number', 'رقم UPS', { type: 'text' })}
      {field('capacity_kva', 'القدرة (kVA)', { min: 0 })}
      {field('capacity_kw', 'القدرة (kW)', { min: 0 })}
      {field('input_voltage', 'جهد الدخول (V)', { min: 0 })}
      {field('output_voltage', 'جهد الخروج (V)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
      {field('current_load_percentage', 'الحمل الحالي (%)', { min: 0 })}
      {field('current_load_kva', 'الحمل الحالي (kVA)', { min: 0 })}
      <div>
        <label className="label-field">وضع التشغيل</label>
        <select value={tech.operating_mode ?? 'online'} onChange={(e) => setTechValue('operating_mode', e.target.value)} className="input-field">
          <option value="online">Online</option>
          <option value="battery">Battery</option>
          <option value="bypass">Bypass</option>
          <option value="maintenance_bypass">Maintenance Bypass</option>
          <option value="off">Off</option>
          <option value="fault">Fault</option>
        </select>
      </div>
      {field('battery_quantity', 'عدد البطاريات', { step: '1', min: 0 })}
      {field('battery_voltage', 'جهد البطارية (V)', { min: 0 })}
      {field('battery_capacity_ah', 'سعة البطارية (Ah)', { min: 0 })}
    </div>;
  }

  if (type === 'ats') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('ats_number', 'رقم ATS', { type: 'text' })}
      {field('rated_current', 'التيار المقنن (A)', { min: 0 })}
      {field('rated_voltage', 'الجهد المقنن (V)', { min: 0 })}
      {field('number_of_poles', 'عدد الأقطاب', { step: '1', min: 1 })}
      {field('transfer_delay', 'زمن التحويل (ثانية)', { min: 0 })}
      {field('return_delay', 'زمن الرجوع (ثانية)', { min: 0 })}
      {field('cool_down_time', 'زمن التبريد (ثانية)', { min: 0 })}
    </div>;
  }

  if (type === 'switchgear' || type === 'rmu') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('rated_voltage_kv', 'الجهد المقنن (kV)', { min: 0 })}
      {field('rated_current', 'التيار المقنن (A)', { min: 0 })}
      {field('breaking_capacity_ka', 'قدرة القطع (kA)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
      {type === 'rmu' && field('ways_count', 'عدد الخلايا / Ways', { step: '1', min: 1 })}
    </div>;
  }

  if (type === 'main_distribution_board' || type === 'sub_main_distribution_board') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('rated_voltage', 'الجهد المقنن (V)', { min: 0 })}
      {field('rated_current', 'تيار اللوحة (A)', { min: 0 })}
      {field('rated_power_kva', 'القدرة (kVA)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
      {field('ways_count', 'عدد الدوائر / Ways', { step: '1', min: 1 })}
    </div>;
  }

  if (type === 'synchronizing_panel') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('rated_voltage', 'الجهد المقنن (V)', { min: 0 })}
      {field('rated_current', 'التيار المقنن (A)', { min: 0 })}
      {field('frequency', 'التردد (Hz)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
      {field('generator_count', 'عدد المولدات المرتبطة', { step: '1', min: 1 })}
    </div>;
  }

  if (type === 'battery_bank') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('battery_voltage', 'جهد البطارية / البنك (V)', { min: 0 })}
      {field('battery_capacity_ah', 'السعة (Ah)', { min: 0 })}
      {field('battery_quantity', 'عدد البطاريات', { step: '1', min: 0 })}
    </div>;
  }

  if (type === 'pdu' || type === 'pdm') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('rated_voltage', 'الجهد المقنن (V)', { min: 0 })}
      {field('rated_current', 'التيار المقنن (A)', { min: 0 })}
      {field('rated_power_kva', 'القدرة (kVA)', { min: 0 })}
      {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
    </div>;
  }

  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {field('rated_power_kva', 'القدرة (kVA)', { min: 0 })}
    {field('rated_power_kw', 'القدرة (kW)', { min: 0 })}
    {field('rated_voltage', 'الجهد (V)', { min: 0 })}
    {field('rated_current', 'التيار (A)', { min: 0 })}
    {field('frequency', 'التردد (Hz)', { min: 0 })}
    {field('number_of_phases', 'عدد الفازات', { step: '1', min: 1 })}
  </div>;
}
