'use client';

import { useEffect, useState, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/ui/StatusBadge';
import { Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  add: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  upload: 'رفع ملف',
  close_fault: 'إغلاق عطل',
  complete_maintenance: 'إكمال صيانة',
  complete_test: 'إكمال اختبار',
};

const TABLE_LABELS: Record<string, string> = {
  buildings: 'المباني',
  equipment: 'المعدات',
  tests: 'الاختبارات',
  maintenance_records: 'الصيانة',
  faults: 'الأعطال',
  spare_parts: 'قطع الغيار',
};

export default function AuditLogPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      setLogs(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch = (l.user_name ?? '').toLowerCase().includes(q) || (l.table_name ?? '').toLowerCase().includes(q);
    const matchesAction = actionFilter === 'all' || l.action === actionFilter;
    const matchesTable = tableFilter === 'all' || l.table_name === tableFilter;
    return matchesSearch && matchesAction && matchesTable;
  });

  const actionTone = (a: string) => (a === 'add' ? 'ready' : a === 'delete' ? 'fault' : 'watch');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">سجل التعديلات</h1>
        <p className="text-sm text-gray-500">سجل تلقائي لكل إضافة وتعديل وحذف يتم تنفيذه في النظام</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المستخدم أو الجدول..." className="input-field pe-9" />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input-field sm:w-44">
          <option value="all">جميع الإجراءات</option>
          {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="input-field sm:w-44">
          <option value="all">جميع الجداول</option>
          {Object.entries(TABLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            لا توجد سجلات بعد — تأكد من تنفيذ supabase/audit_triggers.sql على قاعدة البيانات
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">المستخدم</th>
                <th className="px-4 py-3">الإجراء</th>
                <th className="px-4 py-3">الجدول</th>
                <th className="px-4 py-3">التاريخ والوقت</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <Fragment key={l.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{l.user_name ?? 'نظام'}</td>
                    <td className="px-4 py-3"><StatusBadge label={ACTION_LABELS[l.action] ?? l.action} tone={actionTone(l.action)} /></td>
                    <td className="px-4 py-3 text-gray-500">{TABLE_LABELS[l.table_name] ?? l.table_name}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(l.created_at).toLocaleString('ar-SA')}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {expandedId === l.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </td>
                  </tr>
                  {expandedId === l.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {l.old_value && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">القيمة القديمة</p>
                              <pre className="max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] text-gray-600" dir="ltr">
                                {JSON.stringify(l.old_value, null, 2)}
                              </pre>
                            </div>
                          )}
                          {l.new_value && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">القيمة الجديدة</p>
                              <pre className="max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] text-gray-600" dir="ltr">
                                {JSON.stringify(l.new_value, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
