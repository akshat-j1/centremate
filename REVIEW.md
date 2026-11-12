# CentreMate MVP implementation review

This review changed local application code, migrations, documentation and tests only. No cloud project, production database, OAuth configuration, environment variable, deployment or paid service was changed.

| Original requirement                          | Implementation status                                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sign-in and callback                   | Implemented, with a safe return-path cookie preserving centre/exam/admin navigation. Live provider credentials and login remain external setup/testing tasks.                                                        |
| Upcoming exam selection                       | Active exams, with selected/registered archived exams retained for managing plans. No official dates are invented.                                                                                                   |
| Centre search, counts and share links         | Implemented. Name/address search, consent-filtered counts for approved users, selected exam in share URL, Maps directions, invalid-link states.                                                                      |
| Student registration/profile editing/deletion | Implemented with validated name, hostel, departure time, optional WhatsApp, explicit directory consent, one registration per email/exam, and private Form-record claiming.                                           |
| Group by centre, never hostel                 | Both hostels share one centre directory. Everyone/Going/Returning filters never partition by hostel.                                                                                                                 |
| Optional WhatsApp                             | Only approved students registered at the same exam/centre can retrieve an opted-in contact. No public email/phone directory.                                                                                         |
| Ready to Return                               | PostgreSQL-issued two-hour status, cancellation, automatic expiry projection, preserved on profile edit, cleared on centre/exam move.                                                                                |
| Missing centres                               | Student request, admin review, verified centre creation and request resolution.                                                                                                                                      |
| CSV Form import                               | Question-column mapping, exam/centre defaults, unique verified centre-name resolution, preview, validation and accurate inserted/skipped counts. Always private; contacts/consent ignored.                           |
| Automatic Sheets sync                         | Apps Script prepared and locally tested. Supports column/default/centre mappings and either Form-submit or scheduled triggers. Needs the real Sheet, trigger authorization and configured server secrets.            |
| Form/website deduplication                    | Normalized email/exam uniqueness, non-overwriting repeated imports, claiming imported records and deletion suppression so sync cannot resurrect deleted plans. Deliberate website re-registration is allowed.        |
| Protected admin                               | Database-enforced admin role; exams, centres, archive/activate, access allowlists/exceptions, centre requests and imports. Structured edit forms replace prompts.                                                    |
| Approved Scaler access                        | Verified email, exact configurable domain allowlist and admin/email exceptions; closed by default. Schema supports future access expansion without replacing the app.                                                |
| Mobile UI                                     | Responsive light/navy/blue layout, centre cards, route illustration, accessible native dialogs, clear form errors, loading/retry/empty states and reduced-motion styles. Real-device visual testing remains pending. |
| Supabase RLS/privacy                          | Isolated PostgreSQL tests exercise actual RLS and RPCs. Production verification SQL is read-only; no hosted Auth fixtures.                                                                                           |

## Fixes from this review

- Preserve the selected centre/exam after Google login and reject external callback redirects.
- Put form errors inside the active dialog and validate contact/name/time values.
- Prevent stale directory responses and exam changes during registration mutations.
- Use database time for return-status writes; clear readiness when moving centres.
- Make raw Form CSV import practical and show actual inserted/skipped results.
- Map raw Sheet questions/defaults safely, batch syncs, lock overlapping triggers and keep private errors out of responses.
- Honor student deletion across future imports using only a private exam/email-hash suppression key.
- Add an additive workflow migration; the already-applied initial migration is unchanged.

## Remaining production gates

1. Resume the existing setup script after this review to apply all pending migrations and configure production variables. The new workflow migration has been tested locally but has not been applied to Supabase.
2. Configure Google OAuth for `clnwwhadsalezsdmamsf`, complete real Google sign-in on production, and confirm the approved account returns to its chosen centre/exam.
3. Configure actual exams and verified centres through the protected admin. Test two approved accounts from different hostels at one centre, plus an unapproved account.
4. Install/authorize Apps Script on the real response Sheet if automatic syncing is desired. Verify first import, repeated import, website claim, consent withdrawal, deletion and sync-after-deletion.
5. Complete real mobile-browser checks for registration, sharing, Maps and WhatsApp handoff.

The implementation is ready for these production tests after infrastructure configuration. A successful local test suite or frontend load does not establish a working production launch.

## Completed local validation

- TypeScript typecheck: passed.
- ESLint: passed without warnings.
- JavaScript/UI suite: 27 tests passed, including DOM interaction tests for registration errors/private saves, both-hostel listings and return status, OAuth navigation, and admin Form mapping/import.
- PostgreSQL: 46 authorization/privacy/workflow assertions passed in a dedicated local Docker database against both migrations. Read-only verification SQL also passed there. No hosted Auth users or production test fixtures were created.
- Production build: `npm run build -- --webpack` passed. Webpack avoids the sandbox port-binding restriction encountered with Turbopack.
- `git diff --check`: passed.
- Browser automation host was unavailable and the native Chrome fallback timed out. Actual mobile/desktop visual checks and external Google/WhatsApp/Maps handoff testing remain pending.

No setup script, migration push, Git push or deployment was performed during this review. Changes remain local for the next infrastructure-resume step.
