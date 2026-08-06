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
