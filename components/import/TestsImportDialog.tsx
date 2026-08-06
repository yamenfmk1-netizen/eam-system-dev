'use client';

import { useMemo, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

export type TestImportRow = {
  test_number: string;
  test_type: string;
  building_number: string;
  asset_id: string;
  test_date: string;
  start_time: string;
  end_time: string;
  interruption_duration_minutes: string | number;
  responsible_person: string;
  equipment_started_successfully: string | boolean;
  ats_worked: string | boolean;
  load_transferred: string | boolean;
  power_restored_normally: string | boolean;
  result: string;
  notes: string;
  recommendations: string;
  next_test_date: string;
};

type DuplicateMode = 'skip' | 'update';

type ImportResponse = {
  success?: boolean;
  imported?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ row: number; test_number?: string; message: string }>;
  error?: string;
};

const HEADERS: Array<{ key: keyof TestImportRow; label: string }> = [
  { key: 'test_number', label: 'رقم الاختبار' },
  { key: 'test_type', label: 'نوع الاختبار' },
  { key: 'building_number', label: 'رقم المبنى' },
  { key: 'asset_id', label: 'رقم الأصل' },
  { key: 'test_date', label: 'تاريخ الاختبار' },
  { key: 'start_time', label: 'وقت البداية' },
  { key: 'end_time', label: 'وقت النهاية' },
  { key: 'interruption_duration_minutes', label: 'مدة الانقطاع بالدقائق' },
  { key: 'responsible_person', label: 'الشخص المسؤول' },
  { key: 'equipment_started_successfully', label: 'اشتغلت المعدة بنجاح' },
  { key: 'ats_worked', label: 'عمل ATS' },
  { key: 'load_transferred', label: 'تم نقل الحمل' },
  { key: 'power_restored_normally', label: 'عادت الكهرباء طبيعيًا' },
  { key: 'result', label: 'النتيجة' },
  { key: 'notes', label: 'الملاحظات' },
  { key: 'recommendations', label: 'التوصيات' },
  { key: 'next_test_date', label: 'تاريخ الاختبار القادم' },
];

const HEADER_ALIASES: Record<string, keyof TestImportRow> = {
  'رقم الاختبار': 'test_number', test_number: 'test_number', 'test number': 'test_number',
  'نوع الاختبار': 'test_type', test_type: 'test_type', 'test type': 'test_type',
  'رقم المبنى': 'building_number', building_number: 'building_number', building: 'building_number',
  'رقم الأصل': 'asset_id', asset_id: 'asset_id', 'asset id': 'asset_id',
  'تاريخ الاختبار': 'test_date', test_date: 'test_date', 'test date': 'test_date',
  'وقت البداية': 'start_time', start_time: 'start_time',
  'وقت النهاية': 'end_time', end_time: 'end_time',
  'مدة الانقطاع بالدقائق': 'interruption_duration_minutes', interruption_duration_minutes: 'interruption_duration_minutes',
  'الشخص المسؤول': 'responsible_person', responsible_person: 'responsible_person',
  'اشتغلت المعدة بنجاح': 'equipment_started_successfully', equipment_started_successfully: 'equipment_started_successfully',
  'عمل ats': 'ats_worked', ats_worked: 'ats_worked',
  'تم نقل الحمل': 'load_transferred', load_transferred: 'load_transferred',
  'عادت الكهرباء طبيعيًا': 'power_restored_normally', power_restored_normally: 'power_restored_normally',
  'النتيجة': 'result', result: 'result',
  'الملاحظات': 'notes', notes: 'notes',
  'التوصيات': 'recommendations', recommendations: 'recommendations',
  'تاريخ الاختبار القادم': 'next_test_date', next_test_date: 'next_test_date',
};

const TEST_TYPE_HELP = [
  'generator_operational_test', 'actual_power_interruption_test', 'ats_transfer_test',
  'ups_battery_test', 'ups_bypass_test', 'transformer_inspection', 'switchgear_test',
  'rmu_inspection', 'battery_test', 'custom_test',
].join('، ');

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function excelDateToIso(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = cellToText(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
}

function createEmptyRow(): TestImportRow {
  return {
    test_number: '', test_type: '', building_number: '', asset_id: '', test_date: '',
    start_time: '', end_time: '', interruption_duration_minutes: '', responsible_person: '',
    equipment_started_successfully: '', ats_worked: '', load_transferred: '',
    power_restored_normally: '', result: '', notes: '', recommendations: '', next_test_date: '',
  };
}

export default function TestsImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<TestImportRow[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const localErrors = useMemo(() => rows.map((row, index) => {
    const missing = [] as string[];
    if (!row.test_number) missing.push('رقم الاختبار');
    if (!row.test_type) missing.push('نوع الاختبار');
    if (!row.building_number) missing.push('رقم المبنى');
    if (!row.test_date) missing.push('تاريخ الاختبار');
    if (!row.result) missing.push('النتيجة');
    return missing.length ? { row: index + 2, message: `حقول ناقصة: ${missing.join('، ')}` } : null;
  }).filter(Boolean) as Array<{ row: number; message: string }>, [rows]);

  function downloadTemplate() {
    const example = [{
      'رقم الاختبار': 'TST-43-001',
      'نوع الاختبار': 'generator_operational_test',
      'رقم المبنى': '43',
      'رقم الأصل': 'GEN-43-01',
      'تاريخ الاختبار': '2026-08-01',
      'وقت البداية': '09:00',
      'وقت النهاية': '09:30',
      'مدة الانقطاع بالدقائق': 30,
      'الشخص المسؤول': 'م. يامن العمري',
      'اشتغلت المعدة بنجاح': 'نعم',
      'عمل ATS': 'نعم',
      'تم نقل الحمل': 'نعم',
      'عادت الكهرباء طبيعيًا': 'نعم',
      'النتيجة': 'passed',
      'الملاحظات': 'اختبار ناجح',
      'التوصيات': '',
      'تاريخ الاختبار القادم': '2026-11-01',
    }];
    const ws = XLSX.utils.json_to_sheet(example);
    ws['!cols'] = HEADERS.map(() => ({ wch: 24 }));
    const help = XLSX.utils.aoa_to_sheet([
      ['القيم المسموحة لنوع الاختبار', TEST_TYPE_HELP],
      ['القيم المسموحة للنتيجة', 'passed، passed_with_observation، failed، not_completed'],
      ['القيم المنطقية', 'نعم/لا أو true/false أو 1/0'],
      ['ملاحظة رقم الأصل', 'اختياري؛ إذا تمت تعبئته يجب أن يكون الأصل داخل نفس المبنى'],
    ]);
    help['!cols'] = [{ wch: 32 }, { wch: 120 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الاختبارات');
    XLSX.utils.book_append_sheet(wb, help, 'تعليمات');
    XLSX.writeFile(wb, 'نموذج_استيراد_الاختبارات.xlsx');
  }

  async function readFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('الملف لا يحتوي على ورقة بيانات');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
      if (!raw.length) throw new Error('الملف لا يحتوي على سجلات');

      const mapped = raw.map((source) => {
        const target = createEmptyRow();
        Object.entries(source).forEach(([header, value]) => {
          const key = HEADER_ALIASES[normalizeHeader(header)];
          if (!key) return;
          if (key === 'test_date' || key === 'next_test_date') {
            target[key] = excelDateToIso(value);
          } else if (key === 'interruption_duration_minutes') {
            target[key] = typeof value === 'number' ? value : cellToText(value);
          } else {
            (target[key] as string | boolean) = cellToText(value);
          }
        });
        return target;
      }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ''));

      setFileName(file.name);
      setRows(mapped);
      setResult(null);
    } catch (error: any) {
      setFileName('');
      setRows([]);
      toast.error(error.message ?? 'تعذر قراءة الملف');
    }
  }

  async function importRows() {
    if (!rows.length) return;
    if (localErrors.length) {
      toast.error('صحح الحقول المطلوبة قبل الاستيراد');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/tests/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, duplicateMode }),
      });
      const data = await response.json().catch(() => ({ error: 'استجابة غير صالحة من الخادم' }));
      if (!response.ok) throw new Error(data.error ?? 'تعذر استيراد الاختبارات');
      setResult(data);
      toast.success(`تمت معالجة ${data.imported + data.updated + data.skipped} سجل`);
      onImported();
    } catch (error: any) {
      toast.error(error.message ?? 'تعذر استيراد الاختبارات');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">استيراد الاختبارات من Excel أو CSV</h2>
            <p className="mt-1 text-sm text-gray-500">ارفع الملف، راجع المعاينة، ثم استورد السجلات دفعة واحدة.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <button onClick={downloadTemplate} className="btn-secondary justify-center"><FileDown className="h-4 w-4" /> تحميل النموذج</button>
          <button onClick={() => inputRef.current?.click()} className="btn-secondary justify-center"><Upload className="h-4 w-4" /> اختيار ملف</button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.currentTarget.value = '';
          }} />
          <select value={duplicateMode} onChange={(event) => setDuplicateMode(event.target.value as DuplicateMode)} className="input-field">
            <option value="skip">المكرر: تجاهل السجل</option>
            <option value="update">المكرر: تحديث السجل</option>
          </select>
        </div>

        <div className="mb-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="flex items-center gap-2 font-medium text-gray-800"><FileSpreadsheet className="h-4 w-4" /> {fileName || 'لم يتم اختيار ملف'}</div>
          <p className="mt-1">عدد السجلات المقروءة: {rows.length}</p>
        </div>

        {localErrors.length > 0 && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">وجدنا {localErrors.length} خطأ قبل الاستيراد:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {localErrors.slice(0, 8).map((error) => <li key={`${error.row}-${error.message}`}>صف Excel {error.row}: {error.message}</li>)}
              {localErrors.length > 8 && <li>و{localErrors.length - 8} أخطاء إضافية</li>}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mb-5 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[1100px] text-xs">
              <thead><tr className="bg-gray-50 text-right text-gray-500">
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">رقم الاختبار</th>
                <th className="px-3 py-3">النوع</th>
                <th className="px-3 py-3">المبنى</th>
                <th className="px-3 py-3">الأصل</th>
                <th className="px-3 py-3">التاريخ</th>
                <th className="px-3 py-3">النتيجة</th>
                <th className="px-3 py-3">الملاحظات</th>
              </tr></thead>
              <tbody>{rows.slice(0, 100).map((row, index) => (
                <tr key={`${row.test_number}-${index}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-400">{index + 2}</td>
                  <td className="px-3 py-2" dir="ltr">{row.test_number || '—'}</td>
                  <td className="px-3 py-2" dir="ltr">{row.test_type || '—'}</td>
                  <td className="px-3 py-2">{row.building_number || '—'}</td>
                  <td className="px-3 py-2" dir="ltr">{row.asset_id || '—'}</td>
                  <td className="px-3 py-2">{row.test_date || '—'}</td>
                  <td className="px-3 py-2" dir="ltr">{row.result || '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2">{row.notes || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > 100 && <p className="border-t p-3 text-center text-xs text-gray-500">تم عرض أول 100 سجل فقط من أصل {rows.length}.</p>}
          </div>
        )}

        {result && (
          <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">نتيجة الاستيراد</p>
            <p className="mt-1">جديد: {result.imported ?? 0} — محدّث: {result.updated ?? 0} — متجاهل: {result.skipped ?? 0} — فشل: {result.failed ?? 0}</p>
            {!!result.errors?.length && (
              <ul className="mt-2 list-inside list-disc text-red-700">
                {result.errors.slice(0, 10).map((error) => <li key={`${error.row}-${error.message}`}>صف {error.row}: {error.message}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">إغلاق</button>
          <button onClick={importRows} disabled={loading || !rows.length || localErrors.length > 0} className="btn-primary flex-1 justify-center">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            استيراد {rows.length || ''} اختبار
          </button>
        </div>
      </div>
    </div>
  );
}
