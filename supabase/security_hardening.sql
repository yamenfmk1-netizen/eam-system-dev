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
