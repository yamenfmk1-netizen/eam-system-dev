-- =========================================================================
-- FULL SETUP — نظام إدارة الأصول الكهربائية والصيانة
-- ملف واحد شامل لإعداد قاعدة البيانات بالكامل من الصفر (نشر جديد فقط).
--
-- ⚠️ إذا كانت لديك قاعدة بيانات حية بالفعل، لا تُعِد تشغيل هذا الملف — استخدم
-- بدلًا منه patch_2026_review_fixes.sql الذي يحتوي فقط الإصلاحات الجديدة
-- ويُطبَّق بأمان على قاعدة تعمل حاليًا دون التأثير على بياناتها.
--
-- الترتيب الداخلي لهذا الملف (لا تُغيّره):
--   1. schema.sql             — Enums + الجداول + العلاقات + Triggers الأساسية
--   2. rls_policies.sql       — تفعيل RLS + سياسات كل جدول (آمنة من الأصل الآن)
--                                + Storage Buckets الأولية
--   3. audit_triggers.sql     — سجل التعديلات التلقائي (Audit Log)
--   4. security_hardening.sql — تشديد إضافي: Storage خاص، Soft Delete، حماية
--                                آخر admin نشط، منع الفني من إعادة إسناد الأعطال
--   5. seed.sql (اختياري)     — بيانات تجريبية للمباني والمعدات وأمثلة الاختبارات
--
-- ⚠️ حساب المدير: لا يمكن إنشاؤه عبر SQL مباشرة — راجع DEPLOYMENT_GUIDE.md
-- =========================================================================


-- #########################################################################
-- # 1) SCHEMA — الجداول والعلاقات والـ Enums
-- #########################################################################

-- =========================================================
-- نظام إدارة الأصول الكهربائية والصيانة - سكيما قاعدة البيانات
-- شغّل هذا الملف في Supabase SQL Editor (مرة واحدة، بالترتيب)
-- =========================================================

-- تفعيل الإضافات المطلوبة
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------
create type user_role as enum ('admin', 'engineer', 'technician', 'viewer');

create type building_status as enum ('ready', 'watch', 'fault', 'unknown');

create type equipment_type as enum (
  'generator', 'ats', 'ups', 'transformer', 'switchgear', 'rmu',
  'main_distribution_board', 'sub_main_distribution_board',
  'synchronizing_panel', 'battery_bank', 'pdu', 'pdm', 'other'
);

create type equipment_status as enum (
  'available', 'running', 'standby', 'under_maintenance', 'fault', 'out_of_service'
);

create type criticality_level as enum ('low', 'medium', 'high', 'critical');

create type ups_mode as enum ('online', 'battery', 'bypass', 'maintenance_bypass', 'off', 'fault');

create type test_type as enum (
  'generator_operational_test', 'actual_power_interruption_test', 'ats_transfer_test',
  'ups_battery_test', 'ups_bypass_test', 'transformer_inspection', 'switchgear_test',
  'rmu_inspection', 'battery_test', 'custom_test'
);

create type test_result as enum ('passed', 'passed_with_observation', 'failed', 'not_completed');

create type maintenance_category as enum ('preventive', 'corrective');

create type fault_priority as enum ('low', 'medium', 'high', 'critical');

create type fault_status as enum (
  'open', 'assigned', 'in_progress', 'waiting_for_spare_parts', 'resolved', 'closed'
);

create type attachment_category as enum (
  'single_line_diagram', 'layout', 'panel_schedule', 'as_built_drawing', 'manual',
  'datasheet', 'test_report', 'maintenance_report', 'quotation', 'purchase_order',
  'building_photo', 'equipment_photo', 'other'
);

create type audit_action as enum (
  'add', 'edit', 'delete', 'upload', 'close_fault', 'complete_maintenance', 'complete_test'
);

-- ---------------------------------------------------------
-- PROFILES (يمتد من auth.users في Supabase)
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role user_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- BUILDINGS
-- ---------------------------------------------------------
create table buildings (
  id uuid primary key default uuid_generate_v4(),
  building_number text not null unique,
  name text not null,
  department text,
  location text,
  latitude double precision,
  longitude double precision,
  responsible_person text,
  contact_phone text,
  contact_email text,
  description text,
  status building_status not null default 'unknown',
  image_url text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- EQUIPMENT (جدول عام لكل الأصول، وجداول تفصيلية مرتبطة به)
-- ---------------------------------------------------------
create table equipment (
  id uuid primary key default uuid_generate_v4(),
  asset_id text not null unique,
  name text not null,
  type equipment_type not null,
  building_id uuid not null references buildings(id) on delete cascade,
  location_in_building text,
  manufacturer text,
  model text,
  serial_number text,
  manufacturing_year int,
  installation_date date,
  status equipment_status not null default 'available',
  criticality criticality_level not null default 'medium',
  image_url text,
  manual_file_url text,
  datasheet_file_url text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table generators (
  equipment_id uuid primary key references equipment(id) on delete cascade,
  generator_number text,
  rated_power_kva numeric,
  rated_power_kw numeric,
  voltage numeric,
  frequency numeric,
  number_of_phases int,
  power_factor numeric,
  fuel_type text,
  fuel_tank_capacity numeric,
  engine_manufacturer text,
  alternator_manufacturer text,
  avr_model text,
  governor_model text,
  running_hours numeric default 0,
  battery_quantity int,
  battery_voltage numeric,
  battery_capacity_ah numeric,
  oil_type text,
  oil_capacity numeric,
  oil_filter_part_number text,
  fuel_filter_part_number text,
  air_filter_part_number text,
  coolant_type text,
  last_oil_change date,
  last_filter_change date,
  last_battery_replacement date,
  next_maintenance_date date,
  last_operational_test date
);

create table ats_units (
  equipment_id uuid primary key references equipment(id) on delete cascade,
  ats_number text,
  rated_current numeric,
  rated_voltage numeric,
  number_of_poles int,
  normal_source text,
  emergency_source text,
  transfer_delay numeric,
  return_delay numeric,
  cool_down_time numeric,
  last_test date,
  last_maintenance date
);

create table ups_units (
  equipment_id uuid primary key references equipment(id) on delete cascade,
  ups_number text,
  capacity_kva numeric,
  capacity_kw numeric,
  input_voltage numeric,
  output_voltage numeric,
  number_of_phases int,
  current_load_percentage numeric,
  current_load_kva numeric,
  operating_mode ups_mode default 'online',
  battery_quantity int,
  battery_voltage numeric,
  battery_capacity_ah numeric,
  battery_manufacturer text,
  battery_model text,
  battery_installation_date date,
  expected_runtime_minutes numeric,
  last_battery_test date,
  last_battery_replacement date,
  last_maintenance date
);

create table transformers (
  equipment_id uuid primary key references equipment(id) on delete cascade,
  transformer_number text,
  capacity_kva numeric,
  primary_voltage numeric,
  secondary_voltage numeric,
  transformer_type text,
  cooling_type text,
  vector_group text,
  impedance numeric,
  oil_or_dry_type text,
  last_inspection date,
  last_oil_test date,
  current_load_percentage numeric
);

-- ---------------------------------------------------------
-- TESTS
-- ---------------------------------------------------------
create table tests (
  id uuid primary key default uuid_generate_v4(),
  test_number text not null unique,
  test_type test_type not null,
  building_id uuid not null references buildings(id),
  equipment_id uuid references equipment(id),
  test_date date not null,
  start_time time,
  end_time time,
  interruption_duration_minutes numeric,
  responsible_person text,
  equipment_started_successfully boolean,
  ats_worked boolean,
  load_transferred boolean,
  power_restored_normally boolean,
  readings jsonb,
  result test_result not null default 'not_completed',
  notes text,
  recommendations text,
  pdf_report_url text,
  next_test_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- MAINTENANCE RECORDS
-- ---------------------------------------------------------
create table maintenance_records (
  id uuid primary key default uuid_generate_v4(),
  maintenance_number text not null unique,
  building_id uuid not null references buildings(id),
  equipment_id uuid references equipment(id),
  maintenance_type text,
  category maintenance_category not null default 'preventive',
  maintenance_date date not null,
  work_description text,
  problem_found text,
  action_taken text,
  spare_parts_used text,
  technician_name text,
  engineer_name text,
  start_time time,
  end_time time,
  duration_minutes numeric,
  cost numeric,
  notes text,
  recommendations text,
  pdf_report_url text,
  next_maintenance_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- FAULTS
-- ---------------------------------------------------------
create table faults (
  id uuid primary key default uuid_generate_v4(),
  fault_number text not null unique,
  building_id uuid not null references buildings(id),
  equipment_id uuid references equipment(id),
  reported_at timestamptz not null default now(),
  reported_by text,
  description text not null,
  priority fault_priority not null default 'medium',
  impact text,
  status fault_status not null default 'open',
  responsible_engineer uuid references profiles(id),
  responsible_technician uuid references profiles(id),
  root_cause text,
  temporary_action text,
  final_resolution text,
  response_time_minutes numeric,
  repair_time_minutes numeric,
  downtime_minutes numeric,
  spare_parts_used text,
  closed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SPARE PARTS
-- ---------------------------------------------------------
create table spare_parts (
  id uuid primary key default uuid_generate_v4(),
  part_name text not null,
  part_number text,
  manufacturer text,
  compatible_equipment_type equipment_type,
  quantity_available numeric not null default 0,
  minimum_stock numeric not null default 0,
  storage_location text,
  supplier text,
  price numeric,
  purchase_date date,
  expiry_date date,
  image_url text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table equipment_spare_parts (
  id uuid primary key default uuid_generate_v4(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  spare_part_id uuid not null references spare_parts(id) on delete cascade,
  unique (equipment_id, spare_part_id)
);

-- ---------------------------------------------------------
-- ATTACHMENTS (ملفات وصور ومخططات - عام لكل الكيانات)
-- ---------------------------------------------------------
create table attachments (
  id uuid primary key default uuid_generate_v4(),
  file_name text not null,
  file_url text not null,
  file_type text,
  category attachment_category not null default 'other',
  building_id uuid references buildings(id) on delete cascade,
  equipment_id uuid references equipment(id) on delete cascade,
  test_id uuid references tests(id) on delete cascade,
  maintenance_id uuid references maintenance_records(id) on delete cascade,
  fault_id uuid references faults(id) on delete cascade,
  spare_part_id uuid references spare_parts(id) on delete cascade,
  description text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text,
  link text,
  is_read boolean not null default false,
  severity text default 'info',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  user_name text,
  action audit_action not null,
  table_name text,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------
create index idx_equipment_building on equipment(building_id);
create index idx_tests_building on tests(building_id);
create index idx_tests_equipment on tests(equipment_id);
create index idx_maintenance_building on maintenance_records(building_id);
create index idx_maintenance_equipment on maintenance_records(equipment_id);
create index idx_faults_building on faults(building_id);
create index idx_faults_equipment on faults(equipment_id);
create index idx_faults_status on faults(status);
create index idx_attachments_building on attachments(building_id);
create index idx_attachments_equipment on attachments(equipment_id);
create index idx_notifications_user on notifications(user_id);

-- ---------------------------------------------------------
-- TRIGGER: تحديث updated_at تلقائيًا
-- ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_buildings_updated before update on buildings
  for each row execute function set_updated_at();
create trigger trg_equipment_updated before update on equipment
  for each row execute function set_updated_at();
create trigger trg_tests_updated before update on tests
  for each row execute function set_updated_at();
create trigger trg_maintenance_updated before update on maintenance_records
  for each row execute function set_updated_at();
create trigger trg_faults_updated before update on faults
  for each row execute function set_updated_at();
create trigger trg_spare_parts_updated before update on spare_parts
  for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- TRIGGER: إنشاء profile تلقائيًا عند تسجيل مستخدم جديد
-- ---------------------------------------------------------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'viewer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- #########################################################################
-- # 2) ROW LEVEL SECURITY — سياسات الصلاحيات (آمنة من الأصل) + Storage الأولي
-- #########################################################################

-- =========================================================
-- سياسات Row Level Security
-- شغّل هذا الملف بعد schema.sql
-- الأدوار: admin (تحكم كامل) | engineer (إضافة/تعديل) |
--          technician (تسجيل نتائج فقط، بدون حذف) | viewer (عرض فقط)
-- =========================================================

-- تفعيل RLS على كل الجداول
alter table profiles enable row level security;
alter table buildings enable row level security;
alter table equipment enable row level security;
alter table generators enable row level security;
alter table ats_units enable row level security;
alter table ups_units enable row level security;
alter table transformers enable row level security;
alter table tests enable row level security;
alter table maintenance_records enable row level security;
alter table faults enable row level security;
alter table spare_parts enable row level security;
alter table equipment_spare_parts enable row level security;
alter table attachments enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- ---------------------------------------------------------
-- دالة مساعدة: قراءة دور المستخدم الحالي
-- ---------------------------------------------------------
create or replace function auth_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_admin() returns boolean as $$
  select auth_role() = 'admin';
$$ language sql stable security definer;

create or replace function can_edit() returns boolean as $$
  select auth_role() in ('admin', 'engineer', 'technician');
$$ language sql stable security definer;

create or replace function can_delete() returns boolean as $$
  select auth_role() in ('admin', 'engineer');
$$ language sql stable security definer;

-- ---------------------------------------------------------
-- PROFILES
-- ملاحظة: هذه السياسات آمنة من الأصل (مراجعة أمنية لاحقة عدّلتها هنا مباشرة
-- بدل الاعتماد فقط على security_hardening.sql لتجاوزها) — كل مستخدم يرى صفّه
-- فقط، admin يرى الجميع. القراءة العامة (بريد/جوال/دور كل الموظفين لأي أحد)
-- لم تعد الإعداد الافتراضي حتى لو شُغِّل هذا الملف منفردًا.
-- ---------------------------------------------------------
create policy "profiles_select_self_or_admin" on profiles
  for select using (auth.uid() = id or is_admin());

create policy "profiles_update_self_or_admin" on profiles
  for update using (auth.uid() = id or is_admin());

create policy "profiles_insert_admin" on profiles
  for insert with check (is_admin());

-- الحذف: admin فقط، ولا يستطيع حذف صفّه الخاص (طبقة أولى؛ حماية "آخر admin"
-- الكاملة مضافة في security_hardening.sql عبر trigger مخصص)
create policy "profiles_delete_admin_not_self" on profiles
  for delete using (is_admin() and id <> auth.uid());

-- دليل مستخدمين محدود (اسم + دور + حالة تفعيل فقط، بدون بريد/جوال)
-- يُستخدم لإسناد الأعطال لمهندس/فني دون كشف بيانات شخصية حساسة لغير admin.
create or replace view profiles_directory as
  select id, full_name, role, is_active
  from profiles
  where is_active = true;

grant select on profiles_directory to authenticated;

-- ---------------------------------------------------------
-- BUILDINGS
-- ---------------------------------------------------------
create policy "buildings_select_all" on buildings
  for select using (auth.uid() is not null);

create policy "buildings_insert_engineers" on buildings
  for insert with check (auth_role() in ('admin', 'engineer'));

create policy "buildings_update_engineers" on buildings
  for update using (auth_role() in ('admin', 'engineer'));

create policy "buildings_delete_admin_only" on buildings
  for delete using (is_admin());

-- ---------------------------------------------------------
-- EQUIPMENT + جداول التفاصيل (نفس النمط)
-- ---------------------------------------------------------
create policy "equipment_select_all" on equipment
  for select using (auth.uid() is not null);
create policy "equipment_insert" on equipment
  for insert with check (auth_role() in ('admin', 'engineer', 'technician'));
create policy "equipment_update" on equipment
  for update using (auth_role() in ('admin', 'engineer', 'technician'));
create policy "equipment_delete" on equipment
  for delete using (can_delete());

create policy "generators_select_all" on generators for select using (auth.uid() is not null);
create policy "generators_write" on generators for all using (can_edit()) with check (can_edit());

create policy "ats_select_all" on ats_units for select using (auth.uid() is not null);
create policy "ats_write" on ats_units for all using (can_edit()) with check (can_edit());

create policy "ups_select_all" on ups_units for select using (auth.uid() is not null);
create policy "ups_write" on ups_units for all using (can_edit()) with check (can_edit());

create policy "transformers_select_all" on transformers for select using (auth.uid() is not null);
create policy "transformers_write" on transformers for all using (can_edit()) with check (can_edit());

-- ---------------------------------------------------------
-- TESTS / MAINTENANCE / FAULTS
-- الفني والمهندس يسجلون النتائج، الحذف للمهندس والمدير فقط
-- ---------------------------------------------------------
create policy "tests_select_all" on tests for select using (auth.uid() is not null);
create policy "tests_insert" on tests for insert with check (can_edit());
create policy "tests_update" on tests for update using (can_edit());
create policy "tests_delete" on tests for delete using (can_delete());

create policy "maintenance_select_all" on maintenance_records for select using (auth.uid() is not null);
create policy "maintenance_insert" on maintenance_records for insert with check (can_edit());
create policy "maintenance_update" on maintenance_records for update using (can_edit());
create policy "maintenance_delete" on maintenance_records for delete using (can_delete());

create policy "faults_select_all" on faults for select using (auth.uid() is not null);
create policy "faults_insert" on faults for insert with check (can_edit());
create policy "faults_update" on faults for update using (can_edit());
create policy "faults_delete" on faults for delete using (can_delete());

-- ---------------------------------------------------------
-- SPARE PARTS
-- ---------------------------------------------------------
create policy "spare_parts_select_all" on spare_parts for select using (auth.uid() is not null);
create policy "spare_parts_write" on spare_parts for all using (can_edit()) with check (can_edit());
create policy "spare_parts_delete" on spare_parts for delete using (can_delete());

create policy "eq_spare_parts_select_all" on equipment_spare_parts for select using (auth.uid() is not null);
create policy "eq_spare_parts_write" on equipment_spare_parts for all using (can_edit()) with check (can_edit());

-- ---------------------------------------------------------
-- ATTACHMENTS
-- ---------------------------------------------------------
create policy "attachments_select_all" on attachments for select using (auth.uid() is not null);
create policy "attachments_insert" on attachments for insert with check (can_edit());
create policy "attachments_delete" on attachments for delete using (can_delete());

-- ---------------------------------------------------------
-- NOTIFICATIONS (كل مستخدم يرى تنبيهاته فقط)
-- ---------------------------------------------------------
create policy "notifications_select_own" on notifications
  for select using (user_id = auth.uid() or is_admin());
create policy "notifications_update_own" on notifications
  for update using (user_id = auth.uid());
create policy "notifications_insert_system" on notifications
  for insert with check (auth.uid() is not null);

-- ---------------------------------------------------------
-- AUDIT LOG (admin فقط يقرأ؛ الكتابة عبر trigger فقط — لا سياسة INSERT للعميل
-- لمنع تزوير السجل عبر إدراج مباشر. راجع log_audit_event في audit_triggers.sql،
-- تعمل بصلاحية SECURITY DEFINER وتتجاوز RLS تلقائيًا فلا تحتاج سياسة INSERT هنا)
-- ---------------------------------------------------------
create policy "audit_select_admin_only" on audit_logs for select using (is_admin());

-- ---------------------------------------------------------
-- STORAGE BUCKETS (نفّذها من واجهة Supahase Storage أو SQL)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('building-images', 'building-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('equipment-images', 'equipment-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- سياسات storage: قراءة عامة للصور، ورفع/حذف للمستخدمين المخولين فقط
create policy "public_read_building_images" on storage.objects
  for select using (bucket_id = 'building-images');
create policy "authenticated_upload_building_images" on storage.objects
  for insert with check (bucket_id = 'building-images' and auth.uid() is not null);

create policy "public_read_equipment_images" on storage.objects
  for select using (bucket_id = 'equipment-images');
create policy "authenticated_upload_equipment_images" on storage.objects
  for insert with check (bucket_id = 'equipment-images' and auth.uid() is not null);

create policy "authenticated_read_documents" on storage.objects
  for select using (bucket_id = 'documents' and auth.uid() is not null);
create policy "authenticated_upload_documents" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid() is not null);


-- #########################################################################
-- # 3) AUDIT TRIGGERS — سجل التعديلات التلقائي
-- #########################################################################

-- =========================================================
-- Audit Log Triggers — تسجيل تلقائي لكل إضافة/تعديل/حذف
-- شغّل هذا الملف بعد schema.sql و rls_policies.sql
-- =========================================================

create or replace function log_audit_event()
returns trigger as $$
declare
  v_user_name text;
  v_action audit_action;
begin
  select full_name into v_user_name from profiles where id = auth.uid();

  if (tg_op = 'INSERT') then
    v_action := 'add';
    insert into audit_logs (user_id, user_name, action, table_name, record_id, new_value)
    values (auth.uid(), v_user_name, v_action, tg_table_name, new.id, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    v_action := 'edit';
    insert into audit_logs (user_id, user_name, action, table_name, record_id, old_value, new_value)
    values (auth.uid(), v_user_name, v_action, tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    v_action := 'delete';
    insert into audit_logs (user_id, user_name, action, table_name, record_id, old_value)
    values (auth.uid(), v_user_name, v_action, tg_table_name, old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger audit_buildings
  after insert or update or delete on buildings
  for each row execute function log_audit_event();

create trigger audit_equipment
  after insert or update or delete on equipment
  for each row execute function log_audit_event();

create trigger audit_tests
  after insert or update or delete on tests
  for each row execute function log_audit_event();

create trigger audit_maintenance
  after insert or update or delete on maintenance_records
  for each row execute function log_audit_event();

create trigger audit_faults
  after insert or update or delete on faults
  for each row execute function log_audit_event();

create trigger audit_spare_parts
  after insert or update or delete on spare_parts
  for each row execute function log_audit_event();

-- ---------------------------------------------------------
-- دالة تولّد تنبيهات تلقائية (تُستدعى دوريًا أو عبر Supabase Cron)
-- تنشئ إشعارًا لكل admin/engineer عند: مخزون منخفض، صيانة مستحقة، اختبار قادم خلال 7 أيام
-- ---------------------------------------------------------
create or replace function generate_system_notifications()
returns void as $$
declare
  r record;
  eng record;
begin
  -- تنبيهات المخزون المنخفض
  for r in select * from spare_parts where quantity_available <= minimum_stock loop
    for eng in select id from profiles where role in ('admin', 'engineer') loop
      insert into notifications (user_id, title, message, severity, link)
      select eng.id, 'مخزون منخفض', r.part_name || ' وصلت للحد الأدنى (' || r.quantity_available || ' متبقية)', 'warning', '/spare-parts'
      where not exists (
        select 1 from notifications
        where user_id = eng.id and message like '%' || r.part_name || '%' and created_at > now() - interval '7 days'
      );
    end loop;
  end loop;

  -- تنبيهات الصيانة المستحقة خلال 7 أيام
  for r in select * from maintenance_records where next_maintenance_date between current_date and current_date + 7 loop
    for eng in select id from profiles where role in ('admin', 'engineer', 'technician') loop
      insert into notifications (user_id, title, message, severity, link)
      select eng.id, 'صيانة مستحقة قريبًا', 'موعد الصيانة القادم: ' || r.next_maintenance_date, 'info', '/maintenance'
      where not exists (
        select 1 from notifications
        where user_id = eng.id and link = '/maintenance' and message like '%' || r.next_maintenance_date || '%'
      );
    end loop;
  end loop;

  -- تنبيهات الاختبارات القادمة خلال 7 أيام
  for r in select * from tests where next_test_date between current_date and current_date + 7 loop
    for eng in select id from profiles where role in ('admin', 'engineer', 'technician') loop
      insert into notifications (user_id, title, message, severity, link)
      select eng.id, 'اختبار قادم قريبًا', 'موعد الاختبار القادم: ' || r.next_test_date, 'info', '/tests'
      where not exists (
        select 1 from notifications
        where user_id = eng.id and link = '/tests' and message like '%' || r.next_test_date || '%'
      );
    end loop;
  end loop;
end;
$$ language plpgsql security definer;

-- لتشغيلها تلقائيًا كل يوم (يتطلب تفعيل إضافة pg_cron من Database > Extensions):
-- select cron.schedule('daily-notifications', '0 6 * * *', 'select generate_system_notifications();');


-- #########################################################################
-- # 4) SECURITY HARDENING — تشديد إضافي (إلزامي)
-- #########################################################################

-- =========================================================
-- Security Hardening — شغّله بعد schema.sql + rls_policies.sql + audit_triggers.sql
-- (rls_policies.sql أصبح يحتوي السياسات الآمنة من الأصل بعد المراجعة الأخيرة؛
-- هذا الملف يضيف فقط ما لا يوجد مكان آخر له: Storage، Soft Delete، القيود
-- الإضافية على مستوى trigger، وحماية "آخر admin".)
-- =========================================================

-- ---------------------------------------------------------
-- 1) تحويل كل Storage Buckets إلى خاصة (Private) + تحديد الأنواع والحجم المسموح
-- ---------------------------------------------------------
update storage.buckets set public = false where id in ('building-images', 'equipment-images', 'documents');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('building-images', 'building-images', false, 10485760, array['image/jpeg','image/png','image/jpg']),
  ('equipment-images', 'equipment-images', false, 10485760, array['image/jpeg','image/png','image/jpg']),
  ('documents', 'documents', false, 20971520, array[
      'application/pdf','image/jpeg','image/png','image/jpg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
  ]),
  ('reports', 'reports', false, 20971520, array['application/pdf']),
  ('drawings', 'drawings', false, 20971520, array['application/pdf','image/jpeg','image/png']),
  ('manuals', 'manuals', false, 20971520, array['application/pdf']),
  ('attachments', 'attachments', false, 20971520, array[
      'application/pdf','image/jpeg','image/png','image/jpg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
  ])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------
-- 2) حذف سياسات storage القديمة (كانت public read) واستبدالها بسياسات خاصة
-- ---------------------------------------------------------
drop policy if exists "public_read_building_images" on storage.objects;
drop policy if exists "authenticated_upload_building_images" on storage.objects;
drop policy if exists "public_read_equipment_images" on storage.objects;
drop policy if exists "authenticated_upload_equipment_images" on storage.objects;
drop policy if exists "authenticated_read_documents" on storage.objects;
drop policy if exists "authenticated_upload_documents" on storage.objects;

create policy "storage_select_authenticated" on storage.objects
  for select using (
    auth.uid() is not null
    and bucket_id in ('building-images','equipment-images','documents','reports','drawings','manuals','attachments')
  );

create policy "storage_insert_can_edit" on storage.objects
  for insert with check (
    can_edit()
    and bucket_id in ('building-images','equipment-images','documents','reports','drawings','manuals','attachments')
  );

create policy "storage_delete_can_delete" on storage.objects
  for delete using (
    can_delete()
    and bucket_id in ('building-images','equipment-images','documents','reports','drawings','manuals','attachments')
  );

-- لا سياسة UPDATE = يمنع استبدال ملف موجود من قبل أي شخص (يجب حذفه وإعادة رفعه)

-- ---------------------------------------------------------
-- 3) Soft Delete للبيانات المهمة (المباني والمعدات)
-- ---------------------------------------------------------
alter table buildings add column if not exists deleted_at timestamptz;
alter table equipment add column if not exists deleted_at timestamptz;

drop policy if exists "buildings_select_all" on buildings;
create policy "buildings_select_all" on buildings
  for select using (auth.uid() is not null and (deleted_at is null or is_admin()));

drop policy if exists "equipment_select_all" on equipment;
create policy "equipment_select_all" on equipment
  for select using (auth.uid() is not null and (deleted_at is null or is_admin()));

drop policy if exists "buildings_delete_admin_only" on buildings;
create policy "buildings_delete_admin_only" on buildings
  for delete using (is_admin());

drop policy if exists "equipment_delete" on equipment;
create policy "equipment_delete" on equipment
  for delete using (is_admin());

-- ---------------------------------------------------------
-- 4) منع المستخدم (بما فيه admin) من تغيير دوره أو حالته الخاصة عبر UPDATE
-- ---------------------------------------------------------
create or replace function prevent_self_role_change()
returns trigger as $$
begin
  if auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'غير مسموح بتغيير الدور الخاص بك';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'غير مسموح بتغيير حالة التفعيل الخاصة بك';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_self_role_change on profiles;
create trigger trg_prevent_self_role_change
  before update on profiles
  for each row execute function prevent_self_role_change();

-- ---------------------------------------------------------
-- 5) حماية "آخر Admin نشط" — لا يجوز تعطيل/تخفيض/حذف آخر admin نشط في النظام
--    بواسطة أي شخص (حتى admin آخر)، حتى لا يفقد النظام كل صلاحياته الإدارية.
--    هذا مستقل عن حماية "self" في البند 4 (تلك تمنع تعديل النفس، هذه تمنع
--    ترك النظام بلا أي admin نشط إطلاقًا، بغض النظر عمّن ينفّذ العملية).
-- ---------------------------------------------------------
create or replace function count_other_active_admins(exclude_id uuid)
returns integer as $$
  select count(*)::int from profiles
  where role = 'admin' and is_active = true and id <> exclude_id;
$$ language sql stable security definer;

create or replace function prevent_last_admin_demotion()
returns trigger as $$
begin
  if old.role = 'admin' and old.is_active = true then
    if (new.role is distinct from 'admin' or new.is_active = false)
       and count_other_active_admins(old.id) = 0 then
      raise exception 'لا يمكن تعطيل أو تخفيض آخر مدير نشط في النظام';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_last_admin_demotion on profiles;
create trigger trg_prevent_last_admin_demotion
  before update on profiles
  for each row execute function prevent_last_admin_demotion();

create or replace function prevent_last_admin_deletion()
returns trigger as $$
begin
  if old.role = 'admin' and old.is_active = true and count_other_active_admins(old.id) = 0 then
    raise exception 'لا يمكن حذف آخر مدير نشط في النظام';
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_last_admin_deletion on profiles;
create trigger trg_prevent_last_admin_deletion
  before delete on profiles
  for each row execute function prevent_last_admin_deletion();

-- ---------------------------------------------------------
-- 6) جدول محاولات تسجيل الدخول (لأغراض الأمان والتنبيه)
-- ---------------------------------------------------------
create table if not exists login_attempts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  success boolean not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table login_attempts enable row level security;

create policy "login_attempts_select_admin" on login_attempts
  for select using (is_admin());

create index if not exists idx_login_attempts_email_time on login_attempts(email, created_at);

-- ---------------------------------------------------------
-- 7) قيود CHECK أساسية على مستوى قاعدة البيانات
-- ---------------------------------------------------------
alter table spare_parts
  add constraint chk_spare_parts_quantity_nonnegative check (quantity_available >= 0),
  add constraint chk_spare_parts_min_stock_nonnegative check (minimum_stock >= 0);

alter table equipment
  add constraint chk_equipment_asset_id_not_empty check (length(trim(asset_id)) > 0);

alter table buildings
  add constraint chk_buildings_number_not_empty check (length(trim(building_number)) > 0);

alter table faults
  add constraint chk_faults_description_not_empty check (length(trim(description)) > 0);

-- ---------------------------------------------------------
-- 8) دالة تسجيل تغيير الصلاحيات في audit_logs بشكل صريح (بالإضافة للـ trigger العام)
-- ---------------------------------------------------------
create or replace function log_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    insert into audit_logs (user_id, user_name, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(),
      (select full_name from profiles where id = auth.uid()),
      'edit',
      'profiles_role_change',
      new.id,
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_log_role_change on profiles;
create trigger trg_log_role_change
  after update on profiles
  for each row execute function log_role_change();

-- ---------------------------------------------------------
-- 9) منع الفني (technician) من تعيين deleted_at (الحذف المنطقي) على المباني والمعدات
-- ---------------------------------------------------------
create or replace function prevent_technician_soft_delete()
returns trigger as $$
begin
  if new.deleted_at is distinct from old.deleted_at and auth_role() = 'technician' then
    raise exception 'لا تملك صلاحية حذف هذا السجل';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_buildings_prevent_tech_delete on buildings;
create trigger trg_buildings_prevent_tech_delete
  before update on buildings
  for each row execute function prevent_technician_soft_delete();

drop trigger if exists trg_equipment_prevent_tech_delete on equipment;
create trigger trg_equipment_prevent_tech_delete
  before update on equipment
  for each row execute function prevent_technician_soft_delete();

-- ---------------------------------------------------------
-- 10) تضييق صلاحية الفني على الأعطال: يعدّل فقط الأعطال المسندة إليه
-- ---------------------------------------------------------
drop policy if exists "faults_update" on faults;

create policy "faults_update_admin_engineer" on faults
  for update using (auth_role() in ('admin', 'engineer'));

create policy "faults_update_technician_assigned" on faults
  for update using (
    auth_role() = 'technician'
    and responsible_technician = auth.uid()
  );

-- ---------------------------------------------------------
-- 11) منع الفني من تعديل حقلي إسناد العطل (responsible_engineer/technician)
--     هو يستطيع تحديث بقية حقول العطل المسند إليه (السبب الجذري، الحل، الحالة...)
--     لكن لا يستطيع إعادة إسناد العطل لنفسه أو لغيره — هذا حكر على admin/engineer.
-- ---------------------------------------------------------
create or replace function prevent_technician_reassign_fault()
returns trigger as $$
begin
  if auth_role() = 'technician' then
    if new.responsible_engineer is distinct from old.responsible_engineer then
      raise exception 'لا تملك صلاحية إسناد الأعطال';
    end if;
    if new.responsible_technician is distinct from old.responsible_technician then
      raise exception 'لا تملك صلاحية إعادة إسناد الأعطال';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_technician_reassign_fault on faults;
create trigger trg_prevent_technician_reassign_fault
  before update on faults
  for each row execute function prevent_technician_reassign_fault();


-- #########################################################################
-- # 5) SEED DATA — بيانات تجريبية (اختياري)
-- #########################################################################

-- =========================================================
-- بيانات تجريبية (Seed Data)
-- شغّل هذا بعد إنشاء أول مستخدم عبر Supabase Auth
-- (راجع README لخطوات إنشاء حساب المدير التجريبي)
-- =========================================================

-- المباني
insert into buildings (building_number, name, department, location, responsible_person, status)
values
  ('7',  'Building 7',  'الإدارة العامة', 'الحرم الرئيسي', 'م. سعد العتيبي', 'ready'),
  ('12', 'Building 12', 'تقنية المعلومات', 'الحرم الرئيسي', 'م. فهد القحطاني', 'ready'),
  ('17', 'Building 17', 'الشؤون الأكاديمية', 'الحرم الشمالي', 'م. خالد الدوسري', 'watch'),
  ('20', 'Building 20', 'المختبرات', 'الحرم الشمالي', 'م. عبدالله الشهري', 'ready'),
  ('30', 'Building 30', 'السكن الجامعي', 'الحرم الجنوبي', 'م. ماجد الحربي', 'fault'),
  ('38', 'Building 38', 'المرافق', 'الحرم الجنوبي', 'م. تركي العمري', 'watch'),
  ('39', 'Building 39', 'الشؤون الأكاديمية', 'الحرم الشمالي', 'م. بندر الزهراني', 'ready'),
  ('43', 'Building 43', 'الخدمات الطبية', 'الحرم الرئيسي', 'م. ياسر الغامدي', 'fault'),
  ('44', 'Building 44', 'الخدمات الطبية', 'الحرم الرئيسي', 'م. نواف السبيعي', 'ready'),
  ('46', 'Building 46', 'الأنشطة الطلابية', 'الحرم الجنوبي', 'م. راكان المطيري', 'unknown'),
  ('CH3','CH3',          'المحطة الكهربائية', 'محطة التحويل', 'م. سلطان القرني', 'ready');

-- المعدات: مولدات
insert into equipment (asset_id, name, type, building_id, manufacturer, model, serial_number, status, criticality)
select 'GEN-'||building_number||'-01', 'مولد رئيسي '||name, 'generator', id, 'Perkins', 'P500-3', 'SN-GEN-'||building_number, 'standby', 'critical'
from buildings where building_number in ('7','12','30','43','CH3');

insert into generators (equipment_id, generator_number, rated_power_kva, rated_power_kw, voltage, frequency,
  number_of_phases, fuel_type, fuel_tank_capacity, running_hours, next_maintenance_date, generator_status)
select e.id, 'G-'||b.building_number, 500, 400, 400, 50, 3, 'ديزل', 1000, 1240, current_date + 20, 'Standby'
from equipment e join buildings b on b.id = e.building_id
where e.type = 'generator';

-- المعدات: ATS
insert into equipment (asset_id, name, type, building_id, manufacturer, model, status, criticality)
select 'ATS-'||building_number||'-01', 'ATS '||name, 'ats', id, 'ASCO', '4000 Series', 'available', 'high'
from buildings where building_number in ('7','12','30','43');

insert into ats_units (equipment_id, ats_number, rated_current, rated_voltage, number_of_poles, last_test)
select e.id, 'ATS-'||b.building_number, 800, 400, 4, current_date - 30
from equipment e join buildings b on b.id = e.building_id
where e.type = 'ats';

-- المعدات: UPS
insert into equipment (asset_id, name, type, building_id, manufacturer, model, status, criticality)
select 'UPS-'||building_number||'-01', 'UPS '||name, 'ups', id, 'Riello', 'Multi Sentry 60', 'running', 'critical'
from buildings where building_number in ('12','20','39');

insert into ups_units (equipment_id, ups_number, capacity_kva, capacity_kw, current_load_percentage,
  operating_mode, battery_quantity, expected_runtime_minutes, last_battery_test)
select e.id, 'UPS-'||b.building_number, 60, 54, 45, 'online', 20, 25, current_date - 15
from equipment e join buildings b on b.id = e.building_id
where e.type = 'ups';

-- المعدات: محولات
insert into equipment (asset_id, name, type, building_id, manufacturer, status, criticality)
select 'TR-'||building_number||'-01', 'محول '||name, 'transformer', id, 'ABB', 'available', 'high'
from buildings where building_number in ('CH3','43');

insert into transformers (equipment_id, transformer_number, capacity_kva, primary_voltage, secondary_voltage,
  transformer_type, cooling_type, current_load_percentage)
select e.id, 'TR-'||b.building_number, 1000, 13800, 400, 'Step-Down', 'ONAN', 60
from equipment e join buildings b on b.id = e.building_id
where e.type = 'transformer';

-- اختبارات: ناجحة وبها ملاحظات
insert into tests (test_number, test_type, building_id, equipment_id, test_date, responsible_person,
  equipment_started_successfully, ats_worked, load_transferred, power_restored_normally, result, notes, next_test_date)
select 'TST-'||b.building_number||'-001', 'generator_operational_test', b.id, e.id, current_date - 10,
  'م. سعد العتيبي', true, true, true, true, 'passed', 'اختبار روتيني ناجح بالكامل', current_date + 80
from equipment e join buildings b on b.id = e.building_id
where e.type = 'generator' and b.building_number = '7';

insert into tests (test_number, test_type, building_id, equipment_id, test_date, responsible_person,
  equipment_started_successfully, ats_worked, result, notes, next_test_date)
select 'TST-'||b.building_number||'-002', 'ups_battery_test', b.id, e.id, current_date - 5,
  'م. فهد القحطاني', true, null, 'passed_with_observation', 'زمن استجابة البطارية أبطأ من المعتاد بشكل طفيف', current_date + 85
from equipment e join buildings b on b.id = e.building_id
where e.type = 'ups' and b.building_number = '12';

-- صيانة مكتملة
insert into maintenance_records (maintenance_number, building_id, equipment_id, maintenance_type, category,
  maintenance_date, work_description, technician_name, engineer_name, next_maintenance_date)
select 'MNT-'||b.building_number||'-001', b.id, e.id, 'تغيير زيت وفلاتر', 'preventive', current_date - 15,
  'تغيير زيت المحرك وفلتر الزيت وفلتر الوقود حسب الجدول الدوري', 'فني: محمد الأحمدي', 'م. سعد العتيبي', current_date + 75
from equipment e join buildings b on b.id = e.building_id
where e.type = 'generator' and b.building_number = '7';

-- أعطال مفتوحة
insert into faults (fault_number, building_id, equipment_id, reported_by, description, priority, status)
select 'FLT-'||b.building_number||'-001', b.id, e.id, 'فني المناوبة', 'المولد لا يبدأ التشغيل التلقائي عند انقطاع الكهرباء', 'critical', 'open'
from equipment e join buildings b on b.id = e.building_id
where e.type = 'generator' and b.building_number = '30';

insert into faults (fault_number, building_id, equipment_id, reported_by, description, priority, status)
select 'FLT-'||b.building_number||'-002', b.id, e.id, 'مشرف المبنى', 'صوت غير طبيعي من مروحة تبريد المحول', 'medium', 'in_progress'
from equipment e join buildings b on b.id = e.building_id
where e.type = 'transformer' and b.building_number = '43';

-- قطع غيار
insert into spare_parts (part_name, part_number, manufacturer, compatible_equipment_type, quantity_available, minimum_stock, storage_location)
values
  ('فلتر زيت', 'OF-1040', 'Perkins', 'generator', 8, 5, 'مستودع المرافق - رف A1'),
  ('فلتر وقود', 'FF-2210', 'Perkins', 'generator', 3, 5, 'مستودع المرافق - رف A2'),
  ('بطارية UPS 12V', 'BAT-12-100', 'CSB', 'ups', 12, 10, 'مستودع المرافق - رف B1'),
  ('كونتاكتور ATS', 'CTR-800A', 'ASCO', 'ats', 2, 2, 'مستودع المرافق - رف C1');
