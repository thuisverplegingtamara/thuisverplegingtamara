# Tamara Thuisverpleging — GitHub Pages + Supabase

Dit pakket bevat een volledige statische website voor `www.thuisverplegingtamara.be` met een klantenzone.

## Architectuur

- **GitHub Pages**: host de publieke website en alle HTML/CSS/JavaScript.
- **Supabase**: verzorgt de functionaliteit die GitHub Pages zelf niet kan leveren:
  - login/authenticatie;
  - database;
  - afspraken/agenda;
  - patiëntendossier-documenten;
  - kostenoverzicht;
  - terugbelaanvragen;
  - beveiligde opslag via private Storage bucket;
  - Row Level Security, zodat patiënten enkel hun eigen gegevens zien.

GitHub Pages alleen is statische hosting. Voor login, agenda, documenten en kosten is dus een externe backend nodig. In dit pakket is dat Supabase.

## Belangrijke privacy-opmerking

Deze oplossing is technisch functioneel, maar patiëntgegevens en gezondheidsgegevens zijn gevoelig. Laat vóór gebruik met echte patiënten controleren:

- privacybeleid;
- verwerkersovereenkomsten;
- bewaartermijnen;
- rechtenbeheer;
- back-ups;
- toegangscontrole;
- logging/audit;
- procedure voor datalekken.

Gebruik in productie minstens sterke wachtwoorden, 2FA voor beheerders en een regelmatig back-upproces.

## Bestanden

```text
index.html                         Publieke website
klantenzone.html                   Login, patiëntenzone en adminzone
privacy.html                       Startversie privacybeleid
cookies.html                       Cookiebeleid
404.html                           Foutpagina
CNAME                              Custom domain voor GitHub Pages
.nojekyll                          Zorgt dat GitHub Pages alles direct serveert
assets/css/styles.css              Huisstijl en responsive layout
assets/js/config.js                Supabase-configuratie invullen
assets/js/public.js                Terugbelformulier
assets/js/portal.js                Klantenzone + adminfunctionaliteit
assets/img/logo.png                Logo
assets/img/qr-thuisverplegingtamara.png  QR-code
supabase/schema.sql                Database, RLS en Storage setup
supabase/admin-activation.sql      SQL om Tamara admin te maken
supabase/test-data.sql             Optionele testdata
```

## Stap 1 — Supabase project maken

1. Ga naar Supabase en maak een nieuw project.
2. Open **SQL Editor**.
3. Plak de volledige inhoud van `supabase/schema.sql`.
4. Klik **Run**.

Daarmee worden aangemaakt:

- `profiles`
- `patients`
- `appointments`
- `documents`
- `costs`
- `callback_requests`
- private bucket `patient-files`
- RLS policies

## Stap 2 — Supabase Auth instellen

Ga in Supabase naar **Authentication > URL Configuration**.

Zet:

```text
Site URL: https://www.thuisverplegingtamara.be
```

Voeg toe bij redirect URLs:

```text
https://www.thuisverplegingtamara.be/klantenzone.html
https://<jouw-github-gebruikersnaam>.github.io/<repo-naam>/klantenzone.html
```

Voor testen mag emailbevestiging tijdelijk uit staan. Voor productie is emailbevestiging aanbevolen.

## Stap 3 — Supabase keys in de website zetten

Ga naar **Project Settings > API** in Supabase.

Kopieer:

- Project URL
- anon/public key

Open daarna:

```text
assets/js/config.js
```

Vervang:

```js
supabaseUrl: "https://PROJECTREF.supabase.co",
supabaseAnonKey: "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE",
```

met de echte waarden.

Belangrijk: gebruik alleen de **anon/public key**. Gebruik nooit de `service_role` key in GitHub of in JavaScript.

## Stap 4 — GitHub repository maken

1. Maak een GitHub-account of log in.
2. Maak een nieuwe repository, bijvoorbeeld:

```text
thuisverplegingtamara
```

3. Upload alle bestanden uit deze map naar de root van de repository.
4. Commit de bestanden.

## Stap 5 — GitHub Pages activeren

In de repository:

1. Ga naar **Settings**.
2. Ga naar **Pages**.
3. Kies **Deploy from a branch**.
4. Branch: `main`.
5. Folder: `/root`.
6. Klik **Save**.

De testsite verschijnt dan meestal op:

```text
https://<jouw-github-gebruikersnaam>.github.io/thuisverplegingtamara/
```

## Stap 6 — Domein koppelen

In GitHub:

1. Ga naar **Settings > Pages**.
2. Vul bij **Custom domain** in:

```text
www.thuisverplegingtamara.be
```

3. Klik **Save**.
4. Vink later **Enforce HTTPS** aan zodra GitHub het certificaat heeft klaargezet.

In GoDaddy DNS:

Voor `www`:

```text
Type: CNAME
Name: www
Value: <jouw-github-gebruikersnaam>.github.io
TTL: default
```

Voor het hoofddomein zonder `www`, voeg A-records toe naar GitHub Pages:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Daarna zal `thuisverplegingtamara.be` normaal doorverwijzen naar `www.thuisverplegingtamara.be` wanneer GitHub Pages correct staat.

DNS kan enkele uren tot 24 uur nodig hebben.

## Stap 7 — Adminaccount aanmaken

1. Open de website.
2. Ga naar `klantenzone.html`.
3. Klik **Login aanvragen**.
4. Gebruik het e-mailadres:

```text
thuisverplegingvoftamara@gmail.com
```

5. Bevestig de e-mail indien Supabase dat vraagt.
6. Ga in Supabase naar **SQL Editor**.
7. Voer `supabase/admin-activation.sql` uit.

Nu kan Tamara inloggen als admin.

## Stap 8 — Patiënt koppelen

De patiëntflow is:

1. Patiënt gaat naar de klantenzone.
2. Patiënt klikt **Login aanvragen**.
3. Patiënt maakt een account aan.
4. Tamara logt in als admin.
5. Tamara gaat naar **Patiënten**.
6. Tamara voegt de patiënt toe met hetzelfde e-mailadres.
7. De klantenzone koppelt het patiëntendossier automatisch aan dat loginaccount.

Daarna ziet de patiënt eigen afspraken, documenten en kosten.

## Stap 9 — Functionaliteit testen

Maak eerst een fictieve patiënt aan.

Test daarna:

- terugbelformulier op de homepage;
- login als admin;
- patiënt toevoegen;
- afspraak toevoegen;
- document uploaden;
- kost toevoegen;
- login als patiënt;
- patiënt ziet alleen eigen gegevens;
- documentdownload werkt;
- patiënt ziet geen adminmenu.

## Stap 10 — Productiecheck

Vóór gebruik met echte patiëntgegevens:

- controleer dat GitHub Pages op HTTPS draait;
- zet 2FA aan op GitHub en Supabase;
- gebruik sterke wachtwoorden;
- plaats geen service keys in GitHub;
- controleer RLS policies in Supabase;
- test met twee patiënten dat ze elkaars gegevens niet kunnen zien;
- regel back-ups;
- laat privacybeleid en verwerkersovereenkomsten nakijken;
- overweeg een betaald Supabase-plan voor productie door back-ups en support.

## Lokale test

Voor een lokale test kan je in deze map draaien:

```bash
python3 -m http.server 8080
```

Open daarna:

```text
http://localhost:8080
```

Let op: Supabase redirect URLs moeten dan ook `http://localhost:8080/klantenzone.html` bevatten als je lokaal login/registratie wil testen.
