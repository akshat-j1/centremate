-- SELECT only: the Supabase CLI owns the read-only transaction.
with required_tables(name) as (
  values ('admins'),('allowed_domains'),('email_exceptions'),('exams'),('centres'),
         ('registrations'),('centre_requests'),('registration_opt_outs')
), required_policies(tab,policy) as (
  values ('admins','admin_all'),('allowed_domains','admin_all'),('email_exceptions','admin_all'),
         ('exams','admin_all'),('exams','read_exams'),('centres','admin_all'),('centres','read_centres'),
         ('registrations','admin_all'),('registrations','own_read'),('registrations','own_insert'),
         ('registrations','own_update'),('registrations','own_delete'),
         ('centre_requests','admin_all'),('centre_requests','request_insert'),('registration_opt_outs','own_read')
), required_functions(signature) as (
  values ('public.is_admin()'),('public.is_approved()'),('public.directory(uuid,uuid)'),
         ('public.centre_counts(uuid)'),('public.contact(uuid)'),('public.import_form(jsonb)'),
         ('public.set_return_status(uuid,boolean)')
), private_tables(name) as (
  values ('admins'),('allowed_domains'),('email_exceptions'),('registrations'),('centre_requests'),('registration_opt_outs')
), checks as (
  select 'tables_and_rls' as check_name, not exists (
    select 1 from required_tables r where not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=r.name and c.relrowsecurity
    )
  ) as passed
  union all select 'required_policies',not exists (
    select 1 from required_policies r where not exists (
      select 1 from pg_policies p where p.schemaname='public' and p.tablename=r.tab and p.policyname=r.policy
    )
  )
  union all select 'required_functions',not exists (
    select 1 from required_functions r where to_regprocedure(r.signature) is null
  )
  union all select 'student_exam_unique',exists (
    select 1 from pg_constraint where conrelid=to_regclass('public.registrations') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (exam_id, email)'
  )
  union all select 'private_by_default',exists (
    select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=to_regclass('public.registrations') and a.attname='visible' and pg_get_expr(d.adbin,d.adrelid)='false'
  )
  union all select 'directory_projection_private',coalesce(
    pg_get_function_result(to_regprocedure('public.directory(uuid,uuid)')) !~* '(email|whatsapp)',false
  )
  union all select 'anonymous_tables_denied',not exists (
    select 1 from private_tables r where to_regclass('public.'||r.name) is null
      or has_table_privilege('anon',to_regclass('public.'||r.name),'SELECT')
  )
  union all select 'anonymous_import_denied',case when to_regprocedure('public.import_form(jsonb)') is null then false
    else not has_function_privilege('anon',to_regprocedure('public.import_form(jsonb)'),'EXECUTE') end
  union all select 'anonymous_return_write_denied',case when to_regprocedure('public.set_return_status(uuid,boolean)') is null then false
    else not has_function_privilege('anon',to_regprocedure('public.set_return_status(uuid,boolean)'),'EXECUTE') end
  union all select 'move_and_deletion_triggers',(
    select count(*)=3 from pg_trigger where tgrelid=to_regclass('public.registrations') and not tgisinternal
      and tgname in ('reset_return_on_move','remember_registration_deletion','honor_registration_deletion') and tgenabled<>'D'
  )
)
select check_name,passed from checks order by check_name;
