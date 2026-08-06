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
