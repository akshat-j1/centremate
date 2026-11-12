-- Application workflow corrections. Apply later through the existing project's setup script.
create function public.set_return_status(p_registration uuid,p_ready boolean)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare expiry timestamptz;
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  update public.registrations set ready_until=case when p_ready then now()+interval '2 hours' else null end, source='website'
  where id=p_registration and email=lower(auth.jwt()->>'email') returning ready_until into expiry;
  if not found then raise exception 'Registration not found or not yours' using errcode='42501'; end if;
  return expiry;
end $$;
revoke all on function public.set_return_status(uuid,boolean) from public,anon;
grant execute on function public.set_return_status(uuid,boolean) to authenticated;
create function public.reset_return_on_move() returns trigger language plpgsql set search_path='' as $$
begin
  if new.centre_id is distinct from old.centre_id or new.exam_id is distinct from old.exam_id then new.ready_until:=null; end if;
  return new;
end $$;
create trigger reset_return_on_move before update on public.registrations for each row execute function public.reset_return_on_move();
create or replace function public.import_form(rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; inserted integer:=0; affected integer;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Provide an array of rows'; end if;
  if jsonb_array_length(rows)>1000 or jsonb_array_length(rows)<1 then raise exception 'Provide 1 to 1000 rows'; end if;
  for item in select * from jsonb_array_elements(rows) loop
    if lower(btrim(item->>'email')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or item->>'email' is null then raise exception 'Invalid email'; end if;
    insert into public.registrations(exam_id,centre_id,email,name,hostel,source,visible)
    values((item->>'exam_id')::uuid,(item->>'centre_id')::uuid,lower(btrim(item->>'email')),btrim(item->>'name'),btrim(item->>'hostel'),'form',false)
    on conflict(exam_id,email) do nothing;
    get diagnostics affected=row_count; inserted:=inserted+affected;
  end loop;
  return inserted;
end $$;
-- A student deletion must survive repeated Form syncs. Retain only a private identity hash.
create table public.registration_opt_outs(
  exam_id uuid not null references public.exams on delete cascade,
  email_hash text not null check(length(email_hash)=64),
  primary key(exam_id,email_hash)
);
alter table public.registration_opt_outs enable row level security;
revoke all on public.registration_opt_outs from anon,authenticated;
grant select on public.registration_opt_outs to authenticated;
create policy own_read on public.registration_opt_outs for select to authenticated using(public.is_approved() and email_hash=encode(sha256(convert_to(lower(auth.jwt()->>'email'),'UTF8')),'hex'));
create function public.remember_registration_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and old.email=lower(auth.jwt()->>'email') and exists(select 1 from public.exams where id=old.exam_id) then
    insert into public.registration_opt_outs(exam_id,email_hash) values(old.exam_id,encode(sha256(convert_to(old.email,'UTF8')),'hex')) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger remember_registration_deletion after delete on public.registrations for each row execute function public.remember_registration_deletion();
create function public.honor_registration_deletion() returns trigger language plpgsql security definer set search_path='' as $$
declare identity_hash text:=encode(sha256(convert_to(lower(btrim(new.email)),'UTF8')),'hex');
begin
  -- Do not short-circuit RLS for an unauthorized caller probing a suppressed identity.
  if new.source='form' and not (public.is_admin() or coalesce(auth.jwt()->>'role','')='service_role') then return new; end if;
  if new.source='website' and not (public.is_admin() or coalesce(auth.jwt()->>'role','')='service_role' or (public.is_approved() and new.email=lower(auth.jwt()->>'email'))) then return new; end if;
  if new.source='form' and exists(select 1 from public.registration_opt_outs where exam_id=new.exam_id and email_hash=identity_hash) then return null; end if;
  if new.source='website' then delete from public.registration_opt_outs where exam_id=new.exam_id and email_hash=identity_hash; end if;
  return new;
end $$;
create trigger honor_registration_deletion before insert on public.registrations for each row execute function public.honor_registration_deletion();
