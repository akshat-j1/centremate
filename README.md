# CentreMate

A mobile-first coordination app for Scaler students taking IITM BS examinations. Students are grouped by **exam and exam centre**, with Uni 1 and Uni 2 together.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Requires Node.js 22 or 24. Add the new project's Supabase URL and public anon/publishable key to `.env.local`. Never use a service-role key in a `NEXT_PUBLIC_` variable. With no Supabase configuration the site renders a clear setup state, with sign-in and private data unavailable.

## Resume the existing infrastructure

Run from the authenticated Mac Terminal:

```zsh
cd /Users/akshatjain/Documents/groupyy
node scripts/setup-infrastructure.mjs --resume
```

The script is pinned to Supabase project `clnwwhadsalezsdmamsf` in organization `wlvfxeuxgdybfxthizwy`, the existing `akshat-j1/centremate` repository, and Vercel project `prj_FQICpl1AG2W5p3GTwZKt9eF8GjiV`. It cannot create replacement projects or repositories. It reuses the completed admin/domain bootstrap through conflict-safe inserts, lets Supabase migration history skip applied migrations, and merges CentreMate keys into `.env.local` while preserving Vercel's OIDC entry and existing sync secret. Environment values are sent to the existing Vercel project through stdin. It pushes the complete code and deploys after validation.

Authentication/RLS fixture tests run only in a new disposable Docker PostgreSQL container, never against hosted Supabase. The SQL fixture file also refuses any database except `centremate_isolated_tests`. Production verification uses SELECT-only SQL: it inspects schema, RLS policies, consent defaults, deduplication constraints and API privileges. Supabase CLI --read-only owns transaction handling; no BEGIN, DO, SET or ROLLBACK statements are sent. The script requires every returned boolean to be true. Anonymous RPC behavior is checked through the real HTTP API. It creates no users, fixtures, helpers or grants. Actual Google login verification reads existing Auth records only.

After resume finishes, create a Google Cloud OAuth Web client with this exact redirect URI:

```text
https://clnwwhadsalezsdmamsf.supabase.co/auth/v1/callback
```

Then configure Google Auth:

```zsh
node scripts/setup-infrastructure.mjs --auth
```

The secret prompt is hidden. The committed TOML contains environment references only. Open the production website and complete Google sign-in, then run:

```zsh
node scripts/setup-infrastructure.mjs --verify
```

Verification fails unless Google is enabled, an actual verified Google account has signed in, isolated RLS tests and production read-only checks pass, anonymous API access exposes no student data, local HEAD matches GitHub main, the production source hash matches the current source, the built JavaScript contains the correct public database configuration, and an existing verified Google account has a website registration. Confirm the signed-in session on the production page before inviting students. Account credentials are inaccessible to the agent sandbox, so the remaining CLI steps must run in the authenticated Terminal.

## Production configuration

Preserve Supabase project `clnwwhadsalezsdmamsf`, GitHub repository `akshat-j1/centremate`, and the existing Vercel CentreMate project. Never target `zmaemtkhklnbtgpyepqn`, pause another project, or upgrade plans. The resume command above targets the existing resources explicitly.

The production variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL`. Optional automated Sheets sync also uses server-only `SUPABASE_SERVICE_ROLE_KEY` and `FORM_SYNC_SECRET`. Never put a service-role key into a `NEXT_PUBLIC_` variable. Public variable changes require a new production build.

The Google OAuth client must use the callback shown above. If Google Cloud's OAuth consent app is in testing, add the intended test users or publish for the intended audience. The Supabase Auth Site URL is `https://centremate-akshat-9076.vercel.app`, with its exact `/auth/callback` URL allowed. The script handles these Supabase settings.

Once Google login works, the verified admin can use `/admin` to manage approved domains, email exceptions, actual exams/dates and verified venues. No real dates, venues or student registrations are seeded.

## Privacy and authorization

- Anonymous visitors see only exam and centre metadata. No public student directory or contacts.
- Directory access requires an authenticated, email-confirmed Supabase user whose exact domain or email is approved, or a verified administrator.
- RLS permits students to select/update/delete their own registrations only. Email + exam has a database unique constraint.
- The directory is a security-definer RPC projection: name, hostel, departure, ride-sharing and return status only. It never returns email or telephone numbers.
- `visible` is explicit directory consent, defaulting to false. If consent is withdrawn, the directory and contact RPC stop exposing the record immediately.
- WhatsApp is optional. A registered student may retrieve an opted-in student's number only for the same exam and centre. No phone number appears in anonymous HTML, directory responses, metadata or share URLs.
- Readiness is limited to two hours on student writes. The directory checks expiry in PostgreSQL; no scheduled cleanup job is needed. The UI refreshes every 30 seconds.
- Imports are private, cannot supply WhatsApp, and cannot overwrite an existing student choice. A normalized email/exam pair deduplicates Form and website records. A verified student claims an imported registration by saving their own plans.
- Administrators can manage exams, centres, access rules, requests and CSV imports. SQL RLS/RPC checks enforce admin access independently of the UI. Protect admin accounts with MFA in the identity provider.
- The app has no student-data analytics, ad trackers or publicly indexed student pages. CentreMate is an independent initiative, not an official IITM or Scaler product.

## Google Forms / Sheets import

In `/admin`, upload the response Sheet's CSV (up to 1 MB / 1,000 rows), choose mappings for the email, name, hostel and centre question columns, and choose a default configured exam. A centre value can be a verified UUID or a unique directory name. Choose a default centre for a single-centre Form. The preview rejects unknown/ambiguous centres and invalid exam IDs before submission.

The canonical template has these headers; other Form question titles are supported through the mapping UI:

```csv
email,name,hostel,exam_id,centre_id
```

Email is trimmed and lowercased. Hostel must be `Uni 1` or `Uni 2`. Imported phone/consent columns are ignored. Every new record is private. Existing email/exam registrations are preserved, and the result reports actual inserted versus skipped rows. A student signs in with the same verified email to claim/edit their imported record and explicitly choose directory visibility. Deleting a registration prevents subsequent Form syncs from recreating it. Only a private email hash plus exam ID is retained for that suppression; names and contacts are removed. Deliberately registering again clears the suppression.

For automatic syncing, paste `scripts/google-sheets-sync.gs` into the response spreadsheet's Apps Script editor. Its header documents Script Properties for the URL, secret, column mapping, default exam/centre, centre-name-to-UUID mapping, and optional response-tab name. Install an authorized spreadsheet **On form submit** trigger or a scheduled trigger. Run once manually to grant the Sheet/HTTP permissions. Credentials belong in Script Properties, not cells or committed source. The matching `FORM_SYNC_SECRET` and the new project's `SUPABASE_SERVICE_ROLE_KEY` must be encrypted server-only Vercel variables.

A script lock prevents overlapping executions. Syncs send batches of at most 500 rows, never transmit contacts/consent, and preserve existing registrations. The server validates the complete payload, enforces a streaming 1 MB limit, checks the secret in constant time, inserts private rows with conflict-ignore semantics, and reports inserted/skipped counts. Database outages return a retryable response without exposing private service errors.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Database integration tests run against a new disposable PostgreSQL container, never a hosted Supabase project:

```sh
npm run test:db
```

Docker must be running. The runner owns and removes only its uniquely named `centremate-rls-test-*` container. It tests the schema migration, authorization/privacy/deduplication assertions, and the read-only production verification SQL against all local migrations. The fixture suite uses an isolated mock Auth schema with explicit column names and rejects execution outside `centremate_isolated_tests`. Actual Google OAuth must still be tested on production; mock JWT claims do not count as a real Google sign-in.

## Student workflow details

Google sign-in preserves a selected centre/exam or the admin destination through a short-lived, same-site return-path cookie. Callback redirects are restricted to known local routes. Registration errors appear in the active dialog. A student can edit or delete their own plans, move centres without duplicating their exam registration, and opt into directory visibility independently of providing a WhatsApp number. No email or phone appears in anonymous directory markup.

Return status is issued by PostgreSQL for two hours; it can be cancelled, survives profile edits at the same centre, and is cleared when moving exam/centre. Both hostels appear in the same directory. Shared centre links preserve the selected exam. Requested/registered archived exams remain accessible for managing existing plans. Directory requests refresh every 30 seconds and stale responses cannot replace a newly selected exam's plans.

## CLI compatibility and launch evidence

The setup script targets the existing resources and uses Supabase CLI 3.1.0's `db query --read-only -o json --agent=no` contract. Both production queries are SELECT/WITH only. CLI connection-warning prefixes are handled without accepting missing, false or duplicate check results. The schema query and empty-account readiness query have been executed with the real 3.1.0 CLI against isolated PostgreSQL; empty-account readiness is correctly rejected by the result validator.

The verifier checks database REST access, anonymous table/RPC privacy, Google provider configuration, the production homepage, source identity and built public environment variables. It separately requires actual Google sign-in and website registration records. Neither a successful frontend response nor merely enabling Google counts as a completed launch. The Git credential helper is used directly; a separate gh login is not required. Production reads do not require a TTY or a running local Docker daemon.
