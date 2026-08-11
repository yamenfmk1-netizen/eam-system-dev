'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionary, LANGUAGES, type Language, type TranslationKey } from './dictionary';
import { translateUiText } from './auto-translations';

const STORAGE_KEY = 'eam.lang';

interface LanguageContextValue {
  lang: Language;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
  formatDate: (value: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

type TextState = { source: string; applied: string };
type AttrState = Record<string, { source: string; applied: string }>;

const textState = new WeakMap<Text, TextState>();
const attrState = new WeakMap<Element, AttrState>();
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const hasArabic = (value: string) => /[\u0600-\u06FF]/.test(value);

function processTextNode(node: Text, lang: Language) {
  const current = node.nodeValue ?? '';
  if (!current.trim()) return;

  const state = textState.get(node);

  if (lang === 'ar') {
    if (state && current === state.applied && state.source !== current) {
      node.nodeValue = state.source;
      state.applied = state.source;
    } else if (!state || current !== state.applied) {
      if (hasArabic(current)) textState.set(node, { source: current, applied: current });
    }
    return;
  }

  // React may update the same text node later. If it changed to new Arabic text, refresh the source.
  if (state && current !== state.applied) {
    if (hasArabic(current)) {
      state.source = current;
      state.applied = current;
    } else {
      // This node is already translated natively via t(); do not override it with stale source text.
      state.applied = current;
      return;
    }
  }

  const active = textState.get(node) ?? { source: current, applied: current };
  if (!textState.has(node)) textState.set(node, active);
  if (!hasArabic(active.source) && !/[٠-٩]/.test(active.source)) return;

  const translated = translateUiText(active.source);
  if (translated !== current) {
    node.nodeValue = translated;
    active.applied = translated;
  }
}

function processElementAttributes(el: Element, lang: Language) {
  let states = attrState.get(el);
  if (!states) {
    states = {};
    attrState.set(el, states);
  }

  for (const attr of TRANSLATABLE_ATTRS) {
    const current = el.getAttribute(attr);
    if (!current) continue;
    const state = states[attr];

    if (lang === 'ar') {
      if (state && current === state.applied && state.source !== current) {
        el.setAttribute(attr, state.source);
        state.applied = state.source;
      } else if ((!state || current !== state.applied) && hasArabic(current)) {
        states[attr] = { source: current, applied: current };
      }
      continue;
    }

    if (state && current !== state.applied) {
      if (hasArabic(current)) {
        state.source = current;
        state.applied = current;
      } else {
        state.applied = current;
        continue;
      }
    }

    const active = states[attr] ?? { source: current, applied: current };
    if (!states[attr]) states[attr] = active;
    if (!hasArabic(active.source) && !/[٠-٩]/.test(active.source)) continue;

    const translated = translateUiText(active.source);
    if (translated !== current) {
      el.setAttribute(attr, translated);
      active.applied = translated;
    }
  }
}

function translateTree(root: Node, lang: Language) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root as Text, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

  if (root.nodeType === Node.ELEMENT_NODE) processElementAttributes(root as Element, lang);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) processTextNode(current as Text, lang);
    else if (current.nodeType === Node.ELEMENT_NODE) processElementAttributes(current as Element, lang);
    current = walker.nextNode();
  }
}

export function LanguageProvider({
  children,
  initialLang = 'ar',
}: {
  children: React.ReactNode;
  initialLang?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored) && stored !== lang) setLangState(stored);
    } catch {
      // Keep the default language when storage is unavailable.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
      document.cookie = `${STORAGE_KEY}=${lang};path=/;max-age=31536000;samesite=lax`;
    } catch {
      // Ignore storage failures.
    }
  }, [lang]);

  // Covers legacy pages that still contain direct Arabic UI strings.
  // New/edited components should continue using t() normally.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    translateTree(document.body, lang);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          processTextNode(mutation.target as Text, lang);
          continue;
        }
        if (mutation.type === 'attributes') {
          processElementAttributes(mutation.target as Element, lang);
          continue;
        }
        mutation.addedNodes.forEach((node) => translateTree(node, lang));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    });

    return () => observer.disconnect();
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
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}

export function localizedLabel(
  lang: Language,
  ar: string | undefined,
  en: string | undefined,
  fallback = '—'
) {
  return (lang === 'ar' ? ar : en) ?? ar ?? en ?? fallback;
}
