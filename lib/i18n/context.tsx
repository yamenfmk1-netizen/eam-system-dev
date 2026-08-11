'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionary, LANGUAGES, type Language, type TranslationKey } from './dictionary';

const STORAGE_KEY = 'eam.lang';

interface LanguageContextValue {
  lang: Language;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
  /** تنسيق تاريخ حسب اللغة الحالية — يقبل 'YYYY-MM-DD' أو ISO أو null */
  formatDate: (value: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function LanguageProvider({
  children,
  initialLang = 'ar',
}: {
  children: React.ReactNode;
  initialLang?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  // قراءة اللغة المحفوظة بعد أول رسم (تفاديًا لاختلاف الخادم عن العميل في SSR)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored) && stored !== lang) setLangState(stored);
    } catch {
      /* التخزين المحلي معطّل — نبقى على اللغة الافتراضية */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مزامنة سمتي lang و dir على عنصر <html> حتى يعمل RTL/LTR في كل الصفحات
  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
      // كوكي ليتمكن الخادم لاحقًا من الرسم باللغة الصحيحة مباشرة إن لزم
      document.cookie = `${STORAGE_KEY}=${lang};path=/;max-age=31536000;samesite=lax`;
    } catch {
      /* تجاهل */
    }
  }, [lang]);

  const setLang = useCallback((next: Language) => setLangState(next), []);
  const toggleLang = useCallback(() => setLangState((c) => (c === 'ar' ? 'en' : 'ar')), []);

  const t = useCallback(
    (key: TranslationKey) => dictionary[lang][key] ?? dictionary.ar[key] ?? String(key),
    [lang]
  );

  const formatDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '—';
      const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
      if (Number.isNaN(date.getTime())) return String(value);
      // التقويم الميلادي في اللغتين حتى تتطابق التواريخ مع تقارير العقود والمقاولين
      return date.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB');
    },
    [lang]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggleLang, t, formatDate }),
    [lang, setLang, toggleLang, t, formatDate]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage يجب أن يُستخدم داخل <LanguageProvider>');
  return ctx;
}

/** ترجمة قيم قاعدة البيانات (enum) دون الحاجة لمفتاح لكل قيمة في كل صفحة */
export function localizedLabel(
  lang: Language,
  ar: string | undefined,
  en: string | undefined,
  fallback = '—'
) {
  return (lang === 'ar' ? ar : en) ?? ar ?? en ?? fallback;
}
