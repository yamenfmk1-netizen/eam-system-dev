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
