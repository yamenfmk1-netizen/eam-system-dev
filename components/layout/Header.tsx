'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Bell,
  LogOut,
  User,
  Building2,
  Cpu,
  AlertTriangle,
  Package,
  Loader2,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import {
  DEPARTMENT_CODE,
  IS_MANAGEMENT_SITE,
} from '@/lib/site-config';
import { roleLabel } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/database.types';

interface SearchResult {
  type: 'building' | 'equipment' | 'fault' | 'spare_part';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const OPEN_FAULT_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_spare_parts',
];

export default function Header({
  fullName,
  role,
}: {
  fullName: string;
  role: UserRole;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  // بدل قسم واحد، نخزن كل الأقسام المسموحة للمستخدم
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);

  const [departmentNames, setDepartmentNames] = useState<
    Record<string, string>
  >({});

  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        boxRef.current &&
        !boxRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // تحديد الأقسام التي يستطيع المستخدم رؤيتها
  useEffect(() => {
    async function loadDepartments() {
      // موقع الإدارة:
      // نقرأ جميع الأقسام المسموحة للحساب
      if (IS_MANAGEMENT_SITE) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setDepartmentIds([]);
          return;
        }

        const { data: userDepartments } = await supabase
          .from('user_departments')
          .select('department_id')
          .eq('user_id', user.id);

        const ids = Array.from(
          new Set(
            (userDepartments ?? [])
              .map((item) => item.department_id)
              .filter(Boolean)
          )
        );

        setDepartmentIds(ids);

        if (ids.length === 0) {
          setDepartmentNames({});
          return;
        }

        const { data: departments } = await supabase
          .from('departments')
          .select('id,name')
          .in('id', ids);

        const names: Record<string, string> = {};

        (departments ?? []).forEach((department) => {
          names[department.id] = department.name;
        });

        setDepartmentNames(names);

        return;
      }

      // مواقع الأقسام العادية:
      // Electrical / HVAC / Mechanical / Civil
      const { data: department } = await supabase
        .from('departments')
        .select('id,name')
        .eq('code', DEPARTMENT_CODE)
        .single();

      if (!department) {
        setDepartmentIds([]);
        setDepartmentNames({});
        return;
      }

      setDepartmentIds([department.id]);

      setDepartmentNames({
        [department.id]: department.name,
      });
    }

    loadDepartments();
  }, []);

  // عدد الأعطال المفتوحة
  useEffect(() => {
    async function loadCount() {
      if (departmentIds.length === 0) {
        setNotifCount(0);
        return;
      }

      const { count } = await supabase
        .from('faults')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .in('department_id', departmentIds)
        .in('status', OPEN_FAULT_STATUSES);

      setNotifCount(count ?? 0);
    }

    loadCount();
  }, [departmentIds]);

  // البحث
  useEffect(() => {
    const q = query.trim();

    if (q.length < 2 || departmentIds.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);

      const [
        { data: buildings },
        { data: equipment },
        { data: faults },
        { data: spareParts },
      ] = await Promise.all([
        // المباني مشتركة
        supabase
          .from('buildings')
          .select('id,name,building_number')
          .is('deleted_at', null)
          .or(
            `name.ilike.%${q}%,building_number.ilike.%${q}%`
          )
          .limit(4),

        // المعدات من جميع الأقسام المسموحة
        supabase
          .from('equipment')
          .select(
            'id,name,asset_id,manufacturer,serial_number,department_id'
          )
          .in('department_id', departmentIds)
          .is('deleted_at', null)
          .or(
            `name.ilike.%${q}%,asset_id.ilike.%${q}%,manufacturer.ilike.%${q}%,serial_number.ilike.%${q}%`
          )
          .limit(6),

        // الأعطال من جميع الأقسام المسموحة
        supabase
          .from('faults')
          .select(
            'id,fault_number,description,department_id'
          )
          .in('department_id', departmentIds)
          .or(
            `fault_number.ilike.%${q}%,description.ilike.%${q}%`
          )
          .limit(6),

        // قطع الغيار من جميع الأقسام المسموحة
        supabase
          .from('spare_parts')
          .select(
            'id,part_name,part_number,department_id'
          )
          .in('department_id', departmentIds)
          .or(
            `part_name.ilike.%${q}%,part_number.ilike.%${q}%`
          )
          .limit(6),
      ]);

      const combined: SearchResult[] = [
        ...(buildings ?? []).map((b: any) => ({
          type: 'building' as const,
          id: b.id,
          title: b.name,
          subtitle: `مبنى رقم ${b.building_number}`,
          href: `/buildings/${b.id}`,
        })),

        ...(equipment ?? []).map((e: any) => ({
          type: 'equipment' as const,
          id: e.id,
          title: e.name,
          subtitle: [
            e.asset_id,
            e.manufacturer,
            departmentNames[e.department_id],
          ]
            .filter(Boolean)
            .join(' · '),
          href: `/equipment/${e.id}`,
        })),

        ...(faults ?? []).map((f: any) => ({
          type: 'fault' as const,
          id: f.id,
          title: f.fault_number,
          subtitle: [
            f.description,
            departmentNames[f.department_id],
          ]
            .filter(Boolean)
            .join(' · '),

          // مؤقتًا لا نرسل الإدارة إلى صفحة أعطال قسم واحد
          href: IS_MANAGEMENT_SITE
            ? '/management'
            : '/faults',
        })),

        ...(spareParts ?? []).map((p: any) => ({
          type: 'spare_part' as const,
          id: p.id,
          title: p.part_name,
          subtitle: [
            p.part_number,
            departmentNames[p.department_id],
          ]
            .filter(Boolean)
            .join(' · '),

          // مؤقتًا إلى أن نسوي صفحة إدارة للمخزون
          href: IS_MANAGEMENT_SITE
            ? '/management'
            : '/spare-parts',
        })),
      ];

      setResults(combined);
      setSearching(false);
      setOpen(true);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, departmentIds, departmentNames]);

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push('/login');
    router.refresh();
  }

  const icons = {
    building: Building2,
    equipment: Cpu,
    fault: AlertTriangle,
    spare_part: Package,
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:px-6">
      <div
        ref={boxRef}
        className="relative w-full max-w-sm"
      >
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() =>
            results.length > 0 && setOpen(true)
          }
          placeholder={
            IS_MANAGEMENT_SITE
              ? 'ابحث في جميع الأقسام...'
              : 'ابحث عن مبنى، معدة، رقم أصل، رقم تسلسلي...'
          }
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pe-9 ps-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />

        {searching && (
          <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}

        {open && query.trim().length >= 2 && (
          <div className="absolute z-40 mt-2 w-full rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
            {results.length === 0 && !searching ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">
                لا توجد نتائج مطابقة لـ &quot;
                {query}
                &quot;
              </p>
            ) : (
              results.map((r) => {
                const Icon = icons[r.type];

                return (
                  <Link
                    key={r.type + r.id}
                    href={r.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {r.title}
                      </p>

                      <p className="truncate text-xs text-gray-400">
                        {r.subtitle}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={
            IS_MANAGEMENT_SITE
              ? '/management'
              : '/notifications'
          }
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-50"
          title={
            IS_MANAGEMENT_SITE
              ? 'تنبيهات الإدارة'
              : 'التنبيهات'
          }
        >
          <Bell className="h-5 w-5" />

          {notifCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 border-r border-gray-200 pe-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <User className="h-4.5 w-4.5" />
          </div>

          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-medium text-gray-900">
              {fullName}
            </p>

            <p className="text-xs text-gray-400">
              {roleLabel(role)}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
          title="تسجيل الخروج"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
