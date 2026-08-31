from pathlib import Path

src = Path('/mnt/data/نص واحد ملصق (20260831-091047).txt')
text = src.read_text(encoding='utf-8')

text = text.replace(
"import { createClient } from '@/lib/supabase/client';\n",
"import { createClient } from '@/lib/supabase/client';\nimport { DEPARTMENT_CODE, IS_MANAGEMENT_SITE } from '@/lib/site-config';\n"
)

text = text.replace(
"""const EQUIPMENT_TYPE_LABELS_EN: Record<string, string> = {
  generator: 'Generator', ats: 'ATS', ups: 'UPS', transformer: 'Transformer',
  switchgear: 'Switchgear', rmu: 'RMU', main_distribution_board: 'Main DB',
  sub_main_distribution_board: 'Sub-main DB', synchronizing_panel: 'Sync panel',
  battery_bank: 'Battery bank', pdu: 'PDU', pdm: 'PDM', other: 'Other',
};
""",
"""const EQUIPMENT_TYPE_LABELS_EN: Record<string, string> = {
  generator: 'Generator', ats: 'ATS', ups: 'UPS', transformer: 'Transformer',
  switchgear: 'Switchgear', rmu: 'RMU', main_distribution_board: 'Main DB',
  sub_main_distribution_board: 'Sub-main DB', synchronizing_panel: 'Sync panel',
  battery_bank: 'Battery bank', pdu: 'PDU', pdm: 'PDM', other: 'Other',
};

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};
"""
)

text = text.replace(
"""  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
""",
"""  const [parts, setParts] = useState<SparePart[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [loading, setLoading] = useState(true);
"""
)

old_load = """  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('spare_parts').select('*').order('part_name');
    setParts((data ?? []) as SparePart[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => parts.filter((p) => {
"""
new_load = """  async function loadData() {
    setLoading(true);

    try {
      let partsQuery = supabase
        .from('spare_parts')
        .select('*')
        .order('part_name');

      // موقع الإدارة:
      // نعرض جميع قطع الغيار التي يسمح بها RLS،
      // ونحمّل فقط الإدارات المسموح للمستخدم بها لفلتر الإدارة.
      if (IS_MANAGEMENT_SITE) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setParts([]);
          setDepartments([]);
          return;
        }

        const {
          data: userDepartments,
          error: userDepartmentsError,
        } = await supabase
          .from('user_departments')
          .select('department_id')
          .eq('user_id', user.id);

        if (userDepartmentsError) {
          console.error(
            'Error loading user departments:',
            userDepartmentsError
          );
          setParts([]);
          setDepartments([]);
          return;
        }

        const departmentIds = Array.from(
          new Set(
            (userDepartments ?? [])
              .map((item) => item.department_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        if (departmentIds.length === 0) {
          setParts([]);
          setDepartments([]);
          return;
        }

        const {
          data: allowedDepartments,
          error: departmentsError,
        } = await supabase
          .from('departments')
          .select('id,name,code')
          .in('id', departmentIds)
          .order('name');

        if (departmentsError) {
          console.error(
            'Error loading departments:',
            departmentsError
          );
          setParts([]);
          setDepartments([]);
          return;
        }

        setDepartments(
          (allowedDepartments ?? []) as DepartmentOption[]
        );
      } else {
        // مواقع الأقسام العادية:
        // كل موقع يبقى مفلترًا على قسمه الحالي فقط.
        const {
          data: department,
          error: departmentError,
        } = await supabase
          .from('departments')
          .select('id')
          .eq('code', DEPARTMENT_CODE)
          .single();

        if (departmentError || !department) {
          console.error(
            'Department not found:',
            DEPARTMENT_CODE,
            departmentError
          );
          setParts([]);
          return;
        }

        partsQuery = partsQuery.eq(
          'department_id',
          department.id
        );
      }

      const { data, error } = await partsQuery;

      if (error) {
        console.error(
          'Error loading spare parts:',
          error
        );
        setParts([]);
        return;
      }

      setParts((data ?? []) as SparePart[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const departmentScopedParts = useMemo(
    () =>
      parts.filter(
        (p: any) =>
          !IS_MANAGEMENT_SITE ||
          departmentFilter === 'all' ||
          p.department_id === departmentFilter
      ),
    [parts, departmentFilter]
  );

  const filtered = useMemo(() => departmentScopedParts.filter((p) => {
"""
if old_load not in text:
    raise RuntimeError("loadData block not found")
text = text.replace(old_load, new_load)

text = text.replace(
"""  }), [parts, search, lowStockOnly, warrantyIssuesOnly]);
""",
"""  }), [departmentScopedParts, search, lowStockOnly, warrantyIssuesOnly]);
""",
1
)

text = text.replace(
"""  const lowStockCount = parts.filter((p) => p.quantity_available <= p.minimum_stock).length;
  const expiredCount = parts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expired').length;
  const expiringCount = parts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expiring_soon').length;
""",
"""  const lowStockCount = departmentScopedParts.filter((p) => p.quantity_available <= p.minimum_stock).length;
  const expiredCount = departmentScopedParts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expired').length;
  const expiringCount = departmentScopedParts.filter((p) => warrantyStatus(p.warranty_end_date) === 'expiring_soon').length;
"""
)

needle = """        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          {t('spare.lowStockOnly')}
        </label>
"""
replacement = """        {IS_MANAGEMENT_SITE && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="input-field sm:w-48"
          >
            <option value="all">
              {lang === 'ar' ? 'جميع الإدارات' : 'All departments'}
            </option>

            {departments.map((department) => (
              <option
                key={department.id}
                value={department.id}
              >
                {department.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          {t('spare.lowStockOnly')}
        </label>
"""
if needle not in text:
    raise RuntimeError("filter insertion point not found")
text = text.replace(needle, replacement, 1)

out = Path('/mnt/data/spare-parts-page-management-filter.tsx')
out.write_text(text, encoding='utf-8')

print(f"Created: {out}")
print(f"Lines: {len(text.splitlines())}")
print("Key checks:",
      "IS_MANAGEMENT_SITE" in text,
      "departmentFilter" in text,
      ".eq('department_id'," in text)
