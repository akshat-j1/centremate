-- Only existing real records are inspected. No identities, sessions or registrations are created.
select 'google_sign_in_recorded' as check_name,exists (
  select 1 from auth.users u where u.email_confirmed_at is not null and u.last_sign_in_at is not null
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
) as passed
union all
select 'google_student_registration_recorded',exists (
  select 1 from public.registrations r join auth.users u on lower(u.email)=r.email
  where r.source='website' and u.email_confirmed_at is not null and u.last_sign_in_at is not null
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
)
union all
select 'administrator_configured',exists(select 1 from public.admins);
