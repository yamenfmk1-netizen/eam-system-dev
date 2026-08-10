'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Cable,
  Gauge,
  Loader2,
  Network,
  Search,
  Zap,
  ExternalLink,
} from 'lucide-react';

type FeederLoad = {
  id: string;
  feeder_code: string | null;
  feeder_equipment_id: string | null;
  feeder_asset_id: string | null;
  loop_code: string;
  substation_code: string;
  substation_kind: string;
  capacity_kva: number | null;
  load_description: string;
  building_numbers: string | null;
};

function kindLabel(kind: string) {
  return kind === 'substation' ? 'محطة توزيع' : 'محول';
}

export default function MvNetworkPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<FeederLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFeeder, setSelectedFeeder] = useState('all');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'substation' | 'transformer'>('all');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('v_mv_feeder_loads')
        .select('*')
        .order('feeder_code', { ascending: true })
        .order('substation_code', { ascending: true });

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows((data as FeederLoad[]) ?? []);
      }
      setLoading(false);
    }

    loadData();
  }, []);

  const feeders = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => r.feeder_code).filter((v): v is string => Boolean(v)))
    ).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let data = rows.filter((r) => {
      const feederMatch = selectedFeeder === 'all' || r.feeder_code === selectedFeeder;
      const kindMatch = kind === 'all' || r.substation_kind === kind;
      const searchMatch = !q ||
        r.load_description.toLowerCase().includes(q) ||
        r.substation_code.toLowerCase().includes(q) ||
        (r.building_numbers ?? '').toLowerCase().includes(q) ||
        r.loop_code.toLowerCase().includes(q);
      return feederMatch && kindMatch && searchMatch;
    });

    // عند عرض جميع المغذيات يظهر كل حمل مرتين في الـ View (A و B)،
    // لذلك نعرضه مرة واحدة فقط ونستخدم loop_code للدلالة على الزوج.
    if (selectedFeeder === 'all') {
      const seen = new Set<string>();
      data = data.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }

    return data;
  }, [rows, search, selectedFeeder, kind]);

  const stats = useMemo(() => {
    const substations = new Map<string, number>();
    for (const row of filtered) {
      const key = `${row.loop_code}|${row.substation_code}`;
      if (!substations.has(key)) substations.set(key, Number(row.capacity_kva ?? 0));
    }
    const totalCapacity = Array.from(substations.values()).reduce((sum, v) => sum + v, 0);
    return {
      loads: filtered.length,
      substations: substations.size,
      capacity: totalCapacity,
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary-700">
            <Network className="h-5 w-5" />
            <span className="text-sm font-semibold">MV Distribution Network</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">خريطة مغذيات الجهد المتوسط</h1>
          <p className="mt-1 text-sm text-gray-500">
            تتبع المغذي ← المحطة/المحول ← الأحمال والمباني المتأثرة.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          القدرة المعروضة هي قدرة المحطة/المحول وليست قياس الحمل اللحظي.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">الأحمال المعروضة</p>
            <p className="text-xl font-bold text-gray-900">{stats.loads}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">المحطات / المحولات</p>
            <p className="text-xl font-bold text-gray-900">{stats.substations}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">إجمالي القدرات الاسمية</p>
            <p className="text-xl font-bold text-gray-900">{stats.capacity.toLocaleString()} kVA</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid gap-3 lg:grid-cols-[220px_220px_1fr]">
          <select
            className="input-field"
            value={selectedFeeder}
            onChange={(e) => setSelectedFeeder(e.target.value)}
          >
            <option value="all">جميع المغذيات</option>
            {feeders.map((feeder) => (
              <option key={feeder} value={feeder}>{feeder}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">كل المحطات والمحولات</option>
            <option value="substation">محطات التوزيع</option>
            <option value="transformer">المحولات</option>
          </select>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pe-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالمبنى، الحمل، المحول أو المحطة..."
            />
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="font-medium text-red-600">تعذر تحميل بيانات شبكة MV</p>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <p className="mt-3 text-xs text-gray-400">
              تأكد من تنفيذ ملف mv_feeder_loads_import.sql في Supabase ومن وجود View باسم v_mv_feeder_loads.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">لا توجد بيانات مطابقة للفلاتر الحالية</div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500">
                <th className="px-4 py-3">المغذي / الحلقة</th>
                <th className="px-4 py-3">المحطة / المحول</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">القدرة</th>
                <th className="px-4 py-3">الحمل المغذى</th>
                <th className="px-4 py-3">المباني</th>
                <th className="px-4 py-3">الأصل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={`${row.id}-${selectedFeeder === 'all' ? 'loop' : row.feeder_code}`} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-primary-50 px-2.5 py-1 font-semibold text-primary-700">
                      {selectedFeeder === 'all' ? row.loop_code : row.feeder_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{row.substation_code}</td>
                  <td className="px-4 py-3 text-gray-500">{kindLabel(row.substation_kind)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.capacity_kva ? `${Number(row.capacity_kva).toLocaleString()} kVA` : '—'}
                  </td>
                  <td className="max-w-xl px-4 py-3 text-gray-700">{row.load_description}</td>
                  <td className="px-4 py-3 text-gray-500">{row.building_numbers || '—'}</td>
                  <td className="px-4 py-3">
                    {row.feeder_equipment_id && selectedFeeder !== 'all' ? (
                      <Link
                        href={`/equipment/${row.feeder_equipment_id}`}
                        className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                      >
                        {row.feeder_asset_id ?? 'فتح الأصل'}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="text-gray-400">{selectedFeeder === 'all' ? 'اختر مغذيًا' : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
