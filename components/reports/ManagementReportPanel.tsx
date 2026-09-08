'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { buildManagementReport, riyadhDay } from '@/lib/reports/management';
import type { Work, FaultRow, TestRow, Option, ManagementReport, Row } from '@/lib/reports/management';

// Page every query: Supabase's row limit must not silently truncate totals.
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    result.push(...rows);
    if (rows.length < size) return result;
  }
}

function ReportTable({ rows }: { rows: Row[] }) {
  const [shown, setShown] = useState(25);
  if (!rows.length) return <p className="p-4 text-sm text-gray-500">لا توجد سجلات مطابقة.</p>;
  const columns = Object.keys(rows[0]);
  return <>
    <div className="overflow-x-auto"><table className="w-full text-right text-sm">
      <thead className="bg-gray-50"><tr>{columns.map(c => <th key={c} className="whitespace-nowrap p-3 font-semibold">{c}</th>)}</tr></thead>
      <tbody>{rows.slice(0, shown).map((row, i) => <tr key={i} className="border-t">{columns.map(c => <td key={c} className="min-w-[110px] p-3 align-top">{row[c]}</td>)}</tr>)}</tbody>
    </table></div>
    {rows.length > shown && <button className="btn-secondary m-3" onClick={() => setShown(n => n + 50)}>عرض المزيد ({shown} من {rows.length})</button>}
  </>;
}

export default function ManagementReportPanel() {
  const supabase = useMemo(() => createClient(), []);
  const today = riyadhDay();
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [department, setDepartment] = useState('all');
  const [building, setBuilding] = useState('all');
  const [departments, setDepartments] = useState<Option[]>([]);
  const [buildings, setBuildings] = useState<Option[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<ManagementReport | null>(null);
  const [decisions, setDecisions] = useState('');
  const [reportFilters, setReportFilters] = useState('');
  const filters = JSON.stringify([start, end, department, building]);
  const stale = Boolean(report && reportFilters !== filters);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('تعذر التحقق من تسجيل الدخول. أعد تسجيل الدخول.');
        const access = await allRows<{ department_id: string }>((from, to) => supabase.from('user_departments').select('department_id').eq('user_id', user.id).order('department_id').range(from, to));
        const ids = Array.from(new Set(access.map(a => a.department_id)));
        if (!ids.length) throw new Error('لا توجد أقسام مرتبطة بحسابك. اطلب من مدير النظام ربط الأقسام المسموحة.');
        const results = await Promise.all([
          allRows<Option>((from, to) => supabase.from('departments').select('id,name').in('id', ids).order('id').range(from, to)),
          allRows<Option>((from, to) => supabase.from('buildings').select('id,name').is('deleted_at', null).order('id').range(from, to)),
        ]);
        if (active) { setDepartments(results[0]); setBuildings(results[1]); setReady(true); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل خيارات التقرير.'); }
    }
    load(); return () => { active = false; };
  }, [supabase]);

  async function generate() {
    if (!start || !end || start > end || end > today) { setError('اختر فترة صحيحة تنتهي اليوم أو قبله.'); return; }
    setBusy('generate'); setError(''); setReport(null);
    try {
      const ids = department === 'all' ? departments.map(d => d.id) : departments.filter(d => d.id === department).map(d => d.id);
      if (!ids.length) throw new Error('لا يوجد قسم متاح لهذا التقرير.');
      const scope = (query: any) => {
        const scoped = query.in('department_id', ids);
        return building === 'all' ? scoped : scoped.eq('building_id', building);
      };
      const [works, faults, tests] = await Promise.all([
        allRows<Work>((from, to) => scope(supabase.from('maintenance_records').select('id,maintenance_number,building_id,department_id,maintenance_date,status,category,cost,work_description')).lte('maintenance_date', today).order('id').range(from, to)),
        allRows<FaultRow>((from, to) => scope(supabase.from('faults').select('id,fault_number,building_id,department_id,reported_at,status,priority,description')).lte('reported_at', new Date().toISOString()).order('id').range(from, to)),
        allRows<TestRow>((from, to) => scope(supabase.from('tests').select('id,test_number,building_id,department_id,test_date,result')).gte('test_date', start).lte('test_date', end).order('id').range(from, to)),
      ]);
      setReport(buildManagementReport({ start, end, works, faults, tests, buildings, departments, scope: `${department === 'all' ? 'جميع الأقسام المسموحة' : departments.find(d => d.id === department)?.name} / ${building === 'all' ? 'جميع المباني' : buildings.find(b => b.id === building)?.name}` }));
      setReportFilters(filters);
    } catch (e) { setError(`تعذر إنشاء التقرير: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`); }
    finally { setBusy(''); }
  }
  async function download(format: 'pdf' | 'excel') {
    if (!report || stale) return;
    setBusy(format);
    try {
      const exporter = await import('@/lib/reports/export-management');
      if (format === 'pdf') await exporter.exportManagementPdf(report, decisions);
      else await exporter.exportManagementExcel(report, decisions);
      toast.success('تم تصدير التقرير الإداري');
    } catch (e) { toast.error(`تعذر التصدير: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`); }
    finally { setBusy(''); }
  }

  return <section className="space-y-4" dir="rtl" aria-labelledby="management-report-title">
    <div className="card border-t-4 border-primary-600">
      <div className="mb-5 flex items-center gap-3"><ClipboardList className="h-6 w-6 text-primary-600" /><div><h2 id="management-report-title" className="text-lg font-bold">التقرير الإداري المخصص</h2><p className="mt-1 text-sm text-gray-500">إنجاز الفترة والتكاليف المسجلة والمتابعات المطلوبة.</p></div></div>
      <fieldset disabled={!ready || Boolean(busy)} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium">من تاريخ<input type="date" value={start} max={end || today} onChange={e => setStart(e.target.value)} className="input-field mt-2" /></label>
        <label className="text-sm font-medium">إلى تاريخ<input type="date" value={end} min={start} max={today} onChange={e => setEnd(e.target.value)} className="input-field mt-2" /></label>
        <label className="text-sm font-medium">القسم<select value={department} onChange={e => setDepartment(e.target.value)} className="input-field mt-2"><option value="all">جميع الأقسام المسموحة</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="text-sm font-medium">المبنى<select value={building} onChange={e => setBuilding(e.target.value)} className="input-field mt-2"><option value="all">جميع المباني</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={!ready || Boolean(busy)} onClick={generate} className="btn-primary">{busy === 'generate' && <Loader2 className="h-4 w-4 animate-spin" />}إنشاء التقرير</button>{!ready && !error && <span role="status" className="text-sm text-gray-500">جارٍ تحميل الأقسام والمباني…</span>}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
    {stale && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">تغيرت الفلاتر. اضغط «إنشاء التقرير» لتحديث النتائج قبل التصدير.</p>}
    {report && <div className="space-y-4">
      <div className="card"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-bold">ملخص الإدارة</h3><p className="mt-2 text-sm text-gray-600">{report.start} — {report.end} · {report.scope}</p><p className="mt-1 text-sm text-gray-500">الحالات والمتأخرات محدثة عند إصدار التقرير: {new Date(report.generatedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</p></div><div className="flex gap-2"><button disabled={Boolean(busy) || stale} onClick={() => download('pdf')} className="btn-secondary">{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF</button><button disabled={Boolean(busy) || stale} onClick={() => download('excel')} className="btn-secondary">{busy === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Excel</button></div></div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.summary.map((row, i) => <div key={i} className="rounded-xl border bg-gray-50 p-4"><p className="text-sm text-gray-600">{row.المؤشر}</p><p className="mt-2 text-2xl font-bold text-primary-700">{typeof row.القيمة === 'number' ? row.القيمة.toLocaleString('ar-SA') : row.القيمة}</p></div>)}</div>
      </div>
      <div className="card"><label htmlFor="report-decisions" className="font-bold">القرارات المطلوبة من الإدارة</label><p className="my-2 text-sm text-gray-500">أضف طلبات الاعتماد أو الدعم؛ تظهر في PDF وExcel. النص لا يُحفظ في قاعدة البيانات.</p><textarea id="report-decisions" value={decisions} disabled={Boolean(busy)} onChange={e => setDecisions(e.target.value)} rows={4} maxLength={6000} className="input-field" placeholder="مثال: مطلوب اعتماد شراء القطعة المرتبطة بأمر العمل…" /></div>
      {report.sections.map((section, i) => <details key={`${report.generatedAt}-${i}`} open={i === 0} className="overflow-hidden rounded-xl border bg-white"><summary className="cursor-pointer p-4 font-semibold">{section.title} ({section.rows.length})</summary><ReportTable rows={section.rows} /></details>)}
      <details className="card"><summary className="cursor-pointer text-sm font-semibold">كيف تُحسب الأرقام؟</summary><ul className="mt-3 list-inside list-disc space-y-2 text-sm text-gray-600">{report.notes.map(note => <li key={note}>{note}</li>)}</ul></details>
    </div>}
  </section>;
}
