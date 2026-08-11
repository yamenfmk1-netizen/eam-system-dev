'use client';

import { Languages } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/context';

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLanguage();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        title={lang === 'ar' ? 'English' : 'العربية'}
        aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
      >
        <Languages className="h-4 w-4" />
        <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium shadow-sm" aria-label="Language selector">
      <Languages className="mx-1 h-4 w-4 text-gray-400" />
      <button
        type="button"
        onClick={() => setLang('ar')}
        className={`rounded-md px-2 py-1.5 transition ${lang === 'ar' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        aria-pressed={lang === 'ar'}
      >
        العربية
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`rounded-md px-2 py-1.5 transition ${lang === 'en' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        aria-pressed={lang === 'en'}
      >
        English
      </button>
    </div>
  );
}
