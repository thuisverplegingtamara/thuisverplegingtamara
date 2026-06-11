-- Tamara Thuisverpleging - Supabase schema voor GitHub Pages front-end
-- Uitvoeren in Supabase Dashboard > SQL Editor > New query.
-- Belangrijk: plaats nooit de service_role key in GitHub of in frontend-code.

create extension if not exists pgcrypto;

-- =========================
-- 1) Tabellen
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone text,
  role text not null default 'patient' check (role in ('patient', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text unique,
  phone text,
  municipality text check (municipality in ('Zonhoven', 'Houthalen', 'Zolder', 'Andere')),
  active boolean not null default true,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  care_type text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  status text not null default 'gepland' check (status in ('gepland', 'uitgevoerd', 'geannuleerd')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  category text,
  file_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  care_date date not null,
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  status text not null default 'in verwerking' check (status in ('in verwerking', 'te betalen', 'betaald')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.callback_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  municipality text,
  preferred_contact_time text,
  message text,
  status text not null default 'nieuw' check (status in ('nieuw', 'gecontacteerd', 'afgewerkt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- =========================
-- 2) Helpers
-- =========================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at before update on public.patients for each row execute function public.touch_updated_at();

drop trigger if exists appointments_touch_updated_at on public.appointments;
create trigger appointments_touch_updated_at before update on public.appointments for each row execute function public.touch_updated_at();

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at before update on public.documents for each row execute function public.touch_updated_at();

drop trigger if exists costs_touch_updated_at on public.costs;
create trigger costs_touch_updated_at before update on public.costs for each row execute function public.touch_updated_at();

drop trigger if exists callback_requests_touch_updated_at on public.callback_requests;
create trigger callback_requests_touch_updated_at before update on public.callback_requests for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, status)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    'patient',
    'pending'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone = coalesce(excluded.phone, public.profiles.phone);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function public.is_patient_for(patient_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patients p
    where p.id = patient_uuid
      and p.user_id = auth.uid()
      and p.active = true
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_patient_for(uuid) to anon, authenticated;


-- =========================
-- 2b) API grants: RLS blijft de effectieve beveiligingslaag
-- =========================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.costs to authenticated;
grant select, insert, update, delete on public.callback_requests to authenticated;
grant insert on public.callback_requests to anon;
grant select on public.audit_log to authenticated;

-- =========================
-- 3) Row Level Security
-- =========================

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.documents enable row level security;
alter table public.costs enable row level security;
alter table public.callback_requests enable row level security;
alter table public.audit_log enable row level security;

-- PROFILES

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- PATIENTS

drop policy if exists "patients_select_own_or_admin" on public.patients;
create policy "patients_select_own_or_admin" on public.patients
for select to authenticated
using (public.is_admin() or user_id = auth.uid());

drop policy if exists "patients_admin_insert" on public.patients;
create policy "patients_admin_insert" on public.patients
for insert to authenticated
with check (public.is_admin());

drop policy if exists "patients_admin_update" on public.patients;
create policy "patients_admin_update" on public.patients
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "patients_admin_delete" on public.patients;
create policy "patients_admin_delete" on public.patients
for delete to authenticated
using (public.is_admin());

-- APPOINTMENTS

drop policy if exists "appointments_select_own_or_admin" on public.appointments;
create policy "appointments_select_own_or_admin" on public.appointments
for select to authenticated
using (public.is_admin() or public.is_patient_for(patient_id));

drop policy if exists "appointments_admin_insert" on public.appointments;
create policy "appointments_admin_insert" on public.appointments
for insert to authenticated
with check (public.is_admin());

drop policy if exists "appointments_admin_update" on public.appointments;
create policy "appointments_admin_update" on public.appointments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "appointments_admin_delete" on public.appointments;
create policy "appointments_admin_delete" on public.appointments
for delete to authenticated
using (public.is_admin());

-- DOCUMENTS

drop policy if exists "documents_select_own_or_admin" on public.documents;
create policy "documents_select_own_or_admin" on public.documents
for select to authenticated
using (public.is_admin() or public.is_patient_for(patient_id));

drop policy if exists "documents_admin_insert" on public.documents;
create policy "documents_admin_insert" on public.documents
for insert to authenticated
with check (public.is_admin());

drop policy if exists "documents_admin_update" on public.documents;
create policy "documents_admin_update" on public.documents
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "documents_admin_delete" on public.documents;
create policy "documents_admin_delete" on public.documents
for delete to authenticated
using (public.is_admin());

-- COSTS

drop policy if exists "costs_select_own_or_admin" on public.costs;
create policy "costs_select_own_or_admin" on public.costs
for select to authenticated
using (public.is_admin() or public.is_patient_for(patient_id));

drop policy if exists "costs_admin_insert" on public.costs;
create policy "costs_admin_insert" on public.costs
for insert to authenticated
with check (public.is_admin());

drop policy if exists "costs_admin_update" on public.costs;
create policy "costs_admin_update" on public.costs
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "costs_admin_delete" on public.costs;
create policy "costs_admin_delete" on public.costs
for delete to authenticated
using (public.is_admin());

-- CALLBACK REQUESTS

drop policy if exists "callback_insert_anyone" on public.callback_requests;
create policy "callback_insert_anyone" on public.callback_requests
for insert to anon, authenticated
with check (true);

drop policy if exists "callback_admin_select" on public.callback_requests;
create policy "callback_admin_select" on public.callback_requests
for select to authenticated
using (public.is_admin());

drop policy if exists "callback_admin_update" on public.callback_requests;
create policy "callback_admin_update" on public.callback_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "callback_admin_delete" on public.callback_requests;
create policy "callback_admin_delete" on public.callback_requests
for delete to authenticated
using (public.is_admin());

-- AUDIT LOG: enkel admin kan lezen; insert kan later via Edge Functions of triggers.

drop policy if exists "audit_admin_select" on public.audit_log;
create policy "audit_admin_select" on public.audit_log
for select to authenticated
using (public.is_admin());

-- =========================
-- 4) Storage bucket + policies
-- =========================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-files',
  'patient-files',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg'];

drop policy if exists "patient_files_admin_all" on storage.objects;
create policy "patient_files_admin_all" on storage.objects
for all to authenticated
using (bucket_id = 'patient-files' and public.is_admin())
with check (bucket_id = 'patient-files' and public.is_admin());

drop policy if exists "patient_files_patient_select_own" on storage.objects;
create policy "patient_files_patient_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'patient-files'
  and exists (
    select 1 from public.patients p
    where p.id::text = split_part(storage.objects.name, '/', 1)
      and p.user_id = auth.uid()
      and p.active = true
  )
);

-- =========================
-- 5) Eerste admin activeren
-- =========================
-- Stap na het aanmaken van het adminaccount via de klantenzone/sign-up:
-- update public.profiles
-- set role = 'admin', status = 'active', full_name = 'Tamara Ulenaers-Puts'
-- where email = 'thuisverplegingvoftamara@gmail.com';
