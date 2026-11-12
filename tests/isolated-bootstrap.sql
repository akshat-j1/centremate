-- Only the disposable local PostgreSQL container loads this mock auth schema.
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(instance_id uuid,id uuid primary key,email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth,public to anon,authenticated;
grant execute on all functions in schema auth to anon,authenticated;
