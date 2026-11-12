\set ON_ERROR_STOP on
begin;
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth,public to anon,authenticated;
grant execute on all functions in schema auth to anon,authenticated;
\i /tmp/migration.sql
-- Mirror Supabase's default API privileges, with RLS providing authorization.
grant all on all tables in schema public to anon,authenticated;
create function public.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function public.expect_denied(query text,label text) returns void language plpgsql as $$ begin begin execute query;exception when insufficient_privilege then raise notice 'PASS: %',label;return;end;raise exception 'FAIL: %',label;end $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now()),('33333333-3333-4333-8333-333333333333',now()),('44444444-4444-4444-8444-444444444444',null);
insert into public.allowed_domains values('scaler.example');
insert into public.admins values('admin@scaler.example');
insert into public.exams values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST EXAM','2099-01-01',true);
insert into public.centres values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','TEST CENTRE','TEST ADDRESS'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','OTHER TEST CENTRE','TEST ADDRESS');
insert into public.registrations(id,exam_id,centre_id,email,name,hostel,visible,whatsapp,ready_until) values
('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','one@scaler.example','One','Uni 1',true,'919999999999',now()-interval '1 minute'),
('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','two@scaler.example','Two','Uni 2',true,'918888888888',null),
('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','private@scaler.example','Private','Uni 1',false,'917777777777',null);
set local role anon;
select public.assert((select count(*)=0 from public.registrations),'Anonymous cannot read registrations');
select public.assert((select count(*)=0 from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'Anonymous cannot read directory');
select public.assert((select public.contact('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is null),'Anonymous cannot access contact');
select public.expect_denied($q$insert into public.exams(name,exam_date) values('ATTACK','2099-01-01')$q$,'Anonymous cannot manage exams');
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","email":"one@scaler.example"}';
select public.assert(public.is_approved(),'Verified allowlisted user approved');
select public.assert((select count(*)=1 from public.registrations),'Student only reads own raw registration');
select public.assert((select count(*)=2 from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'Both hostels appear together, private records excluded');
select public.assert((select count(distinct hostel)=2 from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'Grouping is centre-based, never hostel-based');
select public.assert((select ready_until is null from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') where name='One'),'Expired ready status is automatically hidden');
select public.assert(public.contact('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa')='918888888888','Same-centre registered student may use consented contact');
select public.assert(public.contact('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is null,'Private contact remains hidden');
select public.assert((select total=2 from public.centre_counts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'Counts exclude private registrations');
select public.expect_denied($q$insert into public.registrations(exam_id,centre_id,email,name,hostel) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','victim@scaler.example','Forged','Uni 1')$q$,'Cannot create another student registration');
select public.expect_denied($q$update public.registrations set ready_until=now()+interval '3 hours' where email='one@scaler.example'$q$,'Cannot extend ready status beyond two hours');
update public.registrations set name='Forged' where email='two@scaler.example';
select public.assert((select name='Two' from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') where id='22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'Cannot edit another student');
select public.expect_denied($q$select public.import_form('[]'::jsonb)$q$,'Student cannot import');
select public.expect_denied($q$insert into public.admins values('one@scaler.example')$q$,'Student cannot promote self');
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","email":"outsider@elsewhere.example"}';
select public.assert(not public.is_approved(),'Unknown domain denied');
select public.assert((select count(*)=0 from public.directory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'Unapproved user cannot read directory');
set local request.jwt.claims='{"sub":"44444444-4444-4444-8444-444444444444","email":"unverified@scaler.example"}';
select public.assert(not public.is_approved(),'Unverified email denied even on allowed domain');
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","email":"admin@scaler.example"}';
select public.assert(public.is_admin(),'Verified configured admin approved');
select public.import_form('[{"exam_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","centre_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"import@scaler.example","name":"Imported","hostel":"Uni 2"},{"exam_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","centre_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"ONE@scaler.example","name":"Overwrite attempt","hostel":"Uni 2"}]');
select public.assert((select count(*)=4 from public.registrations),'Import deduplicates normalized exam/email');
select public.assert((select not visible and whatsapp is null from public.registrations where email='import@scaler.example'),'Import private by default, no contact');
select public.assert((select name='One' and hostel='Uni 1' from public.registrations where email='one@scaler.example'),'Import preserves website choices');
select public.import_form('[{"exam_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","centre_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"import@scaler.example","name":"Imported","hostel":"Uni 2"}]');
select public.assert((select count(*)=4 from public.registrations),'Repeated imports are idempotent');
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","email":"one@scaler.example"}';
update public.registrations set centre_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' where email='one@scaler.example';
select public.assert(public.contact('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is null,'Contact denied across different centres');
delete from public.registrations where email='one@scaler.example';
select public.assert((select count(*)=0 from public.registrations),'Student can delete own registration');
rollback;
