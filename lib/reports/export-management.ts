import type { ManagementReport, ReportSection, Row } from './management';

function sections(report: ManagementReport, decisions: string): ReportSection[] {
  return [
    { title: 'ملخص الإدارة', rows: report.summary },
    { title: 'القرارات المطلوبة من الإدارة', rows: [{ البيان: decisions.trim() || 'لم تُضف قرارات مطلوبة.' }] },
    ...report.sections,
    { title: 'أساس احتساب التقرير', rows: report.notes.map(note => ({ البيان: note })) },
  ];
}
const fileName = (r: ManagementReport) => `التقرير-الإداري-${r.start}-${r.end}`;

export async function exportManagementExcel(report: ManagementReport, decisions: string) {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  sections(report, decisions).forEach((section, index) => {
    const rows: Row[] = section.rows.length ? section.rows : [{ البيان: 'لا توجد سجلات مطابقة.' }];
    const headers = Object.keys(rows[0]);
    const sheet = XLSX.utils.aoa_to_sheet([
      [section.title], ['الفترة', report.start, report.end], ['النطاق', report.scope],
      ['تاريخ الإصدار', new Date(report.generatedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })], [], headers,
      ...rows.map(row => headers.map(key => row[key] ?? '')),
    ]);
    sheet['!cols'] = headers.map(key => ({ wch: /الوصف|البيان|المتابعة|المؤشر/.test(key) ? 65 : 26 }));
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 5, c: 0 }, { r: 5 + rows.length, c: headers.length - 1 }) };
    XLSX.utils.book_append_sheet(book, sheet, `${index + 1} ${section.title}`.slice(0, 31));
  });
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(book, `${fileName(report)}.xlsx`);
}

export async function exportManagementPdf(report: ManagementReport, decisions: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  await document.fonts.ready;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const host = document.createElement('div');
  host.dir = 'rtl';
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;background:white;color:#172033;font-family:Cairo,Tahoma,sans-serif;';
  document.body.appendChild(host);
  let pageNumber = 0;
  const maxHeight = 1400 * height / width;
  const element = (tag: string, text: string, css = '') => {
    const node = document.createElement(tag); node.textContent = text; node.style.cssText = css; return node;
  };
  let page: HTMLDivElement;
  let body: HTMLTableSectionElement;
  const startPage = (title: string, columns: string[]) => {
    host.replaceChildren();
    page = document.createElement('div');
    page.style.cssText = 'padding:30px;box-sizing:border-box;background:#fff;';
    page.appendChild(element('h1', 'التقرير الإداري', 'font-size:26px;margin:0 0 8px;color:#17469b;'));
    page.appendChild(element('p', `${report.start} — ${report.end} | ${report.scope}`, 'font-size:16px;margin:0 0 6px;'));
    page.appendChild(element('p', `إصدار: ${new Date(report.generatedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })} | صفحة ${pageNumber + 1}`, 'font-size:14px;margin:0 0 12px;color:#536176;'));
    page.appendChild(element('h2', title, 'font-size:20px;margin:0 0 12px;'));
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;';
    const head = table.createTHead().insertRow();
    columns.forEach(column => head.appendChild(element('th', column, 'padding:10px;border:1px solid #cdd7e5;background:#17469b;color:white;text-align:right;font-size:15px;overflow-wrap:anywhere;')));
    body = table.createTBody();
    page.appendChild(table); host.appendChild(page);
  };
  const capture = async () => {
    const canvas = await html2canvas(page, { scale: 1.5, backgroundColor: '#ffffff' });
    if (pageNumber++) pdf.addPage();
    // Very long single rows fit on a page without cropping any content.
    const ratio = Math.min(width / canvas.width, height / canvas.height);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width * ratio, canvas.height * ratio);
  };
  try {
    for (const section of sections(report, decisions)) {
      const rows: Row[] = section.rows.length ? section.rows : [{ البيان: 'لا توجد سجلات مطابقة.' }];
      const columns = Object.keys(rows[0]);
      startPage(section.title, columns);
      for (const row of rows) {
        const tr = document.createElement('tr');
        columns.forEach(key => tr.appendChild(element('td', String(row[key] ?? ''), 'padding:10px;border:1px solid #cdd7e5;font-size:15px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;')));
        body!.appendChild(tr);
        if (page!.getBoundingClientRect().height > maxHeight && body!.rows.length > 1) {
          tr.remove(); await capture(); startPage(section.title, columns); body!.appendChild(tr);
        }
      }
      await capture();
    }
    pdf.save(`${fileName(report)}.pdf`);
  } finally { host.remove(); }
}
