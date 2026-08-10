-- =========================================================================
-- حزمة إدخال: خريطة مغذيات الجهد المتوسط ← محطات/محولات التوزيع ← الأحمال
-- المصدر: ملف KACST_Substation___Loads.xlsx
-- تُشغَّل بعد ملف mv_switchgear_july2025_import.sql (تحتاج المبنى 13 وأصول SWGR-13-*)
-- الملف idempotent: إعادة تشغيله لا تنشئ سجلات مكررة ولا تحذف أي بيانات.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1) استكمال أصول المغذيات: 1E و 2E (لم تردا في تقارير الصيانة، ووردتا في ملف الأحمال)
-- -------------------------------------------------------------------------
insert into equipment (asset_id, name, type, building_id, location_in_building, status, criticality, notes)
select v.asset_id, v.name, 'switchgear'::equipment_type, b.id, 'غرفة المفاتيح الكهربائية الرئيسية',
       'available'::equipment_status, 'critical'::criticality_level, v.notes
from buildings b, (values
  ('SWGR-13-1E', 'المغذي 1E - غرفة المفاتيح الرئيسية', 'مغذي طوارئ؛ يغذي إنارة الطرق ومبنى 26 ومبنى 45 ومحطات الصرف والمياه.'),
  ('SWGR-13-2E', 'المغذي 2E - غرفة المفاتيح الرئيسية', 'مغذي طوارئ؛ يغذي لوحة تحكم مفاتيح الجهد المتوسط ونظام DC الاحتياطي بمبنى 13، ولوحة تحكم المولدات بمبنى 12.')
) as v(asset_id, name, notes)
where b.building_number = '13'
on conflict (asset_id) do nothing;

-- -------------------------------------------------------------------------
-- 2) جدول خريطة الأحمال + سياسات RLS + View للاستعلام لكل مغذي
-- -------------------------------------------------------------------------
create table if not exists mv_loop_loads (
  id uuid primary key default uuid_generate_v4(),
  loop_code text not null,                  -- الحلقة، مثال: 6A/6B
  feeder_a text,                            -- المغذي الأول، مثال: 6A
  feeder_b text,                            -- المغذي المقابل، مثال: 6B
  substation_code text not null,            -- محطة التحويل أو المحول، مثال: NTR-19 أو S/S No.5
  substation_kind text not null default 'transformer',  -- substation | transformer
  capacity_kva numeric,
  load_description text not null,
  building_numbers text,                    -- أرقام المباني المستخرجة من وصف الحمل (إن وُجدت)
  sort_order int,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_mv_loop_loads
  on mv_loop_loads (loop_code, substation_code, md5(load_description));
create index if not exists idx_mv_loop_loads_feeder_a on mv_loop_loads (feeder_a);
create index if not exists idx_mv_loop_loads_feeder_b on mv_loop_loads (feeder_b);

alter table mv_loop_loads enable row level security;
drop policy if exists "mv_loop_loads_select_all" on mv_loop_loads;
create policy "mv_loop_loads_select_all" on mv_loop_loads
  for select using (auth.uid() is not null);
drop policy if exists "mv_loop_loads_write" on mv_loop_loads;
create policy "mv_loop_loads_write" on mv_loop_loads
  for all using (can_edit()) with check (can_edit());

-- View: صف لكل مغذي على حدة (يُظهر أحمال الحلقة التي ينتمي إليها المغذي)
create or replace view v_mv_feeder_loads
with (security_invoker = true) as
select l.id,
       f.code                as feeder_code,
       e.id                  as feeder_equipment_id,
       e.asset_id            as feeder_asset_id,
       l.loop_code, l.substation_code, l.substation_kind, l.capacity_kva,
       l.load_description, l.building_numbers
from mv_loop_loads l
cross join lateral (values (l.feeder_a), (l.feeder_b)) as f(code)
left join equipment e on e.asset_id = 'SWGR-13-' || f.code
where f.code is not null;

grant select on v_mv_feeder_loads to authenticated;

-- -------------------------------------------------------------------------
-- 3) بيانات الأحمال
-- -------------------------------------------------------------------------
insert into mv_loop_loads (loop_code, feeder_a, feeder_b, substation_code, substation_kind,
  capacity_kva, load_description, building_numbers, sort_order, notes)
values
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'HOUSE NO 2-57-062', null, 1, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'HOUSE NO2-063-65 /11-222-224', null, 2, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'HOUSE NO2-066-071', null, 3, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'HOUSE NO2-072-077', null, 4, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'HOUSE NO3-078-083', null, 5, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'IRRIGATION PUMPING STATION -B', null, 6, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'STREETLIGHTING SL1', null, 7, null),
  ('1A/1B', '1A', '1B', 'S/S No.1', 'substation', 1000, 'FOUNTAIN NO2 NO7', null, 8, null),
  ('1A/1B', '1A', '1B', 'S/S No.2', 'substation', 500, 'kg2', null, 9, null),
  ('1A/1B', '1A', '1B', 'S/S No.3', 'substation', 500, 'HOUSE NO 11-196-198/200.314.316.318', null, 10, null),
  ('1A/1B', '1A', '1B', 'S/S No.3', 'substation', 500, 'HOUSE NO333.324.326.328.320.322(11-200.198.196)', null, 11, null),
  ('1A/1B', '1A', '1B', 'S/S No.3', 'substation', 500, 'HOUSE NO10 .192.194', null, 12, null),
  ('1A/1B', '1A', '1B', 'S/S No.3', 'substation', 500, 'STREET LIGHTING SL3', null, 13, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE  NO11-226.228.230.232.234', null, 14, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-236.238.240.242', null, 15, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-201.199.197.195', null, 16, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-211.209.207.205.203', null, 17, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-204.206.208.210.212', null, 18, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-213.216.217.218.219.220', null, 19, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'HOUSE NO11-214.215 /10-191.190.189.188', null, 20, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'IRRIGATION PUMP STATION -D', null, 21, null),
  ('1A/1B', '1A', '1B', 'S/S No.4', 'substation', 1000, 'STREET LIGHTING SL4', null, 22, null),
  ('1A/1B', '1A', '1B', 'S/S No.5', 'substation', 500, 'HOUSE NO 11-221.223.225.227.229.231', null, 23, null),
  ('1A/1B', '1A', '1B', 'S/S No.5', 'substation', 500, 'HOUSE NO1-023.025/2-039.041.043.045', null, 24, null),
  ('1A/1B', '1A', '1B', 'S/S No.5', 'substation', 500, 'HOUSENO 11-233.235.237.239.241', null, 25, null),
  ('1A/1B', '1A', '1B', 'S/S No.5', 'substation', 500, 'MUSALLAH-1', null, 26, null),
  ('1A/1B', '1A', '1B', 'S/S No.5', 'substation', 500, 'STREET LIGHTING SL5', null, 27, null),
  ('1A/1B', '1A', '1B', 'S/S No.6', 'substation', 500, 'HOUSE NO 283-288', null, 28, null),
  ('1A/1B', '1A', '1B', 'S/S No.6', 'substation', 500, 'HOUSE 313.315.317.319.321', null, 29, null),
  ('1A/1B', '1A', '1B', 'S/S No.6', 'substation', 500, 'HOUSE NO 323.325.327.280.282', null, 30, null),
  ('1A/1B', '1A', '1B', 'S/S No.6', 'substation', 500, 'STREET LIGHTING', null, 31, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 9.26.29', null, 32, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 30.31.37-40', null, 33, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 32.36', null, 34, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 289.291.293.295.297.299', null, 35, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 290.292.294.296.298.300', null, 36, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 312.310.308.306.304.302', null, 37, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'HOUSE NO 311.309.307.305.303.301', null, 38, null),
  ('1A/1B', '1A', '1B', 'S/S No.7', 'substation', 1000, 'MUSALLAH -2', null, 39, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'HOUSE NO 12-17', null, 40, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'HOUSE NO 18-23', null, 41, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'HOUSE NO 10.25.11.24', null, 42, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'HOUSE NO 1-4', null, 43, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'HOUSE NO 5-8', null, 44, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'PILOT HOUSE (TEMPORARY CONNECTION)', null, 45, null),
  ('1A/1B', '1A', '1B', 'S/S No.9', 'substation', 1000, 'GUARD HOUSE', null, 46, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO 67-70', null, 47, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO 63-66', null, 48, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO 59-62', null, 49, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO 50-55', null, 50, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO  41-43,56-58', null, 51, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'HOUSE NO 44-49', null, 52, null),
  ('1A/1B', '1A', '1B', 'S/S No.10', 'substation', 1000, 'STREET LIGHTING SL10', null, 53, null),
  ('1A/1B', '1A', '1B', 'S/S No.11', 'substation', 1000, 'Girl School', null, 54, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'HOUSE NO 1-031-027', null, 55, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'HOUSE NO 1-024.026.022.021.20.019', null, 56, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'HOUSE NO1-018.016.014.012.010', null, 57, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'HOUSE NO 1-017.015.013.011.009', null, 58, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'HOUSE NO1-008-005', null, 59, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'IRRIGATION PUMPING STATION -A', null, 60, null),
  ('1A/1B', '1A', '1B', 'S/S No.12', 'substation', 1000, 'STREET LIGHTING SL12', null, 61, null),
  ('1A/1B', '1A', '1B', 'S/S No.13', 'substation', 1000, 'HOUSE NO 1-032-037', null, 62, null),
  ('1A/1B', '1A', '1B', 'S/S No.13', 'substation', 1000, 'HOUSE NO 1-038.2-046.044.042.040', null, 63, null),
  ('1A/1B', '1A', '1B', 'S/S No.13', 'substation', 1000, 'HOUSE NO 2-051-056', null, 64, null),
  ('1A/1B', '1A', '1B', 'S/S No.13', 'substation', 1000, 'HOUSE NO 2-047-050', null, 65, null),
  ('1A/1B', '1A', '1B', 'S/S No.13', 'substation', 1000, 'STREET LIGHTING SL13', null, 66, null),
  ('2A/2B', '2A', '2B', 'S/S No.14', 'substation', 1000, 'Guest accomaddation', null, 67, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, 'HOUSE NO 218-223(4-084,088.5-089)', null, 68, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, 'HOUSE NO 224-229(5-090,095)', null, 69, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, 'HOUSE NO 230-234 (5-096,100)', null, 70, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, '364-369(ABCDEF)(3BD/3ST APARTMENTS)', null, 71, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, '370-375(5-2ABCDEF)(3BD/3ST APARTMENT', null, 72, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, '376-381(5-3ABCDEF)(3DB/3ST APARTMENT )', null, 73, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, 'STREET LIGHTING', null, 74, null),
  ('2A/2B', '2A', '2B', 'S/S No.15', 'substation', 1000, 'GUARD HOUSE', null, 75, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '400-405 2BD/EST APARTMENTS 6-7 ,ABCDEF', null, 76, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '406-411   3BD/3EST APARTMENTS 6-8 ABCDEF', null, 77, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '412-417 3BD/3ST APARTMENTS 6-9.ABCDEF', null, 78, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, 'MUSALLAH -3', null, 79, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '424-429  3BD/3ST APARTMENTS 6-11 ABCDEF', null, 80, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '448-453 3BD/3ST APARTMENTS  6-13 .ABCDEF', null, 81, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '418-423 2BD/EST APARTMENTS 6-10 ABCDEF', null, 82, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '382-387 2BD/3ST APARTMENTS 6-4. ABCDEF', null, 83, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '388-393 3BD/3ST APARTMENTS  6-5.ABCDEF', null, 84, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, '394-399 3BD /3ST APARTMENTS 6-6 .ABCDEF', null, 85, null),
  ('2A/2B', '2A', '2B', 'S/S No.16', 'substation', 1000, 'STREET LIGHTING', null, 86, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '490-495 2BD/3ST APARTMENTS 6-22 ABCDEF', null, 87, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '484-489 2BD/3ST APARTMENTS 6-21.ABCDEF', null, 88, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '472-477 2BD/3ST APARTMENTS 6-20 ABCDEF', null, 89, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '466-471 2BD/3ST APARTMENTS 6-19 ABCDEF', null, 90, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '442-447 2BD/3ST APARTMENTS 6-12 ABCDEF', null, 91, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '460-465 2BD /3ST APARTMENTS 6-18 ABCDEF', null, 92, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '430-435 2BD/3ST APARTMENTS 6-16 ABCDEF', null, 93, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '436-441 2BD/3ST APARTMENTS 6-17 ABCDEF', null, 94, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '454-459 2BD/3ST APARTMENTS 6-14 ABCDEF', null, 95, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, '478-483 2BD/3ST APARTMENTS 6-15 ABCDEF', null, 96, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, 'STREET LIGHTING', null, 97, null),
  ('2A/2B', '2A', '2B', 'S/S No.17', 'substation', 1000, 'U/G GARAGE', null, 98, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'HOUSE NO 242-247(7-114,119)', null, 99, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'HOUSE NO 248-253(7-120,124,109)', null, 100, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'HOUSE NO 259-262(7-125,126,127,8-128)', null, 101, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'HOUSE NO 254,258,235(7-108.107.105.103.5-101)', null, 102, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'HOUSE NO 236-241(7-102.104.110.111.112.113)', null, 103, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'IRRIGATIN PUMPING STATION C', null, 104, null),
  ('2A/2B', '2A', '2B', 'S/S No.18', 'substation', 1000, 'STREET LIGHTING', null, 105, null),
  ('2A/2B', '2A', '2B', 'S/S No.19', 'substation', 500, 'kg1', null, 106, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE NO 207.209.214-217(8-144.142.138.139.140.141)', null, 107, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE NO 195.197.199.201.203.205(10-186.184.182.180.178.176)', null, 108, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE NO 206.208.210-213 (8-145.143.137.136.135.134)', null, 109, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE  NO 263.354-357(8-133.147.148.149.132)', null, 110, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE NO 194.196.198.200.202.204(10-187.185.183.181.179.177', null, 111, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'STREET LIGHTING', null, 112, null),
  ('2A/2B', '2A', '2B', 'S/S No.20', 'substation', 1000, 'HOUSE NO 340.342.344.346.348(10-171.173.175.)(9-161.159)', null, 113, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'HOUSE NO 347-353(9-160-155,8-146)', null, 114, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'HOUSE NO 270-271,276-278(9-153.154,10-169.168.167', null, 115, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'HOUSE NO 272.273.274(9-165.164.163)', null, 116, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'HOUSE NO 275.277.279.341.343.345(9-165,10-168.166.170.172.174)', null, 117, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'HOUSE NO 264-269(8-129.130.131,8-150.151.152)', null, 118, null),
  ('2A/2B', '2A', '2B', 'S/S No.21', 'substation', 1000, 'STREET LIGHTING', null, 119, null),
  ('2A/2B', '2A', '2B', 'S/S No.22', 'substation', 1000, 'family recreation center and supermarket', null, 120, null),
  ('2A/2B', '2A', '2B', 'S/S No.23', 'substation', 1000, 'Boys school', null, 121, null),
  ('1E', '1E', null, 'ETR-09', 'transformer', 150, 'Street light', null, 122, null),
  ('1E', '1E', null, 'ETR-11', 'transformer', 400, 'OFFICE Building No. 26 - AHU''s, Lighting and Power Outlet', '26', 123, null),
  ('1E', '1E', null, 'ETR-10', 'transformer', 1000, 'OFFICE Building No. 26 - AHU''s, Lighting and Power Outlet', '26', 124, null),
  ('1E', '1E', null, 'GTR-1', 'transformer', 2000, 'Building No. 45 - Chillers, HVAC, Small Power, Lighting', '45', 125, null),
  ('1E', '1E', null, 'GTR-2', 'transformer', 2000, 'Building No. 45 - Chillers, HVAC, Small Power, Lighting', '45', 126, null),
  ('1E', '1E', null, 'LH1', 'transformer', 75, 'CP1 - Main Road Street Lighting', null, 127, null),
  ('1E', '1E', null, 'LH2', 'transformer', 75, 'CP2 - Main Road Street Lighting', null, 128, null),
  ('1E', '1E', null, 'ESS', 'transformer', 315, 'East Sewage Station - Sewage Pump and East Guard House', null, 129, null),
  ('1E', '1E', null, 'WSS', 'transformer', 75, 'Storm Water Station - Storm Water Pump', null, 130, null),
  ('2E', '2E', null, 'ETR-06', 'transformer', 500, 'Building No. 13 - MV Switchgear Control Panel and Back-up DC System, Lighting, AC and Power Outlet', '13', 131, null),
  ('2E', '2E', null, 'ETR-06', 'transformer', 500, 'Building No. 12 - Generator Control Panel, Lighting, AC and Power Outlet', '12', 132, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-12', 'transformer', 500, 'Building No. 25 - Irrigation Pump Station and Deep Well Pump', '25', 133, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-13', 'transformer', 800, 'Building No. 27 - Package Unit, Lighting and Power Outlet', '27', 134, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-13', 'transformer', 800, 'Building No. 28 - Package Unit, Lighting and Power Outlet', '28', 135, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-05', 'transformer', 150, 'Building No. 10', '10', 136, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-05', 'transformer', 150, 'Building No. 11 - Lighting and Power Outlet', '11', 137, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-04', 'transformer', 1000, 'Building No. 08 - Turbine Water Pump, Diesel Engine Controller 1 & 2, Dosing Pump, Exhaust Fan, Lighting and Power Outlet', '8', 138, null),
  ('2EA/2EB', '2EA', '2EB', 'ETR-04', 'transformer', 1000, 'Building No. 05 - BMS, Communication, IT, Security, Firealarm Data Cabinet, AHU 05-03', '5', 139, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-01', 'transformer', 1000, 'Building No. 01 - Data Center Loads', '1', 140, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-01', 'transformer', 1000, 'Building No. 02 - Data Center Loads', '2', 141, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-02', 'transformer', 500, 'Chiller Plant No. 1 - Chiller No. 4', null, 142, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-03', 'transformer', 500, 'Chiller Plant No. 1 - Chiller No. 4', null, 143, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-14', 'transformer', 1500, 'Building No. 29 - Package Unit, Lighting and Power Outlet', '29', 144, null),
  ('3EA/3EB', '3EA', '3EB', 'ETR-15', 'transformer', 800, 'Building No. 29 - Package Unit, Lighting and Power Outlet', '29', 145, null),
  ('3A/3B', '3A', '3B', 'NTR-01', 'transformer', 1500, 'Building No. 01', '1', 146, null),
  ('3A/3B', '3A', '3B', 'NTR-01', 'transformer', 1500, 'Building No. 02', '2', 147, null),
  ('3A/3B', '3A', '3B', 'NTR-02', 'transformer', 1000, 'Building No. 03', '3', 148, null),
  ('3A/3B', '3A', '3B', 'NTR-03', 'transformer', 1500, 'Building No. 15', '15', 149, null),
  ('3A/3B', '3A', '3B', 'NTR-04', 'transformer', 1500, 'Chiller Plant No. 1', null, 150, null),
  ('3A/3B', '3A', '3B', 'NTR-05', 'transformer', 1500, 'Chiller Plant No. 1', null, 151, null),
  ('3A/3B', '3A', '3B', 'NTR-16', 'transformer', 1000, 'Building No. 15 Power extension', '15', 152, null),
  ('4A/4B', '4A', '4B', 'NTR-26', 'transformer', 2500, 'Building No. 43', '43', 153, null),
  ('4A/4B', '4A', '4B', 'NTR-27', 'transformer', 1600, 'Building No. 43', '43', 154, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('4A/4B', '4A', '4B', 'NTR- 28', 'transformer', 2500, 'Building No. 43', '43', 155, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('4A/4B', '4A', '4B', 'NTR- 29', 'transformer', 2500, 'Building No. 44', '44', 156, null),
  ('4A/4B', '4A', '4B', 'NTR-30', 'transformer', 1600, 'Building No. 44', '44', 157, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('4A/4B', '4A', '4B', 'NTR-31', 'transformer', 2500, 'Building No. 44', '44', 158, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('4A/4B', '4A', '4B', 'NTR-22', 'transformer', 1000, 'CHILLERS FOR BUILDING - 44', '44', 159, null),
  ('4A/4B', '4A', '4B', 'NTR-23', 'transformer', 1000, 'CHILLERS FOR BUILDING - 44', '44', 160, null),
  ('4A/4B', '4A', '4B', 'NTR-24', 'transformer', 1000, 'CHILLERS FOR BUILDING - 43', '43', 161, null),
  ('4A/4B', '4A', '4B', 'NTR-25', 'transformer', 1000, 'CHILLERS FOR BUILDING - 43', '43', 162, null),
  ('5A/5B', '5A', '5B', 'NTR-14', 'transformer', 1000, 'Building No. 31', '31', 163, null),
  ('5A/5B', '5A', '5B', 'NTR-33', 'transformer', 1500, 'Building No. 46', '46', 164, null),
  ('5A/5B', '5A', '5B', 'NTR-34', 'transformer', 1500, 'Building No. 46', '46', 165, null),
  ('5A/5B', '5A', '5B', 'NTR-32', 'transformer', 2000, 'Building No. 38', '38', 166, null),
  ('5A/5B', '5A', '5B', 'NTR-15', 'transformer', 1500, 'Chiller Plant No. 4', null, 167, null),
  ('5A/5B', '5A', '5B', 'NTR-19', 'transformer', 1500, 'Building No. 35', '35', 168, null),
  ('5A/5B', '5A', '5B', 'NTR- 20', 'transformer', 1000, 'Building No. 36', '36', 169, null),
  ('5A/5B', '5A', '5B', 'NTR- 21', 'transformer', 1000, 'Chiller Plant No. 3', null, 170, null),
  ('6A/6B', '6A', '6B', 'TR.A1', 'transformer', 1600, 'Laboratory Complex (Building No. 17)', '17', 171, null),
  ('6A/6B', '6A', '6B', 'TR.A2', 'transformer', 630, 'Laboratory Complex (Building No. 17)', '17', 172, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.B1', 'transformer', 1250, 'Laboratory Complex (Building No. 17)', '17', 173, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.B2', 'transformer', 630, 'Laboratory Complex (Building No. 17)', '17', 174, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.C1', 'transformer', 1600, 'Laboratory Complex (Building No. 17)', '17', 175, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.C2', 'transformer', 630, 'Laboratory Complex (Building No. 17)', '17', 176, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.E1', 'transformer', 1600, 'Laboratory Complex (Building No. 17)', '17', 177, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.E2', 'transformer', 630, 'Laboratory Complex (Building No. 17)', '17', 178, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.F1', 'transformer', 1250, 'Laboratory Complex (Building No. 17)', '17', 179, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'TR.F2', 'transformer', 630, 'Laboratory Complex (Building No. 17)', '17', 180, 'الحمل غير مذكور صراحةً أمام هذا المحول في ملف المصدر؛ مُستنتج من المحول السابق في نفس المغذي — يحتاج تأكيدًا.'),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.1', 'transformer', 1000, 'High Bay Laboratory (Building No.18)', '18', 181, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.1', 'transformer', 1000, 'Waste Store (Building No.19 & 24)', '19,24', 182, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.1', 'transformer', 1000, 'Utility Building (Building No.20)', '20', 183, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.2', 'transformer', 2500, 'Drum / Solvent / Sample St. (Building No.21)', '21', 184, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.2', 'transformer', 2500, 'Central Store (Building No.22)', '22', 185, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.2', 'transformer', 2500, 'Gas Cylinder Store (Building No.23)', '23', 186, null),
  ('6A/6B', '6A', '6B', 'UTILITY TR-U.2', 'transformer', 2500, 'Building No. 25', '25', 187, null),
  ('6A/6B', '6A', '6B', 'ETR-DGL', 'transformer', 1000, 'Waste Store', null, 188, null),
  ('7A/7B', '7A', '7B', 'NTR-17', 'transformer', 1500, 'Building No. 40', '40', 189, null),
  ('7A/7B', '7A', '7B', 'NTR-18', 'transformer', 1500, 'Building No. 40', '40', 190, null),
  ('7A/7B', '7A', '7B', 'NTR-18', 'transformer', 1500, 'Building No. 40/NPAT', '40', 191, null),
  ('7A/7B', '7A', '7B', 'TR.1', 'transformer', 2500, 'Building 33 Clean Room', '33', 192, null),
  ('7A/7B', '7A', '7B', 'TR.2', 'transformer', 2500, 'Building 33 Clean Room', '33', 193, null),
  ('7A/7B', '7A', '7B', 'PSS.1', 'transformer', 2000, 'Chiller Plant 4A', null, 194, null),
  ('7A/7B', '7A', '7B', 'PSS.2', 'transformer', 2000, 'Chiller Plant 4A', null, 195, null),
  ('7A/7B', '7A', '7B', 'TR-34', 'transformer', 1000, 'NCUB', null, 196, null),
  ('8A/8B', '8A', '8B', 'NTR-06', 'transformer', 1500, 'Administration Building', null, 197, null),
  ('8A/8B', '8A', '8B', 'NTR-06', 'transformer', 1500, 'Public Work Yard', null, 198, null),
  ('8A/8B', '8A', '8B', 'NTR-06', 'transformer', 1500, 'Supply Warehouse', null, 199, null),
  ('8A/8B', '8A', '8B', 'NTR-07', 'transformer', 1500, 'Building 09', '9', 200, null),
  ('8A/8B', '8A', '8B', 'NTR-08', 'transformer', 1500, 'Chiller Plant No. 2', null, 201, null),
  ('8A/8B', '8A', '8B', 'NTR-09', 'transformer', 1500, 'Chiller Plant No. 2', null, 202, null),
  ('8A/8B', '8A', '8B', 'NTR-10', 'transformer', 1500, 'Chiller Plant No. 2', null, 203, null),
  ('8A/8B', '8A', '8B', 'NTR-11', 'transformer', 1500, 'Chiller Plant No. 2', null, 204, null),
  ('8A/8B', '8A', '8B', 'NTR-12', 'transformer', 1500, 'Chiller Plant No. 2', null, 205, null),
  ('8A/8B', '8A', '8B', 'NTR-XXX (NDT)', 'transformer', 2500, 'Building 07', '7', 206, null),
  ('9A/9B', '9A', '9B', 'NTR-40', 'transformer', 1500, 'Headquarter Building', null, 207, null),
  ('9A/9B', '9A', '9B', 'NTR-41', 'transformer', 1500, 'Headquarter Building', null, 208, null),
  ('9A/9B', '9A', '9B', 'NTR-42', 'transformer', 1500, 'Headquarter Building', null, 209, null),
  ('9A/9B', '9A', '9B', 'NTR-37', 'transformer', 2000, 'Chiller Yard', null, 210, null),
  ('9A/9B', '9A', '9B', 'NTR-38', 'transformer', 2000, 'Chiller Yard', null, 211, null),
  ('9A/9B', '9A', '9B', 'NTR-39', 'transformer', 2000, 'Chiller Yard', null, 212, null),
  ('9A/9B', '9A', '9B', 'NTR-40', 'transformer', 1500, 'RSL', null, 213, null),
  ('9A/9B', '9A', '9B', 'NTR-43', 'transformer', 1000, 'Multi-Storey Carpark', null, 214, null)
on conflict do nothing;

commit;

-- =========================================================================
-- أمثلة استعلام
-- =========================================================================
-- أي أحمال تتأثر لو عُزلت الحلقة التي ينتمي إليها المغذي 6B؟
-- select substation_code, capacity_kva, load_description
-- from v_mv_feeder_loads where feeder_code = '6B' order by substation_code;
--
-- إجمالي القدرة المركبة لكل حلقة:
-- select loop_code, sum(distinct_cap) from (
--   select distinct loop_code, substation_code, capacity_kva as distinct_cap from mv_loop_loads
-- ) t group by loop_code order by 2 desc;
--
-- المباني المرتبطة بكل مغذي:
-- select feeder_code, string_agg(distinct building_numbers, ', ')
-- from v_mv_feeder_loads where building_numbers is not null group by feeder_code order by 1;
