-- =========================================================================
-- PATCH — تكرار الصيانة بعدد أيام مخصص
-- المتطلب: تشغيل patch_2026_08_features.sql أولاً
-- أمثلة: 14 = كل أسبوعين، 30 = كل 30 يوم، 90 = كل 90 يوم
-- =========================================================================

-- إضافة قيمة days إلى enum في معاملة مستقلة، ثم استخدامها بعد الـ commit.
begin;
alter type schedule_frequency add value if not exists 'days';
commit;

begin;

-- السماح بقيم أكبر عند استخدام التكرار بالأيام.
alter table maintenance_schedules
  drop constraint if exists maintenance_schedules_interval_count_check;

alter table maintenance_schedules
  add constraint maintenance_schedules_interval_count_check
  check (interval_count between 1 and 3650);

-- تحديث حساب الموعد التالي ليدعم عدد أيام مخصص.
create or replace function next_schedule_date(base date, freq schedule_frequency, steps int)
returns date as $$
  select case freq
    when 'days'       then base + steps
    when 'weekly'     then base + (steps * 7)
    when 'monthly'    then (base + (steps || ' months')::interval)::date
    when 'quarterly'  then (base + (steps * 3 || ' months')::interval)::date
    when 'semiannual' then (base + (steps * 6 || ' months')::interval)::date
    when 'yearly'     then (base + (steps || ' years')::interval)::date
  end;
$$ language sql immutable;

commit;

-- تحقق اختياري:
-- select next_schedule_date(date '2026-08-11', 'days'::schedule_frequency, 14); -- 2026-08-25
-- select next_schedule_date(date '2026-08-11', 'days'::schedule_frequency, 90); -- 2026-11-09
