# SchoolPulseOS productivity and go-live handoff

## Implemented in this pass

### Two-way threaded messaging

- Added `message_threads`, `message_thread_members`, and `message_thread_messages`.
- Added RLS so only thread participants can read or reply.
- Replaced the static Connect screen with conversation lists, message history, new-thread creation, and replies.

### Fee due reminders

- Added `students.fee_due_at`.
- Added `fee_due_email` and `fee_due_sms` notification preferences.
- Added server-side `sendFeeDueReminders` using the existing SendGrid/Twilio delivery pipeline.
- Added an admin/bursar action to process balances due within three days.
- Every reminder is written to `notification_outbox` and `activity_events`.

> A true native push channel still requires a browser push provider and VAPID/FCM configuration. This pass deliberately does not claim push delivery where no provider is configured.

### Bulk attendance

- Added server-side `recordBulkAttendance`.
- Added class filter and bulk status controls to the Attendance page.
- Supported statuses remain `present`, `absent`, `late`, and `checked_out`.
- Bulk actions create an auditable `bulk-attendance-update` event.

### PDF receipts

- Paystack payment records now download as valid `.pdf` receipts rather than `.txt` files.
- Receipt includes student, amount, method, status, date, and Paystack reference.
- Receipt download remains client-side and does not expose any Paystack secret.

### Expiring student registration codes

- New student records receive a random eight-character code valid for 72 hours.
- The code is shown once to the administrator after registration.
- Codes are rejected after expiry or after use.
- Successful parent/student registration consumes the code.

### Homework submissions

- Added `homework_submissions` with one submission per student/assignment.
- Students can submit text work from the Student portal.
- Teachers/admins can read and grade submissions through RLS-scoped records.

### Classes and subjects

- Added `school_classes` and `class_subjects`.
- Added nullable `class_id` and `subject_id` links to students, results, and assignments.
- Existing `class_name` and `subject` fields remain for backwards compatibility during migration.

### Report cards

- Added `term_report_cards` snapshots.
- Reports page can load results for a student and term, save a snapshot, and open a formatted print/PDF export view.

### Audit logging

- Added action, target type, target ID, and metadata fields to `activity_events`.
- Attendance bulk operations, fee reminder runs, student registration, staff changes, and visitor actions now record actor-aware activity entries.

## Database migrations

Apply in order:

1. `supabase/migrations/20260930070000_role_enum.sql`
2. `supabase/migrations/20260930070001_role_portals.sql`
3. `supabase/migrations/20260930080000_productivity_features.sql`

## Go-live security actions

These are intentionally not performed from source code because they change external account security or credentials:

1. **Rotate all credentials used during testing**: Twilio Account SID/Auth Token/Verify Service SID, SendGrid API key, Paystack secret key, and Supabase service-role key. Revoke the old keys after deployment.
2. In Supabase Dashboard, enable **Authentication → Providers → Email → Confirm email**.
3. Confirm the production email redirect URL points only to the verified application domain.
4. Keep all provider secrets in server-side environment variables only:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SENDGRID_API_KEY`
   - `SENDGRID_FROM_EMAIL`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`
   - `TWILIO_VERIFY_SERVICE_SID`
   - `PAYSTACK_SECRET_KEY`
5. Before opening fee reminders to staff, set `fee_due_at` for real student balances and verify SendGrid/Twilio sender identities.
6. Test RLS with separate admin, principal, teacher, bursar, security, parent, and student accounts in separate schools.

## Validation

- `npm run build`: passed.
- Changed-file TypeScript diagnostics: none after the final correction.
- Live route checks:
  - `/sign-in`: `200`
  - protected operations routes: `307` to sign-in without an authenticated session
  - `/portal/student`: `200` route shell

## Not fabricated

Library, health records, native push, and real GPS telemetry remain setup-required. The schema and portal states make those boundaries explicit rather than pretending those integrations are live.
