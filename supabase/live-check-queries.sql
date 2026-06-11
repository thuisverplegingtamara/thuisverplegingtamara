-- Live controles na deploy. Uitvoeren in Supabase SQL Editor.
-- Deze queries wijzigen niets.

select 'profiles' as tabel, count(*) as aantal from public.profiles
union all
select 'patients', count(*) from public.patients
union all
select 'appointments', count(*) from public.appointments
union all
select 'documents', count(*) from public.documents
union all
select 'costs', count(*) from public.costs
union all
select 'callback_requests', count(*) from public.callback_requests;

-- Laatste terugbelaanvragen, inclusief praktische boodschap.
select created_at, name, phone, email, municipality, preferred_contact_time, message, status
from public.callback_requests
order by created_at desc
limit 10;

-- Patiënten met gekoppelde login.
select p.full_name, p.email, p.municipality, p.active, pr.role, pr.status as profiel_status
from public.patients p
left join public.profiles pr on pr.id = p.user_id
order by p.full_name;
