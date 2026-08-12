TEST EDIT / DELETE PATCH

1) Supabase SQL Editor:
   Run: supabase/patch_test_edit_delete_permissions.sql

2) GitHub:
   Upload these TWO code files to the same paths:
   - app/(dashboard)/tests/page.tsx
   - components/tests/TestForm.tsx

Do NOT upload the SQL as a replacement for running it in Supabase.

What changes:
- Edit button appears for non-viewer roles.
- Edit form loads the existing test values.
- Supports building, equipment, type, date, start/end time, interruption duration,
  boolean test checks, result, next test date, readings JSON, notes,
  recommendations, and optional PDF replacement.
- Delete button appears for admin only.
- Database DELETE permission for tests is changed to admin only.
- Deletion uses the existing audit trigger, so the deleted record is logged in audit_logs.

Why hard delete here:
The current project reads tests from several pages (equipment, buildings, reports,
notifications). Using soft delete safely would require changing every one of those
pages at the same time. This patch intentionally avoids that wider/riskier change.
