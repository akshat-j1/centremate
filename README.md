# CentreMate

A mobile-first coordination app for Scaler students taking IITM BS examinations. Students are grouped by **exam and exam centre**, with Uni 1 and Uni 2 together.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Requires Node.js 22 or 24. Add the new project's Supabase URL and public anon/publishable key to `.env.local`. Never use a service-role key in a `NEXT_PUBLIC_` variable. With no Supabase configuration the site renders a clear setup state, with sign-in and private data unavailable.

## Setup using the authenticated Mac Terminal

The agent sandbox cannot access the Mac keychain credentials used by `gh` and `supabase`, and cannot initialize `.git`. Run the following from your normal authenticated Terminal:

```zsh
cd /Users/akshatjain/Documents/groupyy
node scripts/setup-infrastructure.mjs
```

The script checks the GitHub account and resource IDs, creates/pushes the private `akshat-j1/centremate` repository, links only the existing Vercel project, creates/reuses only the named Supabase project in the requested organization, applies migrations, bootstraps the real administrator and domain allowlist, runs transaction-rolled-back tests against the live database, configures encrypted production variables, pushes the complete code and deploys. It asks you to confirm the organization is on Free before project creation because the organization determines billing. If quota, credentials or permissions fail, it stops with a blocker; it never upgrades or targets the forbidden project. Do not treat a script syntax check as a successful infrastructure run.

It prints the **new project's exact Google callback URL**. Create a Google Cloud OAuth Web client using that callback, then run:

```zsh
node scripts/setup-infrastructure.mjs --auth
```

The client secret prompt is hidden. Credentials are passed to Supabase through environment variables, and the committed TOML contains environment references only. Open the production website and complete Google sign-in. Then run:

```zsh
node scripts/setup-infrastructure.mjs --verify
```

Verification fails unless Google is enabled, a verified Google account has really signed in, the live database authorization assertions pass, anonymous API access exposes no student data, local HEAD matches GitHub main, and the production source hash matches. A signed-in session on the production page must also be confirmed before launch.

## Launch checklist

1. Authenticate `gh auth login -h github.com` and `supabase login`. Initialize this checkout with `git init -b main` if required by the local filesystem permissions.
2. Create a **new free** Supabase project named `centremate` in organization `wlvfxeuxgdybfxthizwy`, preferring `ap-south-1` (Mumbai). Do not use or alter `zmaemtkhklnbtgpyepqn`. If free-project quota is exhausted, stop; do not upgrade or pause another project.
3. Apply `supabase/migrations/202611120001_centremate.sql` to the NEW project. With the CLI: `supabase link --project-ref NEW_PROJECT_REF`, then `supabase db push`. Alternatively paste the migration into the new project's SQL editor. There are deliberately no real exam, venue, or student seeds.
4. Bootstrap the initial administrator in that project's SQL editor using the real, verified Google account email:

   ```sql
   insert into public.admins(email) values ('YOUR_LOWERCASE_ADMIN_EMAIL');
   ```

5. Configure Google OAuth in Google Cloud: create a Web application OAuth client with callback `https://NEW_PROJECT_REF.supabase.co/auth/v1/callback`. Enter the client ID and client secret in Supabase Authentication → Sign In / Providers → Google and enable Google. If the OAuth app is in testing, add authorized test users, or publish it for your intended audience. Credentials never belong in Git.
6. Set the Supabase Authentication Site URL to the production origin and allow `https://PRODUCTION_HOST/auth/callback`. Allow `http://localhost:3000/auth/callback` only for development. Use exact production URLs rather than a broad wildcard.
7. In the existing NEW Vercel CentreMate project, add production environment variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://NEW_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=NEW_PROJECT_PUBLIC_KEY
   NEXT_PUBLIC_SITE_URL=https://PRODUCTION_HOST
   ```

   Redeploy after changing public variables; Next.js embeds them at build time. `SUPABASE_SERVICE_ROLE_KEY` and `FORM_SYNC_SECRET` are only required for optional automated Sheets sync and must be encrypted server-only variables.

8. Sign in as the bootstrap administrator, visit `/admin`, and configure the **exact verified Scaler email domains** and any individual email exceptions. Access is closed by default; no Scaler domain is guessed. Add officially verified exams, dates and centres.
9. Create `akshat-j1/centremate`, push `main`, and connect it to Vercel project `prj_FQICpl1AG2W5p3GTwZKt9eF8GjiV` in team `akshat-9076`. Keep all services on Free/Hobby. Do not commit `.env*`, `scratch/`, or `.vercel/`.
10. Perform a real Google sign-in and verify registration, editing, deletion, directory consent and WhatsApp access on production using approved accounts before inviting students.

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

Export the response Sheet as CSV and provide the following headers (case-insensitive):

```csv
email,name,hostel,exam_id,centre_id
```

Use the real exam and centre UUIDs displayed in `/admin`. `hostel` must be `Uni 1` or `Uni 2`. Rename/map Google Form question headers to these fields before import. Preview and validate a maximum of 1,000 rows / 1 MB per file. Unknown or invalid UUIDs fail the transaction. Repeated imports safely skip existing exam/email pairs. Imported consent and contact columns are ignored.

For optional automatic sync, normalize those five columns in a Sheet and paste `scripts/google-sheets-sync.gs` into its Apps Script editor. Set script properties `CENTREMATE_URL` and `CENTREMATE_SECRET`. Set the matching random 32+ character `FORM_SYNC_SECRET` and the new project's `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Install a time-driven trigger for `syncCentreMate`. Trigger installation and access to the chosen Sheet require its owner's Google authorization. The endpoint limits requests to 1 MB and 1,000 validated rows, compares the secret in constant time, uses conflict-ignore semantics, and always inserts private records. Treat the sync secret as an admin credential; rotate it if disclosed.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Database integration tests run against an **isolated disposable PostgreSQL container**, never an existing Supabase project:

```sh
docker run -d --name centremate-test-db -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
# Wait until PostgreSQL is ready, then:
docker cp supabase/migrations/202611120001_centremate.sql centremate-test-db:/tmp/migration.sql
docker cp tests/database.sql centremate-test-db:/tmp/database.sql
docker exec centremate-test-db psql -U postgres -f /tmp/database.sql
# Remove only this disposable CentreMate test container when finished:
docker rm -f centremate-test-db
```

The SQL test file creates mock `auth.uid()`/`auth.jwt()` functions and simulated Supabase API privileges, tests actual PostgreSQL RLS and RPCs, and rolls its fixtures back. It does not substitute for final live OAuth/API testing against the new Supabase project.
