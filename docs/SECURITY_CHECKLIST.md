# Security checklist klantenzone

Gebruik deze checklist vóór echte patiëntgegevens.

## Accounts

- GitHub 2FA actief.
- Supabase 2FA actief.
- Alleen Tamara of gemachtigden hebben adminrechten.
- Geen gedeelde adminaccounts.
- Sterke wachtwoorden verplicht.
- Verwijder testaccounts vóór productie.

## Supabase

- `schema.sql` volledig uitgevoerd.
- Row Level Security staat aan op alle tabellen.
- `patient-files` bucket is private.
- Geen `service_role` key in GitHub.
- Anon/public key staat in `assets/js/config.js`.
- Email confirmation staat aan voor productie.
- Redirect URLs staan correct.
- Test met twee patiënten: patiënt A mag patiënt B niet zien.

## Gegevensbescherming

- Privacybeleid juridisch nagekeken.
- Verwerkersovereenkomst met Supabase/GitHub geregeld indien nodig.
- Bewaartermijnen vastgelegd.
- Procedure voor datalekken vastgelegd.
- Geen medische gegevens via gewone terugbelformulieren.
- Documenten enkel uploaden wanneer noodzakelijk.

## Back-ups

- Free tier heeft beperkte garanties.
- Voor echte patiëntgegevens: plan periodieke database-export.
- Test herstel van back-ups.
- Bewaar exports versleuteld.

## Productieadvies

Voor een echte medische klantenzone is een professionele backend met duidelijke verwerkersovereenkomsten, backups, toegangslogging en SLA sterk aanbevolen. Deze GitHub Pages + Supabase-oplossing is technisch werkend, maar moet juridisch/veiligheidstechnisch gevalideerd worden.
