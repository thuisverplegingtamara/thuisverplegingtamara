# Knoppen en Supabase-databasekoppelingen

Deze nota hoort bij de GitHub Pages + Supabase versie van Tamara Thuisverpleging.

## Resultaat van de statische codecontrole

De JavaScript-bestanden zijn syntactisch gecontroleerd met `node --check`:

- `assets/js/public.js`: OK
- `assets/js/portal.js`: OK

De interne HTML-links naar lokale pagina's zijn gecontroleerd:

- `index.html`: OK
- `patientenzone.html`: OK
- `privacy.html`: OK
- `cookies.html`: OK
- `klantenzone.html`: OK, redirect naar `patientenzone.html`
- `404.html`: OK

Let op: deze controle is een codecontrole. Een echte end-to-end controle met de live Supabase-database kan alleen met de actieve Supabase URL, anon key en testgebruikers.

## Publieke website

| Knop/formulier | Effect | Supabase-tabel |
|---|---|---|
| Bel Tamara | Opent telefoonlink `tel:+32488314616` | Geen databaseactie |
| Vraag terugbelmoment aan | Scrollt naar contactformulier | Geen databaseactie |
| Naar patiëntenzone | Opent `patientenzone.html` | Geen databaseactie |
| E-mail openen | Opent mailprogramma | Geen databaseactie |
| Verstuur terugbelverzoek | Slaat naam, telefoon, e-mail, gemeente, gewenst moment en boodschap op | `callback_requests` |

Als Supabase niet geconfigureerd is, gebruikt het terugbelformulier een mailto-fallback. Dan wordt er niets in Supabase opgeslagen.

## Patiëntenzone - login

| Knop/formulier | Effect | Supabase |
|---|---|---|
| Aanmelden | Login met e-mail/wachtwoord | `auth.users`, `profiles` |
| Login aanvragen | Maakt auth-account en profiel in wachtstand | `auth.users`, `profiles` |
| Wachtwoord resetten | Stuurt resetlink | Supabase Auth |
| Nieuw wachtwoord opslaan | Stelt nieuw wachtwoord in na resetlink | Supabase Auth |
| Afmelden | Beëindigt sessie | Supabase Auth |

## Patiëntenzone - patiëntweergave

| Knop/functie | Effect | Supabase |
|---|---|---|
| Overzicht | Toont volgende afspraak en openstaand bedrag | `appointments`, `costs` |
| Agenda | Toont eigen afspraken | `appointments` |
| ICS | Downloadt afspraak als kalenderbestand | Geen databasewijziging |
| Dossier | Toont eigen documenten | `documents`, `storage.objects` |
| Download | Maakt tijdelijke signed URL voor eigen document | Supabase Storage bucket `patient-files` |
| Kosten | Toont eigen kosten | `costs` |

## Adminzone

| Knop/formulier | Effect | Supabase |
|---|---|---|
| Vernieuwen | Herlaadt terugbelaanvragen | `callback_requests` |
| Gecontacteerd | Zet terugbelverzoek op `gecontacteerd` | `callback_requests.status` |
| Afwerken | Zet terugbelverzoek op `afgewerkt` | `callback_requests.status` |
| Patiënt toevoegen/koppelen | Maakt of koppelt patiënt aan login | `patients`, `profiles` |
| Afspraak opslaan | Maakt afspraak aan | `appointments` |
| Afspraak verwijderen | Verwijdert afspraak | `appointments` |
| Document uploaden | Uploadt bestand en registreert document | Storage `patient-files`, `documents` |
| Document downloaden | Maakt tijdelijke signed URL | Storage `patient-files` |
| Document verwijderen | Verwijdert bestand en documentregistratie | Storage `patient-files`, `documents` |
| Kost opslaan | Maakt kostenlijn aan | `costs` |
| Kost verwijderen | Verwijdert kostenlijn | `costs` |

## Verbeteringen in deze versie

- `Klantenzone` is zichtbaar overal vervangen door `Patiëntenzone`.
- De technische URL is `patientenzone.html`.
- `klantenzone.html` blijft als redirect bestaan voor oude links.
- De titel/branding toont `Tamara Thuisverpleging` naast elkaar en groter.
- Terugbelaanvragen tonen nu ook de praktische boodschap in de adminzone.
- Terugbelaanvragen kunnen nu op `gecontacteerd` of `afgewerkt` gezet worden.
- Wachtwoordreset is afgewerkt met een formulier om een nieuw wachtwoord in te stellen.
- Delete/update-acties controleren nu expliciet Supabase-fouten en tonen een melding wanneer een actie faalt.
- Als documentmetadata niet in de database kan worden opgeslagen, wordt het net geüploade bestand opnieuw verwijderd om orphan files te vermijden.

## Aanbevolen live test

1. Maak één fictieve patiënt aan.
2. Vraag met dat e-mailadres een login aan.
3. Koppel de patiënt in de adminzone.
4. Voeg een afspraak, document en kostenlijn toe.
5. Log uit als admin.
6. Log in als patiënt.
7. Controleer of alleen de eigen afspraak, documenten en kosten zichtbaar zijn.
8. Test de resetlink met een testaccount.
9. Test het terugbelformulier en controleer de rij in `callback_requests`.
