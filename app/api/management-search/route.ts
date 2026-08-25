import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // الأقسام المسموحة للحساب
  const { data: userDepartments, error: departmentsError } =
    await supabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', user.id);

  if (departmentsError) {
    return NextResponse.json(
      { error: departmentsError.message },
      { status: 500 }
    );
  }

  const departmentIds = Array.from(
    new Set(
      (userDepartments ?? [])
        .map((item) => item.department_id)
        .filter(Boolean)
    )
  );

  if (departmentIds.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const { data: departments } = await supabase
    .from('departments')
    .select('id,name')
    .in('id', departmentIds);

  const departmentNames: Record<string, string> = {};

  (departments ?? []).forEach((department) => {
    departmentNames[department.id] = department.name;
  });

  // البحث في كل قسم بشكل مستقل
  const departmentResults = await Promise.all(
    departmentIds.map(async (departmentId) => {
      const [
        { data: equipment },
        { data: faults },
        { data: spareParts },
      ] = await Promise.all([
        supabase
          .from('equipment')
          .select(
            'id,name,asset_id,manufacturer,serial_number,department_id'
          )
          .eq('department_id', departmentId)
          .is('deleted_at', null)
          .or(
            `name.ilike.%${q}%,asset_id.ilike.%${q}%,manufacturer.ilike.%${q}%,serial_number.ilike.%${q}%`
          )
          .limit(10),

        supabase
          .from('faults')
          .select(
            'id,fault_number,description,department_id'
          )
          .eq('department_id', departmentId)
          .or(
            `fault_number.ilike.%${q}%,description.ilike.%${q}%`
          )
          .limit(5),

        supabase
          .from('spare_parts')
          .select(
            'id,part_name,part_number,department_id'
          )
          .eq('department_id', departmentId)
          .or(
            `part_name.ilike.%${q}%,part_number.ilike.%${q}%`
          )
          .limit(5),
      ]);

      return {
        equipment: equipment ?? [],
        faults: faults ?? [],
        spareParts: spareParts ?? [],
      };
    })
  );

  const allEquipment = departmentResults.flatMap(
    (item) => item.equipment
  );

  const allFaults = departmentResults.flatMap(
    (item) => item.faults
  );

  const allSpareParts = departmentResults.flatMap(
    (item) => item.spareParts
  );

  const { data: buildings } = await supabase
    .from('buildings')
    .select('id,name,building_number')
    .is('deleted_at', null)
    .or(
      `name.ilike.%${q}%,building_number.ilike.%${q}%`
    )
    .limit(5);

  const results = [
    ...(buildings ?? []).map((b) => ({
      type: 'building',
      id: b.id,
      title: b.name,
      subtitle: `مبنى رقم ${b.building_number}`,
      href: `/buildings/${b.id}`,
    })),

    ...allEquipment.map((e) => ({
      type: 'equipment',
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

    ...allFaults.map((f) => ({
      type: 'fault',
      id: f.id,
      title: f.fault_number,
      subtitle: [
        f.description,
        departmentNames[f.department_id],
      ]
        .filter(Boolean)
        .join(' · '),
      href: '/management',
    })),

    ...allSpareParts.map((p) => ({
      type: 'spare_part',
      id: p.id,
      title: p.part_name,
      subtitle: [
        p.part_number,
        departmentNames[p.department_id],
      ]
        .filter(Boolean)
        .join(' · '),
      href: '/management',
    })),
  ];

  return NextResponse.json({ results });
}
