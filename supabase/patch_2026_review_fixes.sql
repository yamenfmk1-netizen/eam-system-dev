-- =========================================================================
-- PATCH — مراجعة أمنية
-- آمن للتشغيل أكثر من مرة
-- =========================================================================

-- ---------------------------------------------------------
-- 1) تقييد قراءة profiles
-- ---------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on profiles;
drop policy if exists "profiles_select_self_or_admin" on profiles;

create policy "profiles_select_self_or_admin" on profiles
  for select
  using (
    auth.uid() = id
    or is_admin()
  );

-- ---------------------------------------------------------
-- 2) دليل مستخدمين محدود
-- ---------------------------------------------------------
create or replace view profiles_directory as
  select
    id,
    full_name,
    role,
    is_active
  from profiles
  where is_active = true;

grant select on profiles_directory to authenticated;

-- ---------------------------------------------------------
-- 3) تقييد قراءة audit_logs للمدير فقط
-- ---------------------------------------------------------
drop policy if exists "audit_select_all" on audit_logs;
drop policy if exists "audit_select_admin_only" on audit_logs;

create policy "audit_select_admin_only" on audit_logs
  for select
  using (
    is_admin()
  );

-- ---------------------------------------------------------
-- 4) منع المستخدم من تغيير دوره أو حالته بنفسه
-- ---------------------------------------------------------
create or replace function prevent_self_role_change()
returns trigger
as $$
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
  for each row
  execute function prevent_self_role_change();

-- ---------------------------------------------------------
-- 5) منع المدير من حذف صفه الخاص
-- ---------------------------------------------------------
drop policy if exists "profiles_delete_admin" on profiles;
drop policy if exists "profiles_delete_admin_not_self" on profiles;

create policy "profiles_delete_admin_not_self" on profiles
  for delete
  using (
    is_admin()
    and id <> auth.uid()
  );

-- ---------------------------------------------------------
-- 6) حماية آخر مدير نشط
-- ---------------------------------------------------------
create or replace function count_other_active_admins(exclude_id uuid)
returns integer
as $$
  select count(*)::int
  from profiles
  where role = 'admin'
    and is_active = true
    and id <> exclude_id;
$$ language sql stable security definer;

create or replace function prevent_last_admin_demotion()
returns trigger
as $$
begin
  if old.role = 'admin' and old.is_active = true then
    if (
      new.role is distinct from 'admin'
      or new.is_active = false
    )
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
  for each row
  execute function prevent_last_admin_demotion();

create or replace function prevent_last_admin_deletion()
returns trigger
as $$
begin
  if old.role = 'admin'
     and old.is_active = true
     and count_other_active_admins(old.id) = 0 then
    raise exception 'لا يمكن حذف آخر مدير نشط في النظام';
  end if;

  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_last_admin_deletion on profiles;

create trigger trg_prevent_last_admin_deletion
  before delete on profiles
  for each row
  execute function prevent_last_admin_deletion();

-- ---------------------------------------------------------
-- 7) منع الفني من إعادة إسناد الأعطال
-- ---------------------------------------------------------
create or replace function prevent_technician_reassign_fault()
returns trigger
as $$
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
  for each row
  execute function prevent_technician_reassign_fault();
  