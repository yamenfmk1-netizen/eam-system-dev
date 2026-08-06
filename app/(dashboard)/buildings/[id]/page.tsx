'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BuildingForm from '@/components/buildings/BuildingForm';
import {
  ArrowRight, Pencil, Trash2, Phone, Mail, MapPin, User, Loader2,
} from 'lucide-react';
import {
  BUILDING_STATUS_LABELS, EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS,
  TEST_TYPE_LABELS, TEST_RESULT_LABELS, MAINTENANCE_CATEGORY_LABELS,
  FAULT_STATUS_LABELS, FAULT_PRIORITY_LABELS, ATTACHMENT_CATEGORY_LABELS,
} from '@/types/database.types';
import type { Building, Equipment } from '@/types/database.types';
import toast from 'react-hot-toast';
import PrivateFileLink from '@/components/ui/PrivateFileLink';
import Link from 'next/link';
import { FileText, Eye, Download } from 'lucide-react';

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'generator', label: 'المولدات' },
  { key: 'ats', label: 'ATS' },
  { key: 'ups', label: 'UPS' },
  { key: 'transformer', label: 'المحولات' },
  { key: 'switchgear', label: 'سويتش قير / RMU' },
  { key: 'other', label: 'لوحات أخرى' },
  { key: 'tests', label: 'الاختبارات' },
  { key: 'maintenance', label: 'الصيانة' },
  { key: 'faults', label: 'الأعطال' },
  { key: 'files', label: 'المخططات والملفات' },
  { key: 'spare-parts', label: 'قطع الغيار' },
] as const;

export default function BuildingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [building, setBuilding] = useState<Building | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [faults, setFaults] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: b }, { data: eq }, { data: t }, { data: m }, { data: f }, { data: att }] = await Promise.all([
      supabase.from('buildings').select('*').eq('id', id).single(),
      supabase.from('equipment').select('*').eq('building_id', id).is('deleted_at', null).order('created_at'),
      supabase.from('tests').select('*, equipment(name, asset_id)').eq('building_id', id).order('test_date', { ascending: false }),
      supabase.from('maintenance_records').select('*, equipment(name, asset_id)').eq('building_id', id).order('maintenance_date', { ascending: false }),
      supabase.from('faults').select('*, equipment(name, asset_id)').eq('building_id', id).order('reported_at', { ascending: false }),
      supabase.from('attachments').select('*, equipment(name, asset_id)').eq('building_id', id).order('created_at', { ascending: false }),
    ]);
    setBuilding(b);
    setEquipment(eq ?? []);
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
    // Soft Delete: نضع تاريخ الحذف بدل الحذف النهائي، حفاظًا على السجل التاريخي والمرفقات المرتبطة.
    const { error } = await supabase
      .from('buildings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    setDeleting(false);
    if (error) {
      toast.error('تعذر حذف المبنى');
      return;
    }
    toast.success('تم حذف المبنى');
    router.push('/buildings');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!building) {
    return <div className="card py-16 text-center text-sm text-gray-400">المبنى غير موجود</div>;
  }

  const equipmentByType = (type: string) => equipment.filter((e) => e.type === type);

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/buildings')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowRight className="h-4 w-4" /> رجوع إلى المباني
      </button>

      <div className="card flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{building.name}</h1>
            <StatusBadge label={BUILDING_STATUS_LABELS[building.status]} tone={building.status} />
          </div>
          <p className="text-sm text-gray-500">مبنى رقم {building.building_number} · {building.department}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            {building.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{building.location}</span>}
            {building.responsible_person && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{building.responsible_person}</span>}
            {building.contact_phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="h-3.5 w-3.5" />{building.contact_phone}</span>}
            {building.contact_email && <span className="flex items-center gap-1" dir="ltr"><Mail className="h-3.5 w-3.5" />{building.contact_email}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary"><Pencil className="h-4 w-4" /> تعديل</button>
          <button onClick={() => setShowDelete(true)} className="btn-danger"><Trash2 className="h-4 w-4" /> حذف</button>
        </div>
      </div>

      <div className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat label="إجمالي المعدات" value={equipment.length} />
            <SummaryStat label="المولدات" value={equipmentByType('generator').length} />
            <SummaryStat label="ATS" value={equipmentByType('ats').length} />
            <SummaryStat label="UPS" value={equipmentByType('ups').length} />
            <SummaryStat label="المحولات" value={equipmentByType('transformer').length} />
            <SummaryStat label="أعطال مفتوحة" value={faults.filter((f) => !['resolved', 'closed'].includes(f.status)).length} />
            <SummaryStat
              label="آخر اختبار"
              value={tests[0] ? new Date(tests[0].test_date).toLocaleDateString('ar-SA') : '—'}
            />
            <SummaryStat
              label="آخر صيانة"
              value={maintenance[0] ? new Date(maintenance[0].maintenance_date).toLocaleDateString('ar-SA') : '—'}
            />
          </div>
        )}

        {['generator', 'ats', 'ups', 'transformer'].includes(activeTab) && (
          <EquipmentTable items={equipmentByType(activeTab)} />
        )}

        {activeTab === 'switchgear' && (
          <EquipmentTable items={[...equipmentByType('switchgear'), ...equipmentByType('rmu')]} />
        )}

        {activeTab === 'other' && (
          <EquipmentTable
            items={[
              ...equipmentByType('main_distribution_board'),
              ...equipmentByType('sub_main_distribution_board'),
              ...equipmentByType('synchronizing_panel'),
              ...equipmentByType('battery_bank'),
              ...equipmentByType('pdu'),
              ...equipmentByType('pdm'),
              ...equipmentByType('other'),
            ]}
          />
        )}

        {activeTab === 'tests' && (
          tests.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">لا توجد اختبارات مسجلة لهذا المبنى</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">رقم الاختبار</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">المعدة</th>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800" dir="ltr">{t.test_number}</td>
                      <td className="px-3 py-2.5 text-gray-500">{TEST_TYPE_LABELS[t.test_type as keyof typeof TEST_TYPE_LABELS]}</td>
                      <td className="px-3 py-2.5 text-gray-500">{t.equipment?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{new Date(t.test_date).toLocaleDateString('ar-SA')}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={TEST_RESULT_LABELS[t.result as keyof typeof TEST_RESULT_LABELS]}
                          tone={t.result === 'passed' ? 'ready' : t.result === 'passed_with_observation' ? 'watch' : t.result === 'failed' ? 'fault' : 'unknown'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === 'maintenance' && (
          maintenance.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">لا توجد سجلات صيانة لهذا المبنى</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">رقم الصيانة</th>
                    <th className="px-3 py-2">المعدة</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">الفني</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800" dir="ltr">{m.maintenance_number}</td>
                      <td className="px-3 py-2.5 text-gray-500">{m.equipment?.name ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge label={MAINTENANCE_CATEGORY_LABELS[m.category as keyof typeof MAINTENANCE_CATEGORY_LABELS]} tone={m.category === 'preventive' ? 'ready' : 'watch'} />
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{new Date(m.maintenance_date).toLocaleDateString('ar-SA')}</td>
                      <td className="px-3 py-2.5 text-gray-500">{m.technician_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === 'faults' && (
          faults.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">لا توجد أعطال مسجلة لهذا المبنى</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">رقم العطل</th>
                    <th className="px-3 py-2">المعدة</th>
                    <th className="px-3 py-2">الوصف</th>
                    <th className="px-3 py-2">الأولوية</th>
                    <th className="px-3 py-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {faults.map((f) => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800" dir="ltr">{f.fault_number}</td>
                      <td className="px-3 py-2.5 text-gray-500">{f.equipment?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 max-w-[220px] truncate text-gray-600">{f.description}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={FAULT_PRIORITY_LABELS[f.priority as keyof typeof FAULT_PRIORITY_LABELS]}
                          tone={f.priority === 'critical' ? 'fault' : f.priority === 'high' ? 'watch' : 'info'}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={FAULT_STATUS_LABELS[f.status as keyof typeof FAULT_STATUS_LABELS]}
                          tone={['resolved', 'closed'].includes(f.status) ? 'ready' : f.status === 'open' ? 'fault' : 'watch'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === 'files' && (
          attachments.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">لا توجد ملفات مرفوعة لهذا المبنى</div>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.file_name}</p>
                      <p className="text-xs text-gray-400">{ATTACHMENT_CATEGORY_LABELS[a.category as keyof typeof ATTACHMENT_CATEGORY_LABELS]}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <PrivateFileLink bucket="documents" path={a.file_url} mode="view" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600">
                      <Eye className="h-4 w-4" />
                    </PrivateFileLink>
                    <PrivateFileLink bucket="documents" path={a.file_url} mode="download" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600">
                      <Download className="h-4 w-4" />
                    </PrivateFileLink>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'spare-parts' && (
          <div className="py-10 text-center text-sm text-gray-400">
قطع الغيار غير مرتبطة بمبنى محدد بل بنوع المعدة — يمكن الاطلاع عليها من صفحة &quot;قطع الغيار&quot; الرئيسية          </div>
        )}
      </div>

      {showEdit && (
        <BuildingForm building={building} onClose={() => setShowEdit(false)} onSaved={load} />
      )}

      <ConfirmDialog
        open={showDelete}
        title="حذف المبنى"
        message={`هل أنت متأكد من حذف "${building.name}"؟ سيتم إخفاء المبنى وجميع بياناته من النظام (حذف منطقي قابل للاستعادة من قبل مدير النظام عند الحاجة).`}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleting}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function EquipmentTable({ items }: { items: Equipment[] }) {
  if (items.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">لا توجد معدات في هذا التصنيف</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
            <th className="px-3 py-2">رقم الأصل</th>
            <th className="px-3 py-2">الاسم</th>
            <th className="px-3 py-2">الشركة المصنعة</th>
            <th className="px-3 py-2">الموديل</th>
            <th className="px-3 py-2">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <Link href={`/equipment/${e.id}`} className="font-medium text-primary-600 hover:underline">
                  {e.asset_id}
                </Link>
              </td>
              <td className="px-3 py-2.5">{e.name}</td>
              <td className="px-3 py-2.5 text-gray-500">{e.manufacturer ?? '—'}</td>
              <td className="px-3 py-2.5 text-gray-500">{e.model ?? '—'}</td>
              <td className="px-3 py-2.5">
                <StatusBadge label={EQUIPMENT_STATUS_LABELS[e.status]} tone={e.status === 'fault' ? 'fault' : e.status === 'running' || e.status === 'available' ? 'ready' : 'watch'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
