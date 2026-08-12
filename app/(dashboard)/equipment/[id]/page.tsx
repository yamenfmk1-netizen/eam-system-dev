'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EquipmentForm from '@/components/equipment/EquipmentForm';
import { ArrowRight, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, TEST_TYPE_LABELS, TEST_RESULT_LABELS,
  MAINTENANCE_CATEGORY_LABELS, FAULT_STATUS_LABELS, FAULT_PRIORITY_LABELS, ATTACHMENT_CATEGORY_LABELS,
} from '@/types/database.types';
import type { Building, Equipment } from '@/types/database.types';
import toast from 'react-hot-toast';
import PrivateFileLink from '@/components/ui/PrivateFileLink';
import { FileText, Eye, Download } from 'lucide-react';

export default function EquipmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [stationName, setStationName] = useState('');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [typeDetails, setTypeDetails] = useState<Record<string, any> | null>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [faults, setFaults] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: eq }, { data: b }, { data: t }, { data: m }, { data: f }, { data: att }] = await Promise.all([
      supabase.from('equipment').select('*, buildings(name, station)').eq('id', id).single(),
      supabase.from('buildings').select('*').is('deleted_at', null).order('building_number'),
      supabase.from('tests').select('*').eq('equipment_id', id).order('test_date', { ascending: false }),
      supabase.from('maintenance_records').select('*').eq('equipment_id', id).order('maintenance_date', { ascending: false }),
      supabase.from('faults').select('*').eq('equipment_id', id).order('reported_at', { ascending: false }),
      supabase.from('attachments').select('*').eq('equipment_id', id).order('created_at', { ascending: false }),
    ]);

    if (eq) {
      setEquipment(eq);
      setBuildingName((eq as any).buildings?.name ?? '');
      setStationName((eq as any).buildings?.station ?? '');

      const detailTables: Record<string, string> = {
        generator: 'generators',
        ats: 'ats_units',
        ups: 'ups_units',
        transformer: 'transformers',
      };
      const detailTable = detailTables[String(eq.type)] ?? 'equipment_specs';
      const { data: details } = await supabase.from(detailTable).select('*').eq('equipment_id', id).maybeSingle();
      setTypeDetails(details);
    }
    setBuildings(b ?? []);
    setTests(t ?? []);
    setMaintenance(m ?? []);
    setFaults(f ?? []);
    setAttachments(att ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    // Soft Delete بدل الحذف النهائي
    const { error } = await supabase
      .from('equipment')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    setDeleting(false);
    if (error) {
      toast.error('تعذر حذف المعدة');
      return;
    }
    toast.success('تم حذف المعدة');
    router.push('/equipment');
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!equipment) {
    return <div className="card py-16 text-center text-sm text-gray-400">المعدة غير موجودة</div>;
  }

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/equipment')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowRight className="h-4 w-4" /> رجوع إلى المعدات
      </button>

      <div className="card flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{equipment.name}</h1>
            <StatusBadge
              label={EQUIPMENT_STATUS_LABELS[equipment.status]}
              tone={equipment.status === 'fault' ? 'fault' : equipment.status === 'under_maintenance' ? 'watch' : 'ready'}
            />
          </div>
          <p className="text-sm text-gray-500">
            {equipment.asset_id} · {EQUIPMENT_TYPE_LABELS[equipment.type]} · {stationName || 'غير محدد'} · {buildingName}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary"><Pencil className="h-4 w-4" /> تعديل</button>
          <button onClick={() => setShowDelete(true)} className="btn-danger"><Trash2 className="h-4 w-4" /> حذف</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-bold text-gray-900">البيانات العامة</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="الشركة المصنعة" value={equipment.manufacturer} />
            <Row label="الموديل" value={equipment.model} />
            <Row label="الرقم التسلسلي" value={equipment.serial_number} />
            <Row label="سنة التصنيع" value={equipment.manufacturing_year?.toString()} />
            <Row label="تاريخ التركيب" value={equipment.installation_date} />
            <Row label="المحطة / الموقع" value={stationName} />
            <Row label="المبنى" value={buildingName} />
            <Row label="الموقع داخل المبنى" value={equipment.location_in_building} />
            <Row label="ملاحظات" value={equipment.notes} />
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 font-bold text-gray-900">البيانات الفنية</h2>
          {typeDetails ? (
            <dl className="space-y-2.5 text-sm">
              {technicalRows(equipment.type, typeDetails).map(([key, label, value]) => (
                <Row key={key} label={label} value={value} />
              ))}
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              لا توجد بيانات فنية تفصيلية لهذا النوع من المعدات بعد
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-bold text-gray-900">الاختبارات ({tests.length})</h2>
          {tests.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد اختبارات مسجلة</p>
          ) : (
            <div className="space-y-2">
              {tests.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-gray-800" dir="ltr">{t.test_number}</p>
                    <p className="text-xs text-gray-400">{TEST_TYPE_LABELS[t.test_type as keyof typeof TEST_TYPE_LABELS]} · {new Date(t.test_date).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <StatusBadge
                    label={TEST_RESULT_LABELS[t.result as keyof typeof TEST_RESULT_LABELS]}
                    tone={t.result === 'passed' ? 'ready' : t.result === 'passed_with_observation' ? 'watch' : t.result === 'failed' ? 'fault' : 'unknown'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold text-gray-900">الصيانة ({maintenance.length})</h2>
          {maintenance.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد سجلات صيانة</p>
          ) : (
            <div className="space-y-2">
              {maintenance.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-gray-800" dir="ltr">{m.maintenance_number}</p>
                    <p className="text-xs text-gray-400">{m.technician_name ?? '—'} · {new Date(m.maintenance_date).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <StatusBadge
                    label={MAINTENANCE_CATEGORY_LABELS[m.category as keyof typeof MAINTENANCE_CATEGORY_LABELS]}
                    tone={m.category === 'preventive' ? 'ready' : 'watch'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold text-gray-900">الأعطال ({faults.length})</h2>
          {faults.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد أعطال مسجلة</p>
          ) : (
            <div className="space-y-2">
              {faults.map((f) => (
                <div key={f.id} className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-gray-800" dir="ltr">{f.fault_number}</p>
                    <p className="max-w-[220px] truncate text-xs text-gray-400">{f.description}</p>
                  </div>
                  <StatusBadge
                    label={FAULT_STATUS_LABELS[f.status as keyof typeof FAULT_STATUS_LABELS]}
                    tone={['resolved', 'closed'].includes(f.status) ? 'ready' : f.status === 'open' ? 'fault' : 'watch'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold text-gray-900">الملفات ({attachments.length})</h2>
          {attachments.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد ملفات مرفوعة</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-gray-800">{a.file_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <PrivateFileLink bucket="documents" path={a.file_url} mode="view" className="rounded-lg p-1 text-gray-400 hover:text-primary-600"><Eye className="h-4 w-4" /></PrivateFileLink>
                    <PrivateFileLink bucket="documents" path={a.file_url} mode="download" className="rounded-lg p-1 text-gray-400 hover:text-primary-600"><Download className="h-4 w-4" /></PrivateFileLink>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EquipmentForm equipment={equipment} buildings={buildings} typeDetails={typeDetails} onClose={() => setShowEdit(false)} onSaved={load} />
      )}

      <ConfirmDialog
        open={showDelete}
        title="حذف المعدة"
        message={`هل أنت متأكد من حذف "${equipment.name}"؟ سيتم حذف جميع السجلات المرتبطة بها.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleting}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value || '—'}</dd>
    </div>
  );
}


function technicalRows(type: string, details: Record<string, any>): Array<[string, string, string]> {
  const definitions: Record<string, Record<string, [string, string?]>> = {
    generator: {
      generator_number: ['رقم المولد'],
      rated_power_kva: ['القدرة المقننة', 'kVA'],
      rated_power_kw: ['القدرة الفعلية', 'kW'],
      voltage: ['الجهد', 'V'],
      frequency: ['التردد', 'Hz'],
      number_of_phases: ['عدد الفازات'],
      power_factor: ['معامل القدرة PF'],
      running_hours: ['ساعات التشغيل', 'ساعة'],
    },
    transformer: {
      transformer_number: ['رقم المحول'],
      capacity_kva: ['القدرة', 'kVA'],
      primary_voltage: ['جهد الابتدائي', 'V'],
      secondary_voltage: ['جهد الثانوي', 'V'],
      transformer_type: ['نوع المحول'],
      cooling_type: ['نوع التبريد'],
      vector_group: ['Vector Group'],
      impedance: ['الممانعة', '%'],
      current_load_percentage: ['الحمل الحالي', '%'],
    },
    ups: {
      ups_number: ['رقم UPS'],
      capacity_kva: ['القدرة', 'kVA'],
      capacity_kw: ['القدرة', 'kW'],
      input_voltage: ['جهد الدخول', 'V'],
      output_voltage: ['جهد الخروج', 'V'],
      number_of_phases: ['عدد الفازات'],
      current_load_percentage: ['الحمل الحالي', '%'],
      current_load_kva: ['الحمل الحالي', 'kVA'],
      operating_mode: ['وضع التشغيل'],
      battery_quantity: ['عدد البطاريات'],
      battery_voltage: ['جهد البطارية', 'V'],
      battery_capacity_ah: ['سعة البطارية', 'Ah'],
    },
    ats: {
      ats_number: ['رقم ATS'],
      rated_current: ['التيار المقنن', 'A'],
      rated_voltage: ['الجهد المقنن', 'V'],
      number_of_poles: ['عدد الأقطاب'],
      transfer_delay: ['زمن التحويل', 'ث'],
      return_delay: ['زمن الرجوع', 'ث'],
      cool_down_time: ['زمن التبريد', 'ث'],
    },
  };

  const genericByType: Record<string, Record<string, [string, string?]>> = {
    switchgear: {
      rated_voltage: ['الجهد المقنن', 'kV'], rated_current: ['التيار المقنن', 'A'], breaking_capacity_ka: ['قدرة القطع', 'kA'], number_of_phases: ['عدد الفازات'],
    },
    rmu: {
      rated_voltage: ['الجهد المقنن', 'kV'], rated_current: ['التيار المقنن', 'A'], breaking_capacity_ka: ['قدرة القطع', 'kA'], number_of_phases: ['عدد الفازات'], ways_count: ['عدد الخلايا / Ways'],
    },
    main_distribution_board: {
      rated_voltage: ['الجهد المقنن', 'V'], rated_current: ['تيار اللوحة', 'A'], rated_power_kva: ['القدرة', 'kVA'], number_of_phases: ['عدد الفازات'], ways_count: ['عدد الدوائر / Ways'],
    },
    sub_main_distribution_board: {
      rated_voltage: ['الجهد المقنن', 'V'], rated_current: ['تيار اللوحة', 'A'], rated_power_kva: ['القدرة', 'kVA'], number_of_phases: ['عدد الفازات'], ways_count: ['عدد الدوائر / Ways'],
    },
    synchronizing_panel: {
      rated_voltage: ['الجهد المقنن', 'V'], rated_current: ['التيار المقنن', 'A'], frequency: ['التردد', 'Hz'], number_of_phases: ['عدد الفازات'], generator_count: ['عدد المولدات المرتبطة'],
    },
    battery_bank: {
      battery_voltage: ['جهد البطارية / البنك', 'V'], battery_capacity_ah: ['السعة', 'Ah'], battery_quantity: ['عدد البطاريات'],
    },
    pdu: {
      rated_voltage: ['الجهد المقنن', 'V'], rated_current: ['التيار المقنن', 'A'], rated_power_kva: ['القدرة', 'kVA'], number_of_phases: ['عدد الفازات'],
    },
    pdm: {
      rated_voltage: ['الجهد المقنن', 'V'], rated_current: ['التيار المقنن', 'A'], rated_power_kva: ['القدرة', 'kVA'], number_of_phases: ['عدد الفازات'],
    },
    other: {
      rated_power_kva: ['القدرة', 'kVA'], rated_power_kw: ['القدرة', 'kW'], rated_voltage: ['الجهد', 'V'], rated_current: ['التيار', 'A'], frequency: ['التردد', 'Hz'], number_of_phases: ['عدد الفازات'],
    },
  };

  const defs = definitions[type] ?? genericByType[type] ?? genericByType.other;
  return Object.entries(defs)
    .filter(([key]) => details[key] !== null && details[key] !== undefined && details[key] !== '')
    .map(([key, [label, unit]]) => {
      let value: any = details[key];
      if ((type === 'switchgear' || type === 'rmu') && key === 'rated_voltage') value = Number(value) / 1000;
      return [key, label, `${value}${unit ? ` ${unit}` : ''}`];
    });
}
