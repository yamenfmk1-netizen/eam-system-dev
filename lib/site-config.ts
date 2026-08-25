export type DepartmentCode =
  | 'electrical'
  | 'hvac'
  | 'mechanical'
  | 'civil';

export const DEPARTMENT_CODE =
  (process.env.NEXT_PUBLIC_DEPARTMENT_CODE || 'electrical') as DepartmentCode;

export const DEPARTMENT_NAMES: Record<
  DepartmentCode,
  { en: string; ar: string }
> = {
  electrical: {
    en: 'Electrical',
    ar: 'الكهرباء',
  },
  hvac: {
    en: 'HVAC',
    ar: 'التكييف',
  },
  mechanical: {
    en: 'Mechanical',
    ar: 'الميكانيكا',
  },
  civil: {
    en: 'Civil',
    ar: 'المدني',
  },
};

export const CURRENT_DEPARTMENT = DEPARTMENT_NAMES[DEPARTMENT_CODE];
export const DEPARTMENT_DASHBOARD_CONFIG = {
  electrical: {
    title: 'لوحة تحكم الكهرباء',
    subtitle: 'نظرة عامة على حالة الأصول والأنظمة الكهربائية',
    primaryType: 'generator',
    primaryLabel: 'المولدات',
    secondaryType: 'ups',
    secondaryLabel: 'أجهزة UPS',
    primaryReadinessLabel: 'جاهزية المولدات',
    secondaryReadinessLabel: 'جاهزية UPS',
  },

  hvac: {
    title: 'لوحة تحكم التكييف',
    subtitle: 'نظرة عامة على أنظمة ومعدات التكييف والتبريد',
    primaryType: 'chiller',
    primaryLabel: 'Chillers',
    secondaryType: 'ahu',
    secondaryLabel: 'AHU',
    primaryReadinessLabel: 'جاهزية Chillers',
    secondaryReadinessLabel: 'جاهزية AHU',
  },

  mechanical: {
    title: 'لوحة تحكم الميكانيكا',
    subtitle: 'نظرة عامة على الأنظمة والمعدات الميكانيكية',
    primaryType: 'pump',
    primaryLabel: 'المضخات',
    secondaryType: 'fire_pump',
    secondaryLabel: 'مضخات الحريق',
    primaryReadinessLabel: 'جاهزية المضخات',
    secondaryReadinessLabel: 'جاهزية مضخات الحريق',
  },

  civil: {
    title: 'لوحة تحكم الأعمال المدنية',
    subtitle: 'نظرة عامة على الأصول والأعمال المدنية',
    primaryType: 'door',
    primaryLabel: 'الأبواب',
    secondaryType: 'gate',
    secondaryLabel: 'البوابات',
    primaryReadinessLabel: 'جاهزية الأبواب',
    secondaryReadinessLabel: 'جاهزية البوابات',
  },
} as const;

export const CURRENT_DASHBOARD_CONFIG =
  DEPARTMENT_DASHBOARD_CONFIG[DEPARTMENT_CODE];
