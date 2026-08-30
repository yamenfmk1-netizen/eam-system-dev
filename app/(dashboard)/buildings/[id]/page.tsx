'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';

import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BuildingForm from '@/components/buildings/BuildingForm';
import PrivateFileLink from '@/components/ui/PrivateFileLink';

import {
  BUILDING_STATUS_LABELS,
  EQUIPMENT_STATUS_LABELS,
  TEST_TYPE_LABELS,
  TEST_RESULT_LABELS,
  MAINTENANCE_CATEGORY_LABELS,
  FAULT_STATUS_LABELS,
  FAULT_PRIORITY_LABELS,
  ATTACHMENT_CATEGORY_LABELS,
} from '@/types/database.types';

import type {
  Building,
  Equipment,
} from '@/types/database.types';

import {
  ArrowRight,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  User,
  Loader2,
  ShieldAlert,
  FileText,
  Eye,
  Download,
} from 'lucide-react';

import toast from 'react-hot-toast';
import Link from 'next/link';

const COMMON_TABS = [
  { key: 'tests', label: 'الاختبارات' },
  { key: 'maintenance', label: 'الصيانة' },
  { key: 'faults', label: 'الأعطال' },
  { key: 'files', label: 'المخططات والملفات' },
  { key: 'spare-parts', label: 'قطع الغيار' },
];

const EQUIPMENT_TYPE_LABELS_DYNAMIC: Record<string, string> = {
  // Electrical
  generator: 'المولدات',
  ats: 'ATS',
  ups: 'UPS',
  transformer: 'المحولات',
  switchgear: 'Switchgear',
  rmu: 'RMU',
  main_distribution_board: 'MDB',
  sub_main_distribution_board: 'SMDB',
  synchronizing_panel: 'لوحات التزامن',
  battery_bank: 'بنوك البطاريات',
  pdu: 'PDU',
  pdm: 'PDM',
  other: 'أخرى',

// HVAC
chiller: 'Chillers',
ahu: 'AHU',
oau: 'OAU',
fcu: 'FCU',
package_unit: 'Package Units',
split_unit: 'Split Units',
cooling_tower: 'Cooling Towers',
exhaust_fan: 'Exhaust Fans',
supply_fan: 'Supply Fans',
crah: 'CRAH',
crac: 'CRAC',

  // Mechanical / common future types
  pump: 'المضخات',
  fire_pump: 'مضخات الحريق',
  booster_pump: 'Booster Pumps',
  water_pump: 'مضخات المياه',
  air_compressor: 'ضواغط الهواء',
  water_tank: 'خزانات المياه',

  // Civil / common future types
  door: 'الأبواب',
  gate: 'البوابات',
  window: 'النوافذ',
  flooring: 'الأرضيات',
  ceiling: 'الأسقف',
  wall: 'الجدران',
  road: 'الطرق',
  fence: 'الأسوار',
};

function equipmentTypeLabel(type: string) {
  if (EQUIPMENT_TYPE_LABELS_DYNAMIC[type]) {
    return EQUIPMENT_TYPE_LABELS_DYNAMIC[type];
  }

  return type
    .split('_')
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

export default function BuildingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [building, setBuilding] =
    useState<Building | null>(null);

  const [equipment, setEquipment] =
    useState<Equipment[]>([]);

  const [tests, setTests] =
    useState<any[]>([]);

  const [maintenance, setMaintenance] =
    useState<any[]>([]);

  const [faults, setFaults] =
    useState<any[]>([]);

  const [attachments, setAttachments] =
    useState<any[]>([]);

  const [departmentName, setDepartmentName] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState('overview');

  const [showEdit, setShowEdit] =
    useState(false);

  const [showDelete, setShowDelete] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  async function load() {
    setLoading(true);

    try {
      // =========================
      // معرفة القسم الحالي للموقع
      // =========================

      const {
        data: department,
        error: departmentError,
      } = await supabase
        .from('departments')
        .select('id,name,code')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (departmentError || !department) {
        toast.error(
          `تعذر تحديد القسم: ${DEPARTMENT_CODE}`
        );

        setLoading(false);
        return;
      }

      const departmentId = department.id;

      setDepartmentName(department.name);

      // =========================
      // تحميل بيانات المبنى
      // كل البيانات التشغيلية مفلترة بالقسم
      // =========================

      const [
        { data: b },
        { data: eq },
        { data: t },
        { data: m },
        { data: f },
        { data: att },
      ] = await Promise.all([
        // المبنى مشترك بين الأقسام
        supabase
          .from('buildings')
          .select('*')
          .eq('id', id)
          .single(),

        // معدات هذا القسم فقط
        supabase
          .from('equipment')
          .select('*')
          .eq('building_id', id)
          .eq(
            'department_id',
            departmentId
          )
          .is('deleted_at', null)
          .order('created_at'),

        // اختبارات هذا القسم فقط
        supabase
          .from('tests')
          .select(
            '*, equipment(name, asset_id)'
          )
          .eq('building_id', id)
          .eq(
            'department_id',
            departmentId
          )
          .order('test_date', {
            ascending: false,
          }),

        // صيانة هذا القسم فقط
        supabase
          .from('maintenance_records')
          .select(
            '*, equipment(name, asset_id)'
          )
          .eq('building_id', id)
          .eq(
            'department_id',
            departmentId
          )
          .order('maintenance_date', {
            ascending: false,
          }),

        // أعطال هذا القسم فقط
        supabase
          .from('faults')
          .select(
            '*, equipment(name, asset_id)'
          )
          .eq('building_id', id)
          .eq(
            'department_id',
            departmentId
          )
          .order('reported_at', {
            ascending: false,
          }),

        // ملفات هذا القسم فقط
        supabase
          .from('attachments')
          .select(
            '*, equipment(name, asset_id)'
          )
          .eq('building_id', id)
          .eq(
            'department_id',
            departmentId
          )
          .order('created_at', {
            ascending: false,
          }),
      ]);

      setBuilding(b);
      setEquipment((eq ?? []) as Equipment[]);
      setTests(t ?? []);
      setMaintenance(m ?? []);
      setFaults(f ?? []);
      setAttachments(att ?? []);

      setActiveTab('overview');
    } catch (error: any) {
      console.error(error);

      toast.error(
        error?.message ??
          'تعذر تحميل بيانات المبنى'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      load();
    }
  }, [id]);

  async function handleDelete() {
    setDeleting(true);

    const { error } = await supabase
      .from('buildings')
      .update({
        deleted_at:
          new Date().toISOString(),
      })
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
    return (
      <div className="card py-16 text-center text-sm text-gray-400">
        المبنى غير موجود
      </div>
    );
  }

  // =========================
  // معدات المبنى حسب النوع
  // =========================

  const equipmentByType = (
    type: string
  ) =>
    equipment.filter(
      (item) => item.type === type
    );

  // أنواع المعدات الموجودة فعلياً
  // لهذا القسم داخل هذا المبنى فقط
  const equipmentTypesInBuilding =
    Array.from(
      new Set(
        equipment
          .map((item) => item.type)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      equipmentTypeLabel(a).localeCompare(
        equipmentTypeLabel(b),
        'ar'
      )
    );

  // التبويبات تتولد تلقائياً
  const tabs = [
    {
      key: 'overview',
      label: 'نظرة عامة',
    },

    ...equipmentTypesInBuilding.map(
      (type) => ({
        key: `equipment:${type}`,
        label:
          equipmentTypeLabel(type),
      })
    ),

    ...COMMON_TABS,
  ];

  // =========================
  // الإحصائيات
  // =========================

  const openFaults =
    faults.filter(
      (fault) =>
        !['resolved', 'closed'].includes(
          fault.status
        )
    );

  const selectedEquipmentType =
    activeTab.startsWith('equipment:')
      ? activeTab.replace(
          'equipment:',
          ''
        )
      : null;

  return (
    <div className="space-y-5">
      {/* رجوع */}
      <button
        onClick={() =>
          router.push('/buildings')
        }
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowRight className="h-4 w-4" />
        رجوع إلى المباني
      </button>

      {/* =========================
          Header
          ========================= */}

      <div className="card flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">
              {building.name}
            </h1>

            {building.criticality ===
              'critical' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                <ShieldAlert className="h-3.5 w-3.5" />
                مبنى حرج
              </span>
            )}

            <StatusBadge
              label={
                BUILDING_STATUS_LABELS[
                  building.status
                ] ?? building.status
              }
              tone={building.status}
            />

            {departmentName && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {departmentName}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500">
            مبنى رقم{' '}
            {building.building_number}

            {building.department &&
              ` · ${building.department}`}
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1 font-medium text-gray-600">
              <MapPin className="h-3.5 w-3.5" />

              {building.station ||
                'غير محدد'}
            </span>

            {building.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />

                {building.location}
              </span>
            )}

            {building.responsible_person && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />

                {
                  building.responsible_person
                }
              </span>
            )}

            {building.contact_phone && (
              <span
                className="flex items-center gap-1"
                dir="ltr"
              >
                <Phone className="h-3.5 w-3.5" />

                {building.contact_phone}
              </span>
            )}

            {building.contact_email && (
              <span
                className="flex items-center gap-1"
                dir="ltr"
              >
                <Mail className="h-3.5 w-3.5" />

                {building.contact_email}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() =>
              setShowEdit(true)
            }
            className="btn-secondary"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>

          <button
            onClick={() =>
              setShowDelete(true)
            }
            className="btn-danger"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      </div>

      {/* =========================
          Tabs
          ========================= */}

      <div className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() =>
              setActiveTab(tab.key)
            }
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

      {/* =========================
          Content
          ========================= */}

      <div className="card">
        {/* =========================
            Overview
            ========================= */}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat
              label="إجمالي المعدات"
              value={equipment.length}
            />

            {equipmentTypesInBuilding.map(
              (type) => (
                <SummaryStat
                  key={type}
                  label={
                    equipmentTypeLabel(
                      type
                    )
                  }
                  value={
                    equipmentByType(type)
                      .length
                  }
                />
              )
            )}

            <SummaryStat
              label="أعطال مفتوحة"
              value={openFaults.length}
            />

            <SummaryStat
              label="آخر اختبار"
              value={
                tests[0]
                  ? new Date(
                      tests[0].test_date
                    ).toLocaleDateString(
                      'ar-SA'
                    )
                  : '—'
              }
            />

            <SummaryStat
              label="آخر صيانة"
              value={
                maintenance[0]
                  ? new Date(
                      maintenance[0]
                        .maintenance_date
                    ).toLocaleDateString(
                      'ar-SA'
                    )
                  : '—'
              }
            />
          </div>
        )}

        {/* =========================
            Dynamic Equipment Type
            ========================= */}

        {selectedEquipmentType && (
          <EquipmentTable
            items={equipmentByType(
              selectedEquipmentType
            )}
          />
        )}

        {/* =========================
            Tests
            ========================= */}

        {activeTab === 'tests' &&
          (tests.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد اختبارات مسجلة
              لهذا المبنى في هذا القسم
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">
                      رقم الاختبار
                    </th>

                    <th className="px-3 py-2">
                      النوع
                    </th>

                    <th className="px-3 py-2">
                      المعدة
                    </th>

                    <th className="px-3 py-2">
                      التاريخ
                    </th>

                    <th className="px-3 py-2">
                      النتيجة
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {tests.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td
                        className="px-3 py-2.5 font-medium text-gray-800"
                        dir="ltr"
                      >
                        {t.test_number}
                      </td>

                      <td className="px-3 py-2.5 text-gray-500">
                        {TEST_TYPE_LABELS[
                          t.test_type as keyof typeof TEST_TYPE_LABELS
                        ] ?? t.test_type}
                      </td>

                      <td className="px-3 py-2.5 text-gray-500">
                        {t.equipment
                          ?.name ?? '—'}
                      </td>

                      <td className="px-3 py-2.5 text-gray-500">
                        {new Date(
                          t.test_date
                        ).toLocaleDateString(
                          'ar-SA'
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={
                            TEST_RESULT_LABELS[
                              t.result as keyof typeof TEST_RESULT_LABELS
                            ] ?? t.result
                          }
                          tone={
                            t.result ===
                            'passed'
                              ? 'ready'
                              : t.result ===
                                  'passed_with_observation'
                                ? 'watch'
                                : t.result ===
                                    'failed'
                                  ? 'fault'
                                  : 'unknown'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {/* =========================
            Maintenance
            ========================= */}

        {activeTab ===
          'maintenance' &&
          (maintenance.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد سجلات صيانة لهذا
              المبنى في هذا القسم
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">
                      رقم الصيانة
                    </th>

                    <th className="px-3 py-2">
                      المعدة
                    </th>

                    <th className="px-3 py-2">
                      النوع
                    </th>

                    <th className="px-3 py-2">
                      التاريخ
                    </th>

                    <th className="px-3 py-2">
                      الفني
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {maintenance.map(
                    (m) => (
                      <tr
                        key={m.id}
                        className="border-b border-gray-50 hover:bg-gray-50"
                      >
                        <td
                          className="px-3 py-2.5 font-medium text-gray-800"
                          dir="ltr"
                        >
                          {
                            m.maintenance_number
                          }
                        </td>

                        <td className="px-3 py-2.5 text-gray-500">
                          {m.equipment
                            ?.name ?? '—'}
                        </td>

                        <td className="px-3 py-2.5">
                          <StatusBadge
                            label={
                              MAINTENANCE_CATEGORY_LABELS[
                                m.category as keyof typeof MAINTENANCE_CATEGORY_LABELS
                              ] ??
                              m.category
                            }
                            tone={
                              m.category ===
                              'preventive'
                                ? 'ready'
                                : 'watch'
                            }
                          />
                        </td>

                        <td className="px-3 py-2.5 text-gray-500">
                          {new Date(
                            m.maintenance_date
                          ).toLocaleDateString(
                            'ar-SA'
                          )}
                        </td>

                        <td className="px-3 py-2.5 text-gray-500">
                          {m.technician_name ??
                            '—'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          ))}

        {/* =========================
            Faults
            ========================= */}

        {activeTab === 'faults' &&
          (faults.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد أعطال مسجلة لهذا
              المبنى في هذا القسم
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
                    <th className="px-3 py-2">
                      رقم العطل
                    </th>

                    <th className="px-3 py-2">
                      المعدة
                    </th>

                    <th className="px-3 py-2">
                      الوصف
                    </th>

                    <th className="px-3 py-2">
                      الأولوية
                    </th>

                    <th className="px-3 py-2">
                      الحالة
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {faults.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td
                        className="px-3 py-2.5 font-medium text-gray-800"
                        dir="ltr"
                      >
                        {f.fault_number}
                      </td>

                      <td className="px-3 py-2.5 text-gray-500">
                        {f.equipment
                          ?.name ?? '—'}
                      </td>

                      <td className="max-w-[220px] truncate px-3 py-2.5 text-gray-600">
                        {f.description}
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={
                            FAULT_PRIORITY_LABELS[
                              f.priority as keyof typeof FAULT_PRIORITY_LABELS
                            ] ??
                            f.priority
                          }
                          tone={
                            f.priority ===
                            'critical'
                              ? 'fault'
                              : f.priority ===
                                  'high'
                                ? 'watch'
                                : 'info'
                          }
                        />
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={
                            FAULT_STATUS_LABELS[
                              f.status as keyof typeof FAULT_STATUS_LABELS
                            ] ??
                            f.status
                          }
                          tone={
                            [
                              'resolved',
                              'closed',
                            ].includes(
                              f.status
                            )
                              ? 'ready'
                              : f.status ===
                                  'open'
                                ? 'fault'
                                : 'watch'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {/* =========================
            Files
            ========================= */}

        {activeTab === 'files' &&
          (attachments.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              لا توجد ملفات مرفوعة لهذا
              المبنى في هذا القسم
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />

                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {a.file_name}
                      </p>

                      <p className="text-xs text-gray-400">
                        {ATTACHMENT_CATEGORY_LABELS[
                          a.category as keyof typeof ATTACHMENT_CATEGORY_LABELS
                        ] ??
                          a.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <PrivateFileLink
                      bucket="documents"
                      path={a.file_url}
                      mode="view"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                    >
                      <Eye className="h-4 w-4" />
                    </PrivateFileLink>

                    <PrivateFileLink
                      bucket="documents"
                      path={a.file_url}
                      mode="download"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                    >
                      <Download className="h-4 w-4" />
                    </PrivateFileLink>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {/* =========================
            Spare Parts
            ========================= */}

        {activeTab ===
          'spare-parts' && (
          <div className="py-10 text-center text-sm text-gray-400">
            قطع الغيار مرتبطة بالقسم
            وأنواع المعدات، ويمكن
            الاطلاع عليها من صفحة{' '}
            <Link
              href="/spare-parts"
              className="font-medium text-primary-600 hover:underline"
            >
              قطع الغيار
            </Link>
          </div>
        )}
      </div>

      {/* =========================
          Edit Building
          ========================= */}

      {showEdit && (
        <BuildingForm
          building={building}
          stations={[
            building.station ||
              'الحرم الرئيسي',
          ]}
          onClose={() =>
            setShowEdit(false)
          }
          onSaved={load}
        />
      )}

      {/* =========================
          Delete Building
          ========================= */}

      <ConfirmDialog
        open={showDelete}
        title="حذف المبنى"
        message={`هل أنت متأكد من حذف "${building.name}"؟ سيتم إخفاء المبنى وجميع بياناته من النظام (حذف منطقي قابل للاستعادة من قبل مدير النظام عند الحاجة).`}
        onConfirm={handleDelete}
        onCancel={() =>
          setShowDelete(false)
        }
        loading={deleting}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-gray-500">
        {label}
      </p>
    </div>
  );
}

function EquipmentTable({
  items,
}: {
  items: Equipment[];
}) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        لا توجد معدات في هذا التصنيف
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-right text-xs text-gray-400">
            <th className="px-3 py-2">
              رقم الأصل
            </th>

            <th className="px-3 py-2">
              الاسم
            </th>

            <th className="px-3 py-2">
              الشركة المصنعة
            </th>

            <th className="px-3 py-2">
              الموديل
            </th>

            <th className="px-3 py-2">
              الحالة
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((e) => (
            <tr
              key={e.id}
              className="border-b border-gray-50 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/equipment/${e.id}`}
                  className="font-medium text-primary-600 hover:underline"
                >
                  {e.asset_id}
                </Link>
              </td>

              <td className="px-3 py-2.5">
                {e.name}
              </td>

              <td className="px-3 py-2.5 text-gray-500">
                {e.manufacturer ?? '—'}
              </td>

              <td className="px-3 py-2.5 text-gray-500">
                {e.model ?? '—'}
              </td>

              <td className="px-3 py-2.5">
                <StatusBadge
                  label={
                    EQUIPMENT_STATUS_LABELS[
                      e.status
                    ] ?? e.status
                  }
                  tone={
                    e.status === 'fault'
                      ? 'fault'
                      : e.status ===
                            'running' ||
                          e.status ===
                            'available'
                        ? 'ready'
                        : 'watch'
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
