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
