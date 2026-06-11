-- Voer dit pas uit NADAT het adminaccount werd aangemaakt via de klantenzone of via Supabase Auth.
update public.profiles
set role = 'admin', status = 'active', full_name = 'Tamara Ulenaers-Puts'
where email = 'thuisverplegingvoftamara@gmail.com';
