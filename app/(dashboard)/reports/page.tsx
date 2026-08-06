'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FileDown, FileSpreadsheet, Loader2, Building2, Cpu, ClipboardCheck, Wrench, AlertTriangle, Package, Gauge, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, TEST_RESULT_LABELS, FAULT_STATUS_LABELS } from '@/types/database.types';

type ReportKey =
  | 'buildings' | 'equipment' | 'tests' | 'maintenance' | 'faults'
  | 'spare_parts' | 'readiness' | 'upcoming_maintenance' | 'monthly';

const REPORTS: { key: ReportKey; title: string; description: string; icon: any }[] = [
  { key: 'buildings', title: 'تقرير المباني', description: 'قائمة كاملة بجميع المباني وحالتها وعدد المعدات', icon: Building2 },
  { key: 'equipment', title: 'تقرير المعدات', description: 'كل الأصول الكهربائية عبر جميع المباني', icon: Cpu },
  { key: 'tests', title: 'تقرير الاختبارات', description: 'سجل كامل للاختبارات الدورية ونتائجها', icon: ClipboardCheck },
  { key: 'maintenance', title: 'تقرير الصيانة', description: 'سجل أعمال الصيانة الوقائية والعلاجية', icon: Wrench },
  { key: 'faults', title: 'تقرير الأعطال', description: 'جميع بلاغات الأعطال وحالتها الحالية', icon: AlertTriangle },
  { key: 'spare_parts', title: 'تقرير قطع الغيار', description: 'المخزون الحالي ومستويات إعادة الطلب', icon: Package },
  { key: 'readiness', title: 'تقرير الجاهزية', description: 'نسبة جاهزية المعدات الحرجة حسب المبنى', icon: Gauge },
  { key: 'upcoming_maintenance', title: 'تقرير الصيانة القادمة', description: 'كل أعمال الصيانة والاختبارات المستحقة خلال 30 يومًا', icon: CalendarClock },
  { key: 'monthly', title: 'التقرير الشهري', description: 'ملخص كل الاختبارات والصيانة والأعطال المسجّلة خلال الشهر الحالي', icon: CalendarClock },
];

export default function ReportsPage() {
  const supabase = createClient();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function fetchReportData(key: ReportKey) {
    switch (key) {
      case 'buildings': {
        const { data } = await supabase.from('buildings').select('*, equipment(count)').is('deleted_at', null);
        return (data ?? []).map((b: any) => ({
          'رقم المبنى': b.building_number,
          'اسم المبنى': b.name,
          'القسم': b.department ?? '—',
          'الحالة': b.status,
          'عدد المعدات': b.equipment?.[0]?.count ?? 0,
          'المسؤول': b.responsible_person ?? '—',
        }));
      }
      case 'equipment': {
        const { data } = await supabase.from('equipment').select('*, buildings(name)').is('deleted_at', null);
        return (data ?? []).map((e: any) => ({
          'رقم الأصل': e.asset_id,
          'الاسم': e.name,
          'النوع': EQUIPMENT_TYPE_LABELS[e.type as keyof typeof EQUIPMENT_TYPE_LABELS] ?? e.type,
          'المبنى': e.buildings?.name ?? '—',
          'الشركة المصنعة': e.manufacturer ?? '—',
          'الحالة': EQUIPMENT_STATUS_LABELS[e.status as keyof typeof EQUIPMENT_STATUS_LABELS] ?? e.status,
        }));
      }
      case 'tests': {
        const { data } = await supabase.from('tests').select('*, buildings(name), equipment(name)');
        return (data ?? []).map((t: any) => ({
          'رقم الاختبار': t.test_number,
          'المبنى': t.buildings?.name ?? '—',
          'المعدة': t.equipment?.name ?? '—',
          'التاريخ': t.test_date,
          'النتيجة': TEST_RESULT_LABELS[t.result as keyof typeof TEST_RESULT_LABELS] ?? t.result,
          'القادم': t.next_test_date ?? '—',
        }));
      }
      case 'maintenance': {
        const { data } = await supabase.from('maintenance_records').select('*, buildings(name), equipment(name)');
        return (data ?? []).map((m: any) => ({
          'رقم الصيانة': m.maintenance_number,
          'المبنى': m.buildings?.name ?? '—',
          'المعدة': m.equipment?.name ?? '—',
          'النوع': m.category === 'preventive' ? 'وقائية' : 'علاجية',
          'التاريخ': m.maintenance_date,
          'الفني': m.technician_name ?? '—',
        }));
      }
      case 'faults': {
        const { data } = await supabase.from('faults').select('*, buildings(name), equipment(name)');
        return (data ?? []).map((f: any) => ({
          'رقم العطل': f.fault_number,
          'المبنى': f.buildings?.name ?? '—',
          'المعدة': f.equipment?.name ?? '—',
          'الأولوية': f.priority,
          'الحالة': FAULT_STATUS_LABELS[f.status as keyof typeof FAULT_STATUS_LABELS] ?? f.status,
          'تاريخ البلاغ': new Date(f.reported_at).toLocaleDateString('en-CA'),
        }));
      }
      case 'spare_parts': {
        const { data } = await supabase.from('spare_parts').select('*');
        return (data ?? []).map((p: any) => ({
          'اسم القطعة': p.part_name,
          'Part Number': p.part_number ?? '—',
          'الكمية المتوفرة': p.quantity_available,
          'الحد الأدنى': p.minimum_stock,
          'الحالة': p.quantity_available <= p.minimum_stock ? 'منخفض' : 'متوفر',
          'الموقع': p.storage_location ?? '—',
        }));
      }
      case 'readiness': {
        const { data: buildings } = await supabase.from('buildings').select('id, name, building_number, status').is('deleted_at', null);
        const { data: equipment } = await supabase.from('equipment').select('building_id, status, criticality').is('deleted_at', null);
        return (buildings ?? []).map((b: any) => {
          const eq = (equipment ?? []).filter((e: any) => e.building_id === b.id);
          const critical = eq.filter((e: any) => e.criticality === 'critical');
          const readyCritical = critical.filter((e: any) => ['available', 'running', 'standby'].includes(e.status));
          const readiness = critical.length ? Math.round((readyCritical.length / critical.length) * 100) : 100;
          return {
            'المبنى': b.name,
            'رقم المبنى': b.building_number,
            'إجمالي المعدات': eq.length,
            'المعدات الحرجة': critical.length,
            'نسبة الجاهزية %': readiness,
            'الحالة العامة': b.status,
          };
        });
      }
      case 'upcoming_maintenance': {
        const in30 = new Date();
        in30.setDate(in30.getDate() + 30);
        const in30Str = in30.toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const [{ data: m }, { data: t }] = await Promise.all([
          supabase.from('maintenance_records').select('maintenance_number, next_maintenance_date, buildings(name)').gte('next_maintenance_date', today).lte('next_maintenance_date', in30Str),
          supabase.from('tests').select('test_number, next_test_date, buildings(name)').gte('next_test_date', today).lte('next_test_date', in30Str),
        ]);
        return [
          ...(m ?? []).map((r: any) => ({ 'النوع': 'صيانة', 'الرقم': r.maintenance_number, 'المبنى': r.buildings?.name ?? '—', 'التاريخ المستحق': r.next_maintenance_date })),
          ...(t ?? []).map((r: any) => ({ 'النوع': 'اختبار', 'الرقم': r.test_number, 'المبنى': r.buildings?.name ?? '—', 'التاريخ المستحق': r.next_test_date })),
        ].sort((a, b) => a['التاريخ المستحق'].localeCompare(b['التاريخ المستحق']));
      }
      case 'monthly': {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const [{ data: t }, { data: m }, { data: f }] = await Promise.all([
          supabase.from('tests').select('test_number, test_date, result, buildings(name)').gte('test_date', monthStart).lte('test_date', monthEnd),
          supabase.from('maintenance_records').select('maintenance_number, maintenance_date, category, buildings(name)').gte('maintenance_date', monthStart).lte('maintenance_date', monthEnd),
          supabase.from('faults').select('fault_number, reported_at, status, priority, buildings(name)').gte('reported_at', monthStart).lte('reported_at', monthEnd + 'T23:59:59'),
        ]);
        return [
          ...(t ?? []).map((r: any) => ({ 'النوع': 'اختبار', 'الرقم': r.test_number, 'المبنى': r.buildings?.name ?? '—', 'التاريخ': r.test_date, 'التفاصيل': TEST_RESULT_LABELS[r.result as keyof typeof TEST_RESULT_LABELS] ?? r.result })),
          ...(m ?? []).map((r: any) => ({ 'النوع': 'صيانة', 'الرقم': r.maintenance_number, 'المبنى': r.buildings?.name ?? '—', 'التاريخ': r.maintenance_date, 'التفاصيل': r.category === 'preventive' ? 'وقائية' : 'علاجية' })),
          ...(f ?? []).map((r: any) => ({ 'النوع': 'عطل', 'الرقم': r.fault_number, 'المبنى': r.buildings?.name ?? '—', 'التاريخ': (r.reported_at as string).slice(0, 10), 'التفاصيل': FAULT_STATUS_LABELS[r.status as keyof typeof FAULT_STATUS_LABELS] ?? r.status })),
        ].sort((a, b) => a['التاريخ'].localeCompare(b['التاريخ']));
      }
    }
  }

  async function exportExcel(key: ReportKey, title: string) {
    setLoadingKey(key + '-excel');
    try {
      const rows = await fetchReportData(key);
      if (!rows || rows.length === 0) {
        toast.error('لا توجد بيانات لهذا التقرير');
        return;
      }
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
      XLSX.writeFile(wb, `${title}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('تم تصدير ملف Excel');
    } catch (err: any) {
      toast.error('تعذر إنشاء الملف: ' + err.message);
    } finally {
      setLoadingKey(null);
    }
  }

  async function exportPdf(key: ReportKey, title: string) {
    setLoadingKey(key + '-pdf');
    const cleanupNodes: HTMLElement[] = [];
    try {
      const rows = await fetchReportData(key);
      if (!rows || rows.length === 0) {
        toast.error('لا توجد بيانات لهذا التقرير');
        return;
      }
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const columns = Object.keys(rows[0]);
      const dateStr = new Date().toLocaleDateString('ar-SA');
      const CONTAINER_WIDTH = 1400; // px CSS، يطابق ما تُقاس عليه ارتفاعات الصفوف
      const CAPTURE_SCALE = 1.5; // كافٍ للوضوح مع حجم ملف معقول (2 كان يُضخّم الحجم بلا داعٍ)

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      // كم بكسل CSS (بعرض CONTAINER_WIDTH) يقابل ارتفاع صفحة PDF واحدة بالضبط
      const maxPxHeightPerPage = pageHeight * (CONTAINER_WIDTH / pageWidth);
      const PAGE_MARGIN_PX = 24;

      // نبني الجدول كعنصر HTML فعلي (بدل الاعتماد على jsPDF/autoTable النصي المباشر)
      // لأن jsPDF لا يدعم تشكيل الحروف العربية بشكل صحيح افتراضيًا. نلتقطه كصورة
      // بواسطة html2canvas فيظهر النص العربي بشكله الصحيح كما في المتصفح.
      //
      // لتفادي تقطيع صف في منتصفه بين صفحتين (عيب معروف في القص الحسابي البسيط
      // لصورة طويلة واحدة)، نقيس ارتفاع كل صف فعليًا في DOM أولًا، ثم نجمّع الصفوف
      // في مجموعات تملأ صفحة كاملة كحد أقصى دون قطع أي صف، ونلتقط كل مجموعة
      // كصورة صفحة PDF منفصلة برأس جدول مكرر أعلى كل صفحة.
      const measureContainer = document.createElement('div');
      measureContainer.style.position = 'fixed';
      measureContainer.style.top = '0';
      measureContainer.style.left = '-99999px';
      measureContainer.style.direction = 'rtl';
      measureContainer.style.width = `${CONTAINER_WIDTH}px`;
      measureContainer.style.fontFamily = "'Cairo', Tahoma, sans-serif";
      measureContainer.style.visibility = 'hidden';
      document.body.appendChild(measureContainer);
      cleanupNodes.push(measureContainer);

      const rowHtml = (r: any) =>
        `<tr>${columns.map((c) => `<td style="border:1px solid #e4e7ec;padding:7px 10px;font-size:12px;">${String(r[c] ?? '')}</td>`).join('')}</tr>`;

      measureContainer.innerHTML = `<table style="width:100%;border-collapse:collapse;">${rows.map(rowHtml).join('')}</table>`;
      const trNodes = Array.from(measureContainer.querySelectorAll('tr')) as HTMLElement[];
      const rowHeights = trNodes.map((tr) => tr.getBoundingClientRect().height);

      const headerBlockHeight = 90; // مساحة تقريبية للعنوان + التاريخ في أول صفحة فقط
      const theadHeight = 40; // مكرّر أعلى كل صفحة

      // تقسيم الصفوف إلى مجموعات (صفحات) دون تجاوز الارتفاع المسموح لكل صفحة
      const pages: { rows: any[]; isFirst: boolean }[] = [];
      let currentRows: any[] = [];
      let currentHeight = 0;
      rows.forEach((row: any, i: number) => {
        const isFirstPage = pages.length === 0;
        const budget = maxPxHeightPerPage - PAGE_MARGIN_PX * 2 - theadHeight - (isFirstPage ? headerBlockHeight : 0);
        if (currentHeight + rowHeights[i] > budget && currentRows.length > 0) {
          pages.push({ rows: currentRows, isFirst: pages.length === 0 });
          currentRows = [];
          currentHeight = 0;
        }
        currentRows.push(row);
        currentHeight += rowHeights[i];
      });
      if (currentRows.length > 0) pages.push({ rows: currentRows, isFirst: pages.length === 0 });

      const theadHtml = `<thead><tr>${columns
        .map((c) => `<th style="border:1px solid #e4e7ec;background:#1a63f0;color:#fff;padding:8px 10px;font-size:13px;text-align:right;white-space:nowrap;">${c}</th>`)
        .join('')}</tr></thead>`;

      for (let p = 0; p < pages.length; p++) {
        const pageContainer = document.createElement('div');
        pageContainer.style.position = 'fixed';
        pageContainer.style.top = '0';
        pageContainer.style.left = '-99999px';
        pageContainer.style.direction = 'rtl';
        pageContainer.style.width = `${CONTAINER_WIDTH}px`;
        pageContainer.style.background = '#ffffff';
        pageContainer.style.padding = `${PAGE_MARGIN_PX}px`;
        pageContainer.style.fontFamily = "'Cairo', Tahoma, sans-serif";

        const headerHtml = pages[p].isFirst
          ? `<div style="margin-bottom:16px;"><h1 style="font-size:22px;font-weight:700;margin:0 0 4px 0;color:#101828;">${title}</h1><p style="font-size:12px;color:#667085;margin:0;">تاريخ الإصدار: ${dateStr}${pages.length > 1 ? ` — صفحة 1 من ${pages.length}` : ''}</p></div>`
          : `<p style="font-size:11px;color:#98a2b3;margin:0 0 8px 0;">${title} — صفحة ${p + 1} من ${pages.length}</p>`;

        const tbodyHtml = `<tbody>${pages[p].rows
          .map(
            (r: any, i: number) =>
              `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">${columns
                .map((c) => `<td style="border:1px solid #e4e7ec;padding:7px 10px;font-size:12px;color:#344054;">${String(r[c] ?? '')}</td>`)
                .join('')}</tr>`
          )
          .join('')}</tbody>`;

        pageContainer.innerHTML = `${headerHtml}<table style="width:100%;border-collapse:collapse;">${theadHtml}${tbodyHtml}</table>`;
        document.body.appendChild(pageContainer);
        cleanupNodes.push(pageContainer);

        const canvas = await html2canvas(pageContainer, { scale: CAPTURE_SCALE, backgroundColor: '#ffffff', useCORS: true });
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        // ضغط JPEG بجودة 0.92 بدل PNG غير المضغوط — يقلّل حجم الملف كثيرًا لجداول نصية
        // بدون فقدان وضوح ملحوظ، خصوصًا مع تعدد الصفحات في تقرير طويل.
        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        if (p > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      doc.save(`${title}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(`تم تصدير ملف PDF (${pages.length} صفحة)`);
    } catch (err: any) {
      toast.error('تعذر إنشاء الملف: ' + err.message);
    } finally {
      cleanupNodes.forEach((node) => node.parentNode && node.parentNode.removeChild(node));
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">التقارير</h1>
        <p className="text-sm text-gray-500">استخراج تقارير PDF أو Excel لكل قسم من أقسام النظام</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="card flex flex-col">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-gray-900">{r.title}</h3>
              <p className="mb-4 mt-1 flex-1 text-sm text-gray-500">{r.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => exportPdf(r.key, r.title)}
                  disabled={loadingKey === r.key + '-pdf'}
                  className="btn-secondary flex-1"
                >
                  {loadingKey === r.key + '-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  PDF
                </button>
                <button
                  onClick={() => exportExcel(r.key, r.title)}
                  disabled={loadingKey === r.key + '-excel'}
                  className="btn-secondary flex-1"
                >
                  {loadingKey === r.key + '-excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
