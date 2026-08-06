import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const testTypes = [
  'generator_operational_test', 'actual_power_interruption_test', 'ats_transfer_test',
  'ups_battery_test', 'ups_bypass_test', 'transformer_inspection', 'switchgear_test',
  'rmu_inspection', 'battery_test', 'custom_test',
] as const;

const testResults = ['passed', 'passed_with_observation', 'failed', 'not_completed'] as const;

const rowSchema = z.object({
  test_number: z.string().trim().min(1).max(100),
  test_type: z.enum(testTypes),
  building_number: z.string().trim().min(1).max(100),
  asset_id: z.string().trim().max(150).optional().default(''),
  test_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().trim().optional().default(''),
  end_time: z.string().trim().optional().default(''),
  interruption_duration_minutes: z.union([z.string(), z.number()]).optional().default(''),
  responsible_person: z.string().trim().max(200).optional().default(''),
  equipment_started_successfully: z.union([z.string(), z.boolean()]).optional().default(''),
  ats_worked: z.union([z.string(), z.boolean()]).optional().default(''),
  load_transferred: z.union([z.string(), z.boolean()]).optional().default(''),
  power_restored_normally: z.union([z.string(), z.boolean()]).optional().default(''),
  result: z.enum(testResults),
  notes: z.string().trim().max(10000).optional().default(''),
  recommendations: z.string().trim().max(10000).optional().default(''),
  next_test_date: z.string().trim().optional().default(''),
});

const requestSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(1000),
  duplicateMode: z.enum(['skip', 'update']).default('skip'),
});

function parseBoolean(value: string | boolean): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'y', 'نعم', 'صح', 'ناجح'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'لا', 'خطأ', 'فاشل'].includes(normalized)) return false;
  return null;
}

function parseOptionalDate(value: string): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseOptionalTime(value: string): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!profile?.is_active || !['admin', 'engineer'].includes(profile.role)) {
    return NextResponse.json({ error: 'الاستيراد الجماعي متاح لمدير النظام والمهندس فقط' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestResult = requestSchema.safeParse(body);
  if (!requestResult.success) {
    return NextResponse.json({ error: requestResult.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 });
  }

  const parsedRows: Array<{ sourceRow: number; data: z.infer<typeof rowSchema> }> = [];
  const errors: Array<{ row: number; test_number?: string; message: string }> = [];

  requestResult.data.rows.forEach((raw, index) => {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: index + 2, test_number: typeof raw === 'object' && raw && 'test_number' in raw ? String((raw as any).test_number ?? '') : '', message: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' });
      return;
    }
    parsedRows.push({ sourceRow: index + 2, data: parsed.data });
  });

  if (!parsedRows.length) {
    return NextResponse.json({ success: true, imported: 0, updated: 0, skipped: 0, failed: errors.length, errors });
  }

  const buildingNumbers = [...new Set(parsedRows.map(({ data }) => data.building_number))];
  const assetIds = [...new Set(parsedRows.map(({ data }) => data.asset_id).filter(Boolean))];
  const testNumbers = [...new Set(parsedRows.map(({ data }) => data.test_number))];

  const [{ data: buildings, error: buildingsError }, { data: equipment, error: equipmentError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('buildings').select('id, building_number').in('building_number', buildingNumbers).is('deleted_at', null),
    assetIds.length ? supabase.from('equipment').select('id, asset_id, building_id').in('asset_id', assetIds).is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
    supabase.from('tests').select('id, test_number').in('test_number', testNumbers),
  ]);

  if (buildingsError || equipmentError || existingError) {
    console.error('tests import lookup error', buildingsError ?? equipmentError ?? existingError);
    return NextResponse.json({ error: 'تعذر التحقق من بيانات المباني والمعدات' }, { status: 500 });
  }

  const buildingMap = new Map((buildings ?? []).map((building) => [building.building_number, building.id]));
  const equipmentMap = new Map((equipment ?? []).map((item) => [item.asset_id, item]));
  const existingMap = new Map((existing ?? []).map((item) => [item.test_number, item.id]));
  const seenInFile = new Set<string>();

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const { sourceRow, data } of parsedRows) {
    if (seenInFile.has(data.test_number)) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: 'رقم الاختبار مكرر داخل الملف نفسه' });
      continue;
    }
    seenInFile.add(data.test_number);

    const buildingId = buildingMap.get(data.building_number);
    if (!buildingId) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: `المبنى رقم ${data.building_number} غير موجود` });
      continue;
    }

    let equipmentId: string | null = null;
    if (data.asset_id) {
      const item = equipmentMap.get(data.asset_id);
      if (!item) {
        errors.push({ row: sourceRow, test_number: data.test_number, message: `رقم الأصل ${data.asset_id} غير موجود` });
        continue;
      }
      if (item.building_id !== buildingId) {
        errors.push({ row: sourceRow, test_number: data.test_number, message: `الأصل ${data.asset_id} غير مرتبط بالمبنى ${data.building_number}` });
        continue;
      }
      equipmentId = item.id;
    }

    const startTime = parseOptionalTime(data.start_time);
    const endTime = parseOptionalTime(data.end_time);
    if (data.start_time && !startTime) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: 'وقت البداية غير صالح؛ استخدم HH:MM' });
      continue;
    }
    if (data.end_time && !endTime) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: 'وقت النهاية غير صالح؛ استخدم HH:MM' });
      continue;
    }
    if (data.next_test_date && !parseOptionalDate(data.next_test_date)) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: 'تاريخ الاختبار القادم غير صالح؛ استخدم YYYY-MM-DD' });
      continue;
    }

    const durationText = String(data.interruption_duration_minutes ?? '').trim();
    const duration = durationText ? Number(durationText) : null;
    if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: 'مدة الانقطاع يجب أن تكون رقمًا موجبًا' });
      continue;
    }

    const payload = {
      test_number: data.test_number,
      test_type: data.test_type,
      building_id: buildingId,
      equipment_id: equipmentId,
      test_date: data.test_date,
      start_time: startTime,
      end_time: endTime,
      interruption_duration_minutes: duration,
      responsible_person: data.responsible_person || null,
      equipment_started_successfully: parseBoolean(data.equipment_started_successfully),
      ats_worked: parseBoolean(data.ats_worked),
      load_transferred: parseBoolean(data.load_transferred),
      power_restored_normally: parseBoolean(data.power_restored_normally),
      result: data.result,
      notes: data.notes || null,
      recommendations: data.recommendations || null,
      next_test_date: parseOptionalDate(data.next_test_date),
      created_by: user.id,
    };

    const existingId = existingMap.get(data.test_number);
    if (existingId && requestResult.data.duplicateMode === 'skip') {
      skipped += 1;
      continue;
    }

    const operation = existingId
      ? supabase.from('tests').update(payload).eq('id', existingId)
      : supabase.from('tests').insert(payload);
    const { error } = await operation;
    if (error) {
      errors.push({ row: sourceRow, test_number: data.test_number, message: error.message });
      continue;
    }
    if (existingId) updated += 1;
    else imported += 1;
  }

  return NextResponse.json({
    success: true,
    imported,
    updated,
    skipped,
    failed: errors.length,
    errors,
  });
}
