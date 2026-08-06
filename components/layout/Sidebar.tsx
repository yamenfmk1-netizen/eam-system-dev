'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Cpu, ClipboardCheck, Wrench, AlertTriangle,
  Package, FileText, BarChart3, Bell, Users, Settings, History, Zap,
} from 'lucide-react';
import type { UserRole } from '@/types/database.types';

const navItems = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/buildings', label: 'المباني', icon: Building2, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/equipment', label: 'المعدات', icon: Cpu, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/tests', label: 'الاختبارات', icon: ClipboardCheck, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/maintenance', label: 'الصيانة', icon: Wrench, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/faults', label: 'الأعطال', icon: AlertTriangle, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/spare-parts', label: 'قطع الغيار', icon: Package, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/files', label: 'الملفات والمخططات', icon: FileText, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/reports', label: 'التقارير', icon: BarChart3, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/notifications', label: 'التنبيهات', icon: Bell, roles: ['admin', 'engineer', 'technician', 'viewer'] },
  { href: '/users', label: 'المستخدمون', icon: Users, roles: ['admin'] },
  { href: '/audit-log', label: 'سجل التعديلات', icon: History, roles: ['admin'] },
  { href: '/settings', label: 'الإعدادات', icon: Settings, roles: ['admin'] },
];

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-gray-200 bg-white lg:flex">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Zap className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-gray-900">إدارة الأصول الكهربائية</p>
          <p className="text-xs text-gray-400">نظام الصيانة والتشغيل</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
