-- =========================================================================
-- PATCH — مراجعة أمنية (يجمع جولتي المراجعة: الأولى + التعديلات الإضافية)
-- لم يُشغَّل هذا الملف تلقائيًا. طبّقه بنفسك من Supabase SQL Editor على القاعدة الحية.
-- لا يحذف أي بيانات، لا يغيّر أسماء جداول أو أعمدة، لا يعطّل RLS — يُشدّده فقط.
-- آمن للتطبيق على قاعدة تعمل حاليًا (كل التعديلات DROP POLICY IF EXISTS ثم CREATE،
-- بنفس نمط ملفات المشروع الحالية). آمن أيضًا لو طُبِّق أكثر من مرة (idempotent).
-- =========================================================================

-- ---------------------------------------------------------
-- 1) تقييد قراءة profiles: كل مستخدم يرى صفّه فقط، admin يرى الجميع
--    (كانت "auth.uid() is not null" أي أي مستخدم يرى كل بريد/جوال/دور لكل الموظفين)
-- ---------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on profiles;

create policy "profiles_select_self_or_admin" on profiles
  for select using (auth.uid() = id or is_admin());

-- ---------------------------------------------------------
-- 2) دليل مستخدمين محدود (بدون بريد/جوال) لكل من يحتاج إسناد عطل لمهندس/فني
--    هذه View قياسية وآمنة: تُنشأ بصلاحية مالكها (تتجاوز قيد البند 1 عمدًا)
--    وتكشف فقط 4 أعمدة غير حساسة، بعد ذلك GRANT يحدد من يستطيع استخدامها.
-- ---------------------------------------------------------
create or replace view profiles_directory as
  select id, full_name, role, is_active
  from profiles
  where is_active = true;

grant select on profiles_directory to authenticated;

-- ---------------------------------------------------------
-- 3) تقييد قراءة audit_logs لـ admin فقط
--    (كانت "auth.uid() is not null" أي أي مستخدم يرى كل سجل التدقيق الكامل)
-- ---------------------------------------------------------
drop policy if exists "audit_select_all" on audit_logs;

create policy "audit_select_admin_only" on audit_logs
  for select using (is_admin());

-- ---------------------------------------------------------
-- 4) توسيع حماية trigger منع تعديل الدور الذاتي لتشمل الإداريين أيضًا
--    (كانت "and not is_admin()" تستثني admin، فيستطيع تعديل دوره الخاص
--     مباشرة عبر supabase-js من console المتصفح، متجاوزًا حماية API route)
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
-- (الـ trigger القائم على الجدول لا يحتاج إعادة إنشاء، فقط استبدلنا الدالة أعلاه)

-- ---------------------------------------------------------
-- 5) منع أي مستخدم (بما فيه admin) من حذف صف profiles الخاص به مباشرة
--    (كانت "is_admin()" فقط، بدون استثناء الصف الذاتي — يسمح لأي admin
--     بحذف حسابه بنفسه عبر استدعاء مباشر، متجاوزًا حماية API route)
-- ---------------------------------------------------------
drop policy if exists "profiles_delete_admin" on profiles;

create policy "profiles_delete_admin_not_self" on profiles
  for delete using (is_admin() and id <> auth.uid());

-- ---------------------------------------------------------
-- ملاحظة توثيقية فقط (لا تنفيذ): بعد هذا الملف، الحقول
-- faults.responsible_engineer و faults.responsible_technician
-- أصبحت قابلة للتعبئة من الواجهة (تعديل كود التطبيق، وليس هذا الملف)
-- عبر قراءة profiles_directory بدل الوصول المباشر لجدول profiles.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- 6) حماية "آخر Admin نشط" — إضافة جديدة (مراجعة تالية)
--    لا يجوز لأي شخص (حتى admin آخر) تعطيل/تخفيض/حذف آخر admin نشط في النظام
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
-- 7) منع الفني من تعديل حقلي إسناد العطل (responsible_engineer/technician) —
--    إضافة جديدة (مراجعة تالية). هو يعدّل بقية حقول العطل المسند إليه، لكن
--    لا يستطيع إعادة إسناده — حكر على admin/engineer.
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
