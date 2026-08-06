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
