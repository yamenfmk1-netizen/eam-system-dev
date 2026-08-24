'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DEPARTMENT_CODE } from '@/lib/site-config';
import FaultForm from '@/components/faults/FaultForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Search, Loader2 } from 'lucide-react';
import { FAULT_STATUS_LABELS, FAULT_PRIORITY_LABELS } from '@/types/database.types';
import type { Building, Fault } from '@/types/database.types';

export default function FaultsPage() {
  const supabase = createClient();
  const [faults, setFaults] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingFault, setEditingFault] = useState<Fault | undefined>(undefined);
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (data) setCurrentUserRole(data.role);
    });
  }, []);

async function loadData() {
  setLoading(true);

  const { data: department } = await supabase
    .from('departments')
    .select('id')
    .eq('code', DEPARTMENT_CODE)
    .single();

  if (!department) {
    setFaults([]);
    setBuildings([]);
    setLoading(false);
    return;
  }

  const [{ data: f }, { data: b }] = await Promise.all([
    supabase
      .from('faults')
      .select('*, buildings(name), equipment(name, asset_id)')
      .eq('department_id', department.id)
      .order('reported_at', { ascending: false }),

    supabase
      .from('buildings')
      .select('*')
      .is('deleted_at', null)
      .order('building_number'),
  ]);

  setFaults(f ?? []);
  setBuildings(b ?? []);
  setLoading(false);
}

  useEffect(() => { loadData(); }, []);

  const filtered = faults.filter((f) => {
    const q = search.toLowerCase();
    const matchesSearch =
      f.fault_number.toLowerCase().includes(q) ||
      (f.buildings?.name ?? '').toLowerCase().includes(q) ||
      (f.equipment?.name ?? '').toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || f.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const statusTone = (s: string) =>
    s === 'closed' || s === 'resolved' ? 'ready' : s === 'open' ? 'fault' : 'watch';

  const priorityTone = (p: string) =>
    p === 'critical' ? 'fault' : p === 'high' ? 'watch' : 'info';

  function openEdit(fault: Fault) {
    setEditingFault(fault);
    setShowForm(true);
  }

  function openNew() {
    setEditingFault(undefined);
    setShowForm(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الأعطال</h1>
          <p className="text-sm text-gray-500">إدارة بلاغات الأعطال ومتابعة حلها</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> بلاغ عطل جديد</button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم العطل، المبنى، المعدة، الوصف..." className="input-field pe-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field sm:w-52">
          <option value="all">جميع الحالات</option>
          {Object.entries(FAULT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input-field sm:w-44">
          <option value="all">جميع الأولويات</option>
          {Object.entries(FAULT_PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد أعطال مطابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">رقم العطل</th>
                <th className="px-4 py-3">المبنى</th>
                <th className="px-4 py-3">المعدة</th>
                <th className="px-4 py-3">الوصف</th>
                <th className="px-4 py-3">الأولوية</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">تاريخ البلاغ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} onClick={() => openEdit(f)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800" dir="ltr">{f.fault_number}</td>
                  <td className="px-4 py-3 text-gray-500">{f.buildings?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{f.equipment?.name ?? '—'}</td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-gray-600">{f.description}</td>
                  <td className="px-4 py-3"><StatusBadge label={FAULT_PRIORITY_LABELS[f.priority as keyof typeof FAULT_PRIORITY_LABELS]} tone={priorityTone(f.priority)} /></td>
                  <td className="px-4 py-3"><StatusBadge label={FAULT_STATUS_LABELS[f.status as keyof typeof FAULT_STATUS_LABELS]} tone={statusTone(f.status)} /></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(f.reported_at).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <FaultForm
          fault={editingFault}
          buildings={buildings}
          currentUserRole={currentUserRole}
          onClose={() => setShowForm(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
