# Kaloridagbok

AI-drevet mat- og treningsdagbok. Enkel webapp med HTML + JavaScript, Supabase-database og Vercel-hosting.

---

## Prosjektstruktur

```
/kaloridagbok
  index.html          ← Hele HTML-strukturen
  app.js              ← All logikk (Supabase, AI, render)
  style.css           ← Styling (lys + mørk modus)
  supabase_setup.sql  ← Kjør én gang i Supabase for å opprette tabeller
  README.md           ← Denne filen
```

---

## Steg 1 – Supabase

### Opprett prosjekt
1. Gå til [supabase.com](https://supabase.com) og logg inn
2. Klikk **New project** – velg navn og passord
3. Vent til prosjektet er klart (ca. 1 minutt)

### Hent nøklene dine
1. Gå til **Settings → API** i Supabase Dashboard
2. Kopier:
   - **Project URL** → dette er din `SUPABASE_URL`
   - **anon / public** (under Project API keys) → dette er din `SUPABASE_ANON_KEY`

### Legg inn nøklene i app.js
Åpne `app.js` og finn toppen av filen:

```js
const SUPABASE_URL      = 'https://DIN-PROSJEKT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'din-anon-nøkkel-her';
```

Bytt ut begge verdiene med dine egne.

### Opprett tabeller
1. Gå til **SQL Editor** i Supabase Dashboard
2. Klikk **New query**
3. Lim inn hele innholdet fra `supabase_setup.sql`
4. Klikk **Run**

Du skal nå se tabellene `profiles`, `meals` og `exercises` i **Table Editor**.

---

## Steg 2 – GitHub

### Opprett repo
1. Gå til [github.com](https://github.com) og logg inn
2. Klikk **New repository** – gi det navnet `kaloridagbok`
3. Sett det til **Public** (kreves for gratis Vercel-deploy)

### Last opp koden
```bash
# Klon repoet lokalt
git clone https://github.com/DITT-BRUKERNAVN/kaloridagbok.git
cd kaloridagbok

# Kopier filene hit og push
git add .
git commit -m "Initial commit"
git push origin main
```

Eller last opp filene direkte via GitHub-nettstedet med **Add file → Upload files**.

---

## Steg 3 – Vercel

### Deploy
1. Gå til [vercel.com](https://vercel.com) og logg inn med GitHub
2. Klikk **Add New → Project**
3. Velg ditt `kaloridagbok`-repo
4. Klikk **Deploy** – ingen konfigurasjon nødvendig

Vercel oppdager automatisk at dette er en statisk HTML-app.

### Ferdig!
Du får en URL på formen `https://kaloridagbok.vercel.app`.

Hver gang du pusher til `main` på GitHub deployes appen automatisk på nytt.

---

## Steg 4 – Anthropic API-nøkkel (for AI-registrering)

1. Gå til [console.anthropic.com](https://console.anthropic.com)
2. Opprett eller logg inn på konto
3. Gå til **API Keys** og opprett en ny nøkkel
4. I appen: gå til **Innstillinger** og lim inn nøkkelen

Nøkkelen lagres kun i din nettleser (localStorage) – aldri i Supabase.

---

## Databaser og tabeller

| Tabell      | Innhold                                      |
|-------------|----------------------------------------------|
| `profiles`  | Brukerprofil (kjønn, alder, vekt, høyde, mål)|
| `meals`     | Måltider (navn, type, kalorier, dato)        |
| `exercises` | Trening (type, varighet, kalorier, dato)     |

Alle tabeller bruker **Row Level Security** – brukere ser kun sine egne data.

---

## Teknisk stack

- **Frontend:** Ren HTML + JavaScript (ingen rammeverk)
- **Styling:** CSS med variabler for lys/mørk modus
- **Database:** Supabase (PostgreSQL + Auth)
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **Hosting:** Vercel (statisk hosting)
