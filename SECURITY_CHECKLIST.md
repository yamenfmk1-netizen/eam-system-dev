# SECURITY_CHECKLIST.md

هذا المستند يوثّق تنفيذ متطلبات الأمان الإلزامية للنظام، مع الإشارة إلى الملف والآلية الفعلية لكل بند،
وخطوات اختبار حقيقية يمكن تنفيذها يدويًا في Supabase SQL Editor أو عبر واجهة النظام للتحقق من كل ضمان.

**لم يتم الاعتماد على تصميم الواجهة كدليل أمان في أي بند.** كل بند أدناه إما مطبّق عبر RLS/قيود قاعدة بيانات
لا يمكن تجاوزها من العميل، أو عبر تحقق على الخادم (API routes) لا يعتمد على ما يرسله المتصفح.

---

## 1) حماية جميع الصفحات قبل تسجيل الدخول

**التنفيذ:**
- `middleware.ts` + `lib/supabase/middleware.ts`: كل طلب (ما عدا الملفات الثابتة) يمر عبر `updateSession()`، التي تُعيد التوجيه إلى `/login` إذا لم يوجد `user` في الجلسة.
- `app/(dashboard)/layout.tsx`: طبقة تحقق ثانية على مستوى Server Component — يستدعي `supabase.auth.getUser()` ويستخدم `redirect('/login')` إن لم يوجد مستخدم، قبل أي استعلام بيانات.
- لا توجد أي صفحة بيانات تحت `app/(dashboard)/` تعمل بدون المرور بهذا الـ layout.

**كيف تتحقق:** افتح المتصفح في وضع تصفح خاص (بدون جلسة) وحاول الوصول مباشرة إلى `https://yourapp/dashboard` أو `/buildings` — يجب إعادة التوجيه فورًا إلى `/login` دون وميض لأي بيانات.

---

## 2) تعطيل التسجيل العام

**التنفيذ:**
- الكود لا يستدعي `supabase.auth.signUp()` في أي مكان (تحقق: `grep -r "auth.signUp" .` لا يُعيد شيئًا).
- إنشاء الحسابات حصريًا عبر `app/api/users/create/route.ts`، الذي يتحقق أولًا أن الطالب `admin` نشط قبل استخدام `service_role key`.
- **خطوة يدوية إلزامية موثّقة في README** (القسم 2، الخطوة 5): تعطيل "Allow new users to sign up" من إعدادات Supabase Auth، لمنع أي تسجيل مباشر عبر REST API خارج التطبيق.

**كيف تتحقق:** حاول استدعاء `supabase.auth.signUp({email, password})` مباشرة من console المتصفح — يجب أن يفشل بعد تعطيل الإعداد في الخطوة اليدوية أعلاه.

---

## 3) Supabase Authentication بجلسات آمنة + تحقق خادم قبل أي عملية حساسة

**التنفيذ:**
- الجلسات تُدار عبر `@supabase/ssr` (كوكيز HttpOnly تُدار من الخادم، وليس localStorage).
- كل مسار API حساس (`api/users/*`, `api/storage/*`) يستدعي `createClient()` من `lib/supabase/server.ts` ثم `supabase.auth.getUser()` **قبل** تنفيذ أي منطق، ويتحقق من الدور من جدول `profiles` (وليس من أي شيء يرسله العميل).

---

## 4) الأدوار الأربعة

**التنفيذ:** `user_role` enum في `supabase/schema.sql`: `admin`, `engineer`, `technician`, `viewer`. مطابقة لما هو مطلوب حرفيًا.

---

## 5) عدم الاعتماد على إخفاء الأزرار فقط

**التنفيذ:** كل عملية حساسة محمية على 3 مستويات مستقلة:
1. الواجهة تخفي الأزرار غير المتاحة (`lib/auth/permissions.ts`) — تجربة مستخدم فقط.
2. **RLS على قاعدة البيانات** (`supabase/rls_policies.sql` + `security_hardening.sql`) — الطبقة الحقيقية، تمنع الاستعلام مباشرة عبر REST API حتى لو تم تعديل الطلب يدويًا.
3. مسارات API الحساسة (المستخدمون، الرفع) تتحقق من الدور على الخادم بشكل مستقل قبل استخدام أي مفتاح مرتفع الصلاحية.

انظر قسم "الاختبارات" أدناه لسيناريوهات فعلية تثبت أن حذف عنصر من DOM لا يفتح الثغرة.

---

## 6) RLS مفعّل على جميع الجداول بدون استثناء

**التنفيذ:** `alter table ... enable row level security;` مطبّق في `rls_policies.sql` على: `profiles, buildings, equipment, generators, ats_units, ups_units, transformers, tests, maintenance_records, faults, spare_parts, equipment_spare_parts, attachments, notifications, audit_logs`، وفي `security_hardening.sql` على `login_attempts` الجديد.

**كيف تتحقق (SQL Editor):**
```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';
-- تأكد أن relrowsecurity = true لكل جدول بدون استثناء
```

---

## 7) مصفوفة الصلاحيات حسب الدور

| العملية | Admin | Engineer | Technician | Viewer |
|---|---|---|---|---|
| قراءة كل البيانات | ✅ | ✅ | ✅ | ✅ |
| إضافة/تعديل معدات، اختبارات، صيانة | ✅ | ✅ | ✅ | ❌ |
| تعديل عطل | ✅ (أي عطل) | ✅ (أي عطل) | ✅ **فقط الأعطال المسندة إليه** (`responsible_technician = خودُه`) | ❌ |
| إضافة/تعديل مبانٍ | ✅ | ✅ | ❌ | ❌ |
| حذف (Soft Delete) مبنى/معدة | ✅ | ✅ | ❌ (محجوب بـ trigger) | ❌ |
| حذف نهائي (Hard Delete) | ✅ فقط | ❌ | ❌ | ❌ |
| إدارة المستخدمين (إنشاء/تعديل دور/حذف) | ✅ | ❌ | ❌ | ❌ |
| تعديل دوره الخاص | ❌ (محجوب حتى عن نفسه) | ❌ | ❌ | ❌ |

**أين مطبّقة:** دوال `is_admin()`, `can_edit()`, `can_delete()` في `rls_policies.sql`، وسياستا `faults_update_admin_engineer` / `faults_update_technician_assigned` وtrigger `prevent_technician_soft_delete` وtrigger `prevent_self_role_change` في `security_hardening.sql`.

**ملاحظة صادقة عن تجربة الاستخدام:** الواجهة (`app/(dashboard)/faults/page.tsx`) لا تُخفي حاليًا زر تعديل الأعطال غير المسندة عن الفني بشكل استباقي؛ الفني يستطيع الضغط على أي عطل، لكن RLS ترفض عملية الحفظ فعليًا وتظهر رسالة خطأ. هذا يحقق المطلوب أمنيًا (المنع الحقيقي من الخادم/القاعدة)، لكنه تحسين واجهة مستقبلي مقترح: تعطيل الزر مسبقًا للأعطال غير المسندة للفني.

---

## 8–10) Storage خاص + Signed URLs

**التنفيذ:**
- `security_hardening.sql`: كل الـ buckets (`building-images`, `equipment-images`, `documents`, `reports`, `drawings`, `manuals`, `attachments`) أصبحت `public = false` مع `allowed_mime_types` و`file_size_limit` مفروضة على مستوى Supabase نفسه (وليس فقط في الكود).
- سياسات storage.objects: SELECT لأي مستخدم مسجّل دخول فقط، INSERT لمن يحقق `can_edit()`، DELETE لمن يحقق `can_delete()`، **لا توجد سياسة UPDATE** (يمنع استبدال ملف موجود).
- الرفع بالكامل يمر عبر `app/api/storage/upload/route.ts` (خادم) بدل الرفع المباشر من المتصفح، مع تحقق دور + rate limit + نوع + حجم قبل الرفع.
- العرض/التحميل عبر `app/api/storage/signed-url/route.ts` — رابط صالح 60 ثانية فقط، بعد التحقق من الجلسة. المكونات `PrivateImage` و`PrivateFileLink` تستخدمان هذا المسار حصرًا؛ لا يوجد أي `getPublicUrl()` متبقٍّ في الكود.

**كيف تتحقق:**
```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
-- يجب أن public = false للجميع
```
وعمليًا: افتح رابط ملف من قاعدة البيانات (القيمة المخزنة في `file_url` هي مسار وليس رابطًا) وحاول الوصول له مباشرة عبر `https://xxx.supabase.co/storage/v1/object/public/documents/<path>` — يجب أن يفشل (404/403) لأن الـ bucket لم يعد public.

---

## 11–13) عدم تسريب `service_role key`

**التنفيذ:**
- يظهر فقط في: `app/api/users/create/route.ts`, `app/api/users/[id]/route.ts`, `app/api/auth/log-attempt/route.ts` — كلها ملفات خادم (`route.ts` تحت `app/api`)، لا تُشحن أبدًا إلى المتصفح في Next.js.
- **غير موجود** في أي ملف `.tsx` أو أي كود يعمل في المتصفح (تحقق: `grep -rn "SERVICE_ROLE" --include="*.tsx"` لا يُعيد شيئًا).
- `.env.example` يحتوي فقط على placeholder توضيحي (`eyJxxxx...`) وليس مفتاحًا حقيقيًا؛ اسم المتغير موجود فقط ليعرف المطوّر ما يجب توفيره.
- لا يوجد أي متغير سري تحت بادئة `NEXT_PUBLIC_`.

**كيف تتحقق:** `grep -rn "NEXT_PUBLIC" .env.example` — يجب أن يظهر فقط `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_NAME`.

---

## 14) Zod للتحقق من المدخلات (واجهة + خادم)

**التنفيذ:** `lib/validation/schemas.ts` يحتوي مخططات: `createUserSchema`, `updateUserSchema`, `buildingSchema`, `equipmentSchema`, `sparePartSchema`.
- **الواجهة:** مربوطة عبر `zodResolver` في `BuildingForm`, `EquipmentForm`, `SparePartForm`, `UserForm`.
- **الخادم:** `api/users/create` و`api/users/[id]` يستدعيان `schema.safeParse(body)` ويرفضان الطلب بـ 400 إن فشل، بغضّ النظر عمّا أرسله العميل.
- **ملاحظة صادقة:** نماذج الاختبارات/الصيانة/الأعطال (`TestForm`, `MaintenanceForm`, `FaultForm`) لا تزال تستخدم React Hook Form بدون Zod resolver صريح (تحقق حقول أساسي فقط)؛ الحماية الفعلية لهذه الجداول تأتي من قيود CHECK وRLS على مستوى قاعدة البيانات، لكن إضافة Zod resolver هنا تحسين مستقبلي موصى به بنفس النمط المطبّق في BuildingForm.

---

## 15–16) أنواع ملفات مسموحة، حد حجم، أسماء عشوائية

**التنفيذ:**
- `app/api/storage/upload/route.ts`: `allowlist` صارم (`PDF, JPG, JPEG, PNG, XLSX (+ .xls legacy), DOCX (+ .doc legacy)`)، حد 10MB للصور و20MB للمستندات، **مفروض على الخادم** لا يمكن تجاوزه بتعديل طلب المتصفح.
- نفس القيود مكرّرة على مستوى Supabase Storage نفسه (`allowed_mime_types`, `file_size_limit` في `security_hardening.sql`) كطبقة دفاع ثانية مستقلة عن كود التطبيق.
- `safeStorageName()`: كل ملف يُخزَّن باسم `crypto.randomUUID().<ext>` — لا يُحفظ اسم الملف الأصلي في المسار، ما يمنع تعارض الأسماء ومحاولات Path Traversal بالكامل (لا يوجد أي جزء من اسم المستخدم في المسار).
- `signed-url` API يتحقق أيضًا من عدم احتواء المسار على `..` أو بداية بـ `/` كحماية دفاعية إضافية.

---

## 17) Rate Limiting

**التنفيذ:** `lib/rate-limit/index.ts` — Sliding Window داخل الذاكرة، مطبّق على:
- تسجيل الدخول: 5 محاولات/5 دقائق لكل (بريد + IP) — `api/auth/log-attempt`
- رفع الملفات: 20 عملية/5 دقائق لكل مستخدم — `api/storage/upload`
- إنشاء مستخدم: 10/ساعة لكل admin — `api/users/create`
- تعديل/حذف مستخدم: مطبّق أيضًا في `api/users/[id]`
- البحث الشامل في الواجهة: تقليل تلقائي بـ debounce 300ms (تخفيف حمل، وليس Rate Limiting خادم صارم)

**⚠️ محدودية موثّقة بصدق:** هذا التنفيذ In-Memory يعمل بشكل صحيح فقط عند تشغيل نسخة واحدة (instance) من الخادم. في Vercel Serverless الحقيقي متعدد النسخ، الحد **غير موحّد بدقة تامة** عبر كل الطلبات (كل نسخة لها ذاكرتها الخاصة). **للإنتاج الفعلي، يُوصى باستبدال هذا بـ Upstash Redis + `@upstash/ratelimit`**، وهو تغيير محصور في ملف `lib/rate-limit/index.ts` فقط دون أي تعديل على المسارات التي تستدعيه (نفس التوقيع `checkRateLimit(key, limit, windowMs)`). بالإضافة، تم توثيق تفعيل Rate Limiting المدمج في Supabase Auth نفسه (README، خطوة 6) كطبقة حماية مستقلة لا تعتمد على كود التطبيق إطلاقًا.

---

## 18–19) Audit Log غير قابل للتعديل + منع تعديل الدور/سجل التعديلات الذاتي

**التنفيذ:**
- `supabase/audit_triggers.sql`: trigger `log_audit_event()` (SECURITY DEFINER) يسجّل تلقائيًا كل INSERT/UPDATE/DELETE على `buildings, equipment, tests, maintenance_records, faults, spare_parts` مع القيمة القديمة والجديدة.
- `security_hardening.sql`: **حُذفت سياسة INSERT المباشرة على `audit_logs`** — لا يمكن لأي مستخدم عادي إدراج سجل تدقيق مزيّف عبر `supabase.from('audit_logs').insert(...)`؛ الكتابة الوحيدة الممكنة هي عبر الـ trigger نفسه الذي يعمل بصلاحية SECURITY DEFINER ويتجاوز RLS تلقائيًا.
- **لا توجد أي سياسة UPDATE أو DELETE على `audit_logs`** إطلاقًا = غير قابل للتعديل أو الحذف نهائيًا من أي مستخدم مهما كان دوره، بما فيه admin (الحذف النهائي ممكن فقط لمن يملك وصول Postgres مباشر خارج التطبيق).
- محاولات تسجيل الدخول (ناجحة/فاشلة) تُسجَّل في جدول `login_attempts` منفصل (قراءة admin فقط، كتابة عبر service_role حصرًا من `api/auth/log-attempt`).
- إغلاق الأعطال، رفع/تنزيل الملفات، تغيير الصلاحيات: كلها تمر عبر UPDATE/INSERT على الجداول المرتبطة، فتُسجَّل تلقائيًا بنفس الآلية. تغيير الدور تحديدًا له trigger إضافي مخصص (`log_role_change`) يسجّل القيمة القديمة والجديدة صراحة في `table_name = 'profiles_role_change'`.
- `prevent_self_role_change` trigger: يرفض (RAISE EXCEPTION) أي محاولة من مستخدم غير admin لتغيير `role` أو `is_active` **في صفه الخاص هو نفسه**، حتى عبر استدعاء مباشر لـ Supabase REST API خارج الواجهة.

---

## 20) تأكيد قبل الحذف + Soft Delete

**التنفيذ:**
- `components/ui/ConfirmDialog.tsx` مستخدم في كل عمليات الحذف بالواجهة.
- **Soft Delete فعلي** (وليس شكليًا) للمباني والمعدات: عمود `deleted_at`، وحذف الواجهة الآن ينفّذ `UPDATE ... SET deleted_at = now()` بدل `DELETE`. جميع استعلامات القوائم (المباني، المعدات، لوحة التحكم، البحث، التقارير، القوائم المنسدلة في النماذج) تستبعد `deleted_at is not null` صراحة.
- RLS يمنع أيضًا غير الـ admin من رؤية العناصر المحذوفة حتى لو تم تجاوز فلتر الواجهة (`buildings_select_all` / `equipment_select_all` المعدّلتان في `security_hardening.sql`).
- الحذف النهائي (Hard Delete الفعلي عبر `DELETE`) مقيّد بـ RLS لـ admin فقط، وليس مكشوفًا في أي واجهة — إجراء استثنائي عبر SQL Editor مباشرة عند الحاجة الفعلية (مثل الامتثال لطلب حذف بيانات).

---

## 21) Security Headers

**التنفيذ:** `next.config.js` → `headers()` يضيف لكل المسارات: `Content-Security-Policy` (بما فيها `frame-ancestors 'none'`)، `X-Content-Type-Options: nosniff`، `X-Frame-Options: DENY`، `Referrer-Policy: strict-origin-when-cross-origin`، `Permissions-Policy`، `Strict-Transport-Security`.

**كيف تتحقق:** بعد النشر، `curl -I https://yourapp.vercel.app` وتأكد من وجود كل الرؤوس أعلاه.

---

## 22) عدم كشف تفاصيل الأخطاء الداخلية

**التنفيذ:** كل مسارات `app/api/**` (users, storage, auth) تُعيد رسائل عربية عامة للعميل (مثال: "تعذر رفع الملف")، بينما تفاصيل الخطأ الحقيقية (`error.message` من Postgres/Supabase) تُطبع فقط عبر `console.error()` على الخادم ولا تصل للعميل. مثال ملموس: `api/users/create` كان سابقًا يُعيد `error.message` الخام من Supabase، وأصبح الآن يُعيد "تعذر إنشاء المستخدم — قد يكون البريد مستخدمًا مسبقًا" فقط.

**محدودية موثّقة بصدق:** استدعاءات `supabase-js` المباشرة من مكونات العميل (مثل نماذج المباني والمعدات) لا تزال تعرض `err.message` كما يُعاد من PostgREST في بعض حالات `toast.error()`. رسائل RLS من PostgREST عمومًا عامة بطبيعتها ("new row violates row-level security policy") ولا تكشف بنية داخلية حساسة، لكن هذا ليس معقّمًا بنفس صرامة مسارات API. تحسين مستقبلي موصى به: تمرير كل الكتابة عبر API routes بدل استدعاء supabase-js مباشرة من العميل.

---

## 23) فصل بيئة التطوير عن الإنتاج

**موثّق في README:** يُوصى صراحة باستخدام **مشروع Supabase منفصل** لكل من التطوير والإنتاج (مفاتيح مختلفة، قاعدة بيانات مختلفة)، ومتغيرات بيئة منفصلة في Vercel لكل Environment (Production / Preview / Development). هذا إعداد تشغيلي (Infrastructure) خارج نطاق الكود، لا يمكن فرضه من داخل التطبيق نفسه.

---

## 24–25) اختبار فعلي للصلاحيات — 7 سيناريوهات إلزامية

⚠️ **لم يتم تشغيل هذه الاختبارات فعليًا في هذه الجلسة** لأن بيئة التطوير هنا لا تملك اتصال إنترنت ولا مشروع Supabase فعلي متصل. الخطوات أدناه **قابلة للتنفيذ الفعلي والتكرار** من طرفك في Supabase SQL Editor أو عبر أدوات مثل curl/Postman بعد النشر، ويجب تنفيذها قبل اعتبار النظام جاهزًا للإنتاج.

### أ) مستخدم Viewer يحاول إضافة/تعديل سجل
```sql
-- في SQL Editor، محاكاة جلسة مستخدم viewer:
select set_config('request.jwt.claims', json_build_object('sub', '<viewer_user_id>', 'role', 'authenticated')::text, true);
set role authenticated;
insert into buildings (building_number, name, status) values ('TEST-1', 'اختبار', 'ready');
-- المتوقع: ERROR: new row violates row-level security policy for table "buildings"
```

### ب) فني (technician) يحاول حذف مبنى (Soft Delete)
```sql
select set_config('request.jwt.claims', json_build_object('sub', '<technician_user_id>')::text, true);
set role authenticated;
update buildings set deleted_at = now() where id = '<any_building_id>';
-- المتوقع: ERROR: لا تملك صلاحية حذف هذا السجل (من trigger prevent_technician_soft_delete)
```

### ج) مهندس (engineer) يحاول إنشاء Admin
```
POST /api/users/create  (بجلسة engineer)
Body: { "full_name": "Test", "email": "x@x.com", "password": "12345678", "role": "admin" }
-- المتوقع: HTTP 403 { "error": "هذا الإجراء متاح لمدير النظام فقط" }
```
تحقق إضافي أن هذا لا يعتمد على الواجهة: نفّذ الطلب مباشرة عبر curl بكوكيز جلسة engineer، وليس من داخل صفحة "المستخدمون" (والتي أصلًا لا تظهر لغير admin بسبب الفلترة في `Sidebar.tsx`، لكن المسار نفسه محمي بشكل مستقل).

### د) مستخدم غير مسجّل يحاول قراءة البيانات
```bash
curl "https://<project>.supabase.co/rest/v1/buildings?select=*" \
  -H "apikey: <anon_key>"
# بدون Authorization header بجلسة صالحة
# المتوقع: [] فارغة أو خطأ صلاحية — RLS يشترط auth.uid() is not null في كل سياسات SELECT
```

### هـ) مستخدم يحاول الوصول مباشرة إلى ملف خاص
```bash
curl -I "https://<project>.supabase.co/storage/v1/object/public/documents/<known-path>.pdf"
# المتوقع: 400/404 لأن الـ bucket لم يعد public — لا يوجد مسار "public" صالح لهذه الـ buckets بعد الآن
```

### و) مستخدم يحاول تغيير دوره من خلال API
```sql
select set_config('request.jwt.claims', json_build_object('sub', '<own_user_id>')::text, true);
set role authenticated;
update profiles set role = 'admin' where id = '<own_user_id>';
-- المتوقع: ERROR: غير مسموح بتغيير الدور الخاص بك (من trigger prevent_self_role_change)
```
وعبر API: `PATCH /api/users/<own_id>` بجسم `{"role":"admin"}` حتى لو المستخدم admin أصلًا يحاول تعديل نفسه بحقل role مختلف → `400 لا يمكنك تغيير دورك الخاص`.

### ز) مستخدم يحاول الوصول إلى بيانات عبر تعديل الطلب يدويًا (IDOR)
```bash
# محاولة جلب/تعديل سجل equipment ينتمي لمبنى لا علاقة له بالمستخدم عبر تخمين UUID
curl -X PATCH "https://<project>.supabase.co/rest/v1/equipment?id=eq.<random_uuid>" \
  -H "apikey: <anon_key>" -H "Authorization: Bearer <viewer_jwt>" \
  -H "Content-Type: application/json" -d '{"status":"fault"}'
# المتوقع: RLS يرفض التحديث بغض النظر عن صحة الـ UUID، لأن دور viewer لا يحقق can_edit()
```

**التوصية:** حوّل السيناريوهات أعلاه إلى اختبارات آلية (مثال: pgTAP أو سكربت Node.js يستخدم `@supabase/supabase-js` بحسابات اختبار حقيقية لكل دور) وشغّلها في CI قبل كل نشر إنتاج.

---

## 26) `npm run build` بدون أخطاء

⚠️ **إفصاح صريح ودقيق:** بيئة التنفيذ **لا تملك اتصال إنترنت**، فلم أستطع تشغيل `npm install` الحقيقي ولا `npm run build` أو `next lint` كما هما فعليًا (يحتاجان تحميل كل حزمة من npm registry).

**ما تم فعليًا كبديل هندسي حقيقي (وليس ادّعاءً):** كتبت ملف تعريفات TypeScript مؤقتًا (`stub-externals.d.ts`، تم **حذفه** من النسخة النهائية) يُعرّف الشكل الدقيق لكل حزمة خارجية مستخدمة (next, react, @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, lucide-react، إلخ) بدون تثبيتها فعليًا، ثم شغّلت `tsc --noEmit` الحقيقي (نسخة TypeScript مثبّتة فعليًا في بيئة الفحص) على **كل كود المشروع** ضد هذه التعريفات. هذا يكشف فعليًا: استيرادات مكسورة، متغيرات غير معرّفة، أخطاء JSX، تعارض في props، تعارض أنواع. **النتيجة: 0 أخطاء (exit code 0)** بعد إصلاح كل ما ظهر تكراريًا.

**ما هذا الفحص لا يغطيه** (وبالتالي لا يزال يجب تشغيل الأوامر الحقيقية محليًا قبل الإنتاج):
- توافق الإصدارات الفعلية للحزم مع بعضها (peer dependencies)
- قواعد ESLint نفسها (لم يُشغَّل `next lint` فعليًا، رغم إضافة `.eslintrc.json` الناقص سابقًا)
- أخطاء وقت التشغيل (Runtime) في المتصفح أو الخادم
- سلوك Next.js الفعلي عند البناء (تحسين الصور، تقسيم الحزم، توليد الصفحات الثابتة/الديناميكية)

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
```
شغّل هذه الأوامر الأربعة بالترتيب محليًا أو في GitHub Actions قبل أي نشر إنتاج. التفاصيل الكاملة لخطوات النشر في `DEPLOYMENT_GUIDE.md`.

---

## 27) هذا الملف

أنت تقرأه الآن. يُحدَّث هذا الملف يدويًا كلما تغيّرت آلية أمان جوهرية في المشروع.

---

## ملخص الملفات المرجعية

| الغرض | الملف |
|---|---|
| سكيما + RLS أساسية | `supabase/schema.sql`, `supabase/rls_policies.sql` |
| سجل التعديلات التلقائي | `supabase/audit_triggers.sql` |
| **كل تشديدات هذا المستند** | `supabase/security_hardening.sql` |
| Rate Limiting | `lib/rate-limit/index.ts` |
| تحقق المدخلات | `lib/validation/schemas.ts` |
| رفع آمن على الخادم | `app/api/storage/upload/route.ts` |
| روابط موقّتة | `app/api/storage/signed-url/route.ts` |
| إدارة مستخدمين آمنة | `app/api/users/create/route.ts`, `app/api/users/[id]/route.ts` |
| تسجيل محاولات الدخول | `app/api/auth/log-attempt/route.ts` |
| رؤوس الأمان | `next.config.js` |
