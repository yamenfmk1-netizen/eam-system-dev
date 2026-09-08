export type Row = Record<string, string | number>;
export type Work = { id: string; maintenance_number: string; building_id: string; department_id: string; maintenance_date: string; status: string; category: string; cost: number | string | null; work_description: string | null };
export type FaultRow = { id: string; fault_number: string; building_id: string; department_id: string; reported_at: string; status: string; priority: string; description: string };
export type TestRow = { id: string; test_number: string; building_id: string; department_id: string; test_date: string; result: string };
export type Option = { id: string; name: string };
export type ReportSection = { title: string; rows: Row[] };
export type ManagementReport = { generatedAt: string; start: string; end: string; scope: string; summary: Row[]; sections: ReportSection[]; notes: string[] };

export function riyadhDay(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
const inPeriod = (day: string, start: string, end: string) => day >= start && day <= end;
const workLabels: Record<string, string> = { pending: 'معلق', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى' };
const testLabels: Record<string, string> = { passed: 'ناجح', passed_with_observation: 'ناجح مع ملاحظات', failed: 'فاشل', not_completed: 'غير مكتمل' };
const faultLabels: Record<string, string> = { open: 'مفتوح', assigned: 'تم الإسناد', in_progress: 'قيد المعالجة', waiting_for_spare_parts: 'بانتظار قطع الغيار', resolved: 'تم الحل', closed: 'مغلق' };

export function buildManagementReport(input: {
  start: string; end: string; scope: string; works: Work[]; faults: FaultRow[]; tests: TestRow[];
  buildings: Option[]; departments: Option[]; now?: Date;
}): ManagementReport {
  const now = input.now ?? new Date();
  const today = riyadhDay(now);
  const periodWorks = input.works.filter(w => inPeriod(w.maintenance_date, input.start, input.end));
  const activeWorks = periodWorks.filter(w => w.status !== 'cancelled');
  const completed = activeWorks.filter(w => w.status === 'completed');
  const costs = completed.map(w => w.cost === null || w.cost === '' ? NaN : Number(w.cost)).filter(n => Number.isFinite(n) && n >= 0);
  const overdue = input.works.filter(w => ['pending', 'in_progress'].includes(w.status) && w.maintenance_date < today);
  const periodFaults = input.faults.filter(f => inPeriod(riyadhDay(new Date(f.reported_at)), input.start, input.end));
  const openFaults = input.faults.filter(f => !['closed', 'resolved'].includes(f.status));
  const critical = openFaults.filter(f => ['high', 'critical'].includes(f.priority));
  const waiting = openFaults.filter(f => f.status === 'waiting_for_spare_parts');
  const tests = input.tests.filter(t => inPeriod(t.test_date.slice(0, 10), input.start, input.end));
  const building = (id: string) => input.buildings.find(b => b.id === id)?.name ?? 'مبنى غير متاح';
  const department = (id: string) => input.departments.find(d => d.id === id)?.name ?? 'قسم غير متاح';
  const totalCost = Math.round(costs.reduce((sum, n) => sum + n, 0) * 100) / 100;
  const summary: Row[] = [
    { المؤشر: 'أعمال الصيانة خلال الفترة (دون الملغاة)', القيمة: activeWorks.length },
    { المؤشر: 'المكتمل من أعمال الفترة حتى إصدار التقرير', القيمة: completed.length },
    { المؤشر: 'نسبة إنجاز أعمال الفترة', القيمة: activeWorks.length ? `${Math.round(completed.length / activeWorks.length * 100)}%` : 'لا توجد أعمال' },
    { المؤشر: 'المتبقي من أعمال الفترة', القيمة: activeWorks.length - completed.length },
    { المؤشر: 'أعمال الفترة الملغاة', القيمة: periodWorks.length - activeWorks.length },
    { المؤشر: 'الاختبارات خلال الفترة', القيمة: tests.length },
    { المؤشر: 'الاختبارات الناجحة دون ملاحظات', القيمة: tests.filter(t => t.result === 'passed').length },
    { المؤشر: 'الاختبارات الفاشلة', القيمة: tests.filter(t => t.result === 'failed').length },
    { المؤشر: 'الأعطال المبلّغ عنها خلال الفترة', القيمة: periodFaults.length },
    { المؤشر: 'أوامر العمل المتأخرة حاليًا (كل الفترات)', القيمة: overdue.length },
    { المؤشر: 'الأعطال العالية والحرجة المفتوحة حاليًا', القيمة: critical.length },
    { المؤشر: 'تكلفة أعمال الفترة المكتملة والمسجلة (ر.س)', القيمة: totalCost },
    { المؤشر: 'أعمال مكتملة بلا تكلفة صالحة مسجلة', القيمة: completed.length - costs.length },
  ];
  const followups: Row[] = [];
  if (critical.length) followups.push({ الموضوع: 'أعطال عالية وحرجة مفتوحة', العدد: critical.length, 'المتابعة المقترحة': 'مراجعة الأثر والأولوية وتحديد المسؤول والموعد المستهدف للإصلاح.' });
  if (overdue.length) followups.push({ الموضوع: 'أوامر عمل متأخرة', العدد: overdue.length, 'المتابعة المقترحة': 'مراجعة أسباب التأخير وتحديد الموارد وخطة إكمال الأعمال.' });
  if (waiting.length) followups.push({ الموضوع: 'أعطال بانتظار قطع غيار', العدد: waiting.length, 'المتابعة المقترحة': 'التحقق من توفر القطع وحالة طلبات الشراء اللازمة.' });
  const failed = tests.filter(t => t.result === 'failed').length;
  if (failed) followups.push({ الموضوع: 'اختبارات فاشلة خلال الفترة', العدد: failed, 'المتابعة المقترحة': 'مراجعة النتائج وتحديد الإجراء التصحيحي وإعادة الاختبار.' });
  if (completed.length > costs.length) followups.push({ الموضوع: 'تكاليف غير مكتملة', العدد: completed.length - costs.length, 'المتابعة المقترحة': 'استكمال التكلفة أو تسجيل صفر إذا لم تترتب تكلفة على العمل.' });
  const workRows = (items: Work[]): Row[] => items.map(w => ({ 'رقم العمل': w.maintenance_number, القسم: department(w.department_id), المبنى: building(w.building_id), التاريخ: w.maintenance_date, الحالة: workLabels[w.status] ?? w.status, النوع: w.category === 'preventive' ? 'وقائية' : 'علاجية', الوصف: w.work_description ?? '—', 'التكلفة المسجلة (ر.س)': w.cost === null || w.cost === '' ? 'غير مسجلة' : Number(w.cost) }));
  const faultRows = (items: FaultRow[]): Row[] => items.map(f => ({ 'رقم العطل': f.fault_number, القسم: department(f.department_id), المبنى: building(f.building_id), 'تاريخ البلاغ': riyadhDay(new Date(f.reported_at)), الحالة: faultLabels[f.status] ?? f.status, الأولوية: ({ low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' } as Record<string, string>)[f.priority] ?? f.priority, الوصف: f.description }));
  return {
    generatedAt: now.toISOString(), start: input.start, end: input.end, scope: input.scope, summary,
    notes: [
      'تُختار أعمال الصيانة حسب تاريخ العمل، والاختبارات حسب تاريخ الاختبار، والأعطال حسب تاريخ البلاغ بتوقيت الرياض.',
      'حالات الإنجاز والأعطال هي الحالات الحالية عند إصدار التقرير؛ التقرير ليس لقطة تاريخية لنهاية الفترة.',
      'المتأخرات الحالية تشمل أوامر العمل المعلقة أو قيد التنفيذ التي سبق تاريخها اليوم، من كل الفترات. لا تشمل خطط الصيانة التي لم تُنشأ لها أوامر عمل.',
      'التكلفة مجموع الحقل المسجل للأعمال المكتملة ضمن الفترة، دون إضافة أسعار قطع الغيار مرة أخرى. العمل بلا تكلفة لا يُحسب كصفر.',
      'نقاط المتابعة مقترحات مبنية على البيانات، وليست قرارات معتمدة من الإدارة.',
    ],
    sections: [
      { title: 'نقاط المتابعة المقترحة', rows: followups },
      { title: 'أعمال الصيانة خلال الفترة', rows: workRows(periodWorks) },
      { title: 'أوامر العمل المتأخرة حاليًا', rows: workRows(overdue) },
      { title: 'الأعطال خلال الفترة', rows: faultRows(periodFaults) },
      { title: 'الأعطال العالية والحرجة المفتوحة', rows: faultRows(critical) },
      { title: 'أعطال بانتظار قطع الغيار', rows: faultRows(waiting) },
      { title: 'الاختبارات خلال الفترة', rows: tests.map(t => ({ 'رقم الاختبار': t.test_number, القسم: department(t.department_id), المبنى: building(t.building_id), التاريخ: t.test_date, النتيجة: testLabels[t.result] ?? t.result })) },
    ],
  };
}
