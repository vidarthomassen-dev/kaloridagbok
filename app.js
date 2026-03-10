// ╔══════════════════════════════════════════════════════════╗
// ║  SUPABASE-KONFIGURASJON                                  ║
// ║  Bytt ut disse to verdiene med dine egne fra Supabase:   ║
// ║  Supabase Dashboard → Settings → API                     ║
// ╚══════════════════════════════════════════════════════════╝
const SUPABASE_URL      = 'https://ksygzvhveocsrwqxuxyn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aTtrP7PkUkYDalTClsyu7w_oIjnjia7';

// ─── Supabase klient ──────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ─── Aktivitetsfaktorer ───────────────────────────────────
const AKTIVITET = {
  stillesittende: { faktor: 1.2,  label: 'Stillesittende' },
  lett:           { faktor: 1.35, label: 'Lett aktiv'     },
  moderat:        { faktor: 1.5,  label: 'Moderat aktiv'  },
};

// ─── Global state ─────────────────────────────────────────
let currentUser = null;
let currentDate = toDateStr(new Date());
let dayData     = { meals: [], exercises: [] };
let settings    = {
  kjonn: 'mann', aktivitet: 'lett',
  alder: null, vekt: null, hoyde: null, maal: 2000,
};

// ═════════════════════════════════════════════════════════
//  HJELPE-FUNKSJONER
// ═════════════════════════════════════════════════════════
function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function formatDateNO(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function kalkulerBMR(s) {
  const a = Number(s.alder), v = Number(s.vekt), h = Number(s.hoyde);
  if (!a || !v || !h) return null;
  const base = 10 * v + 6.25 * h - 5 * a;
  return Math.round(s.kjonn === 'mann' ? base + 5 : base - 161);
}

function kalkulerTDEE(s) {
  const bmr = kalkulerBMR(s);
  if (!bmr) return null;
  return Math.round(bmr * (AKTIVITET[s.aktivitet]?.faktor ?? 1.35));
}

// ═════════════════════════════════════════════════════════
//  AUTH
// ═════════════════════════════════════════════════════════
async function init() {
  // Gjenopprett sesjon fra localStorage (Supabase gjør dette automatisk)
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await showApp();
  } else {
    showLogin();
  }

  // Lytt på login/logout-hendelser
  db.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) await showApp();
    else showLogin();
  });
}

async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) setLoginMsg(error.message, true);
}

async function registerUser() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { error } = await db.auth.signUp({ email, password });
  if (error) setLoginMsg(error.message, true);
  else setLoginMsg('Sjekk e-posten din for bekreftelseslenke!', false);
}

async function logout() {
  await db.auth.signOut();
}

function setLoginMsg(text, isError) {
  const el = document.getElementById('login-msg');
  el.textContent = text;
  el.className = 'login-msg ' + (isError ? 'error' : 'ok');
}

// ═════════════════════════════════════════════════════════
//  SIDESKIFT
// ═════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('page-login').classList.remove('hidden');
  document.getElementById('page-app').classList.add('hidden');
}

async function showApp() {
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');
  await loadSettings();
  renderDate();
  await loadDay(currentDate);
}

// ═════════════════════════════════════════════════════════
//  TABS
// ═════════════════════════════════════════════════════════
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('hidden', s.id !== `tab-${name}`));
  if (name === 'statistikk') renderStats();
}

// ═════════════════════════════════════════════════════════
//  INNSTILLINGER  (lagres i Supabase: tabell "profiles")
// ═════════════════════════════════════════════════════════
async function loadSettings() {
  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();

  if (data) {
    settings = { ...settings, ...data };
    document.getElementById('s-kjonn').value     = settings.kjonn     ?? 'mann';
    document.getElementById('s-aktivitet').value = settings.aktivitet ?? 'lett';
    document.getElementById('s-alder').value     = settings.alder     ?? '';
    document.getElementById('s-vekt').value      = settings.vekt      ?? '';
    document.getElementById('s-hoyde').value     = settings.hoyde     ?? '';
    document.getElementById('s-maal').value      = settings.maal      ?? 2000;
  }

  updateBMRLive();
}

async function saveSettings() {
  settings = {
    kjonn:     document.getElementById('s-kjonn').value,
    aktivitet: document.getElementById('s-aktivitet').value,
    alder:     Number(document.getElementById('s-alder').value),
    vekt:      Number(document.getElementById('s-vekt').value),
    hoyde:     Number(document.getElementById('s-hoyde').value),
    maal:      Number(document.getElementById('s-maal').value) || 2000,
  };

  // Lagre profil i Supabase (upsert = insert eller oppdater)
  await db.from('profiles').upsert({ user_id: currentUser.id, ...settings });

  updateBMRLive();
  renderBalance();

  const ok = document.getElementById('save-ok');
  ok.classList.remove('hidden');
  setTimeout(() => ok.classList.add('hidden'), 2000);
}

function updateBMRLive() {
  const bmr  = kalkulerBMR(settings);
  const tdee = kalkulerTDEE(settings);
  const el   = document.getElementById('bmr-live');
  if (bmr && tdee) {
    el.innerHTML = `&#x1F6CC; BMR: <strong>${bmr} kcal</strong> &nbsp;&#183;&nbsp; &#x1F6B6; TDEE: <strong>${tdee} kcal</strong>`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ═════════════════════════════════════════════════════════
//  DATA: LAST OG SLETT  (Supabase: tabeller "meals" og "exercises")
// ═════════════════════════════════════════════════════════
async function loadDay(date) {
  const uid = currentUser.id;
  const [{ data: meals }, { data: exercises }] = await Promise.all([
    db.from('meals')    .select('*').eq('user_id', uid).eq('date', date).order('created_at'),
    db.from('exercises').select('*').eq('user_id', uid).eq('date', date).order('created_at'),
  ]);
  dayData.meals     = meals     ?? [];
  dayData.exercises = exercises ?? [];
  renderAll();
}

async function deleteMeal(id) {
  await db.from('meals').delete().eq('id', id);
  dayData.meals = dayData.meals.filter(m => m.id !== id);
  renderAll();
}

async function deleteExercise(id) {
  await db.from('exercises').delete().eq('id', id);
  dayData.exercises = dayData.exercises.filter(x => x.id !== id);
  renderAll();
}

// ═════════════════════════════════════════════════════════
//  AI-REGISTRERING
// ═════════════════════════════════════════════════════════
async function registerWithAI() {
  const text = document.getElementById('ai-input').value.trim();
  if (!text) return;
  const btn = document.getElementById('btn-ai');
  btn.textContent = '&#8987; Tenker...';
  btn.disabled = true;

  const prompt = `Du er en norsk mat- og treningsassistent. Analyser teksten og returner KUN gyldig JSON uten markdown eller forklaringer.

Tekst: "${text}"
Dato: ${currentDate}

Returner dette JSON-formatet:
{
  "type": "mat" eller "trening",
  "items": [{
    "name": "navn på mat eller øvelse",
    "meal_type": "Frokost"|"Lunsj"|"Middag"|"Kveldsmat"|"Snacks"|"Annet",
    "kcal": tall (kalorier i maten, 0 for trening),
    "exercise_type": "Løping"|"Styrketrening"|"Sykling"|"Svømming"|"Yoga"|"Gåtur"|"Annet",
    "kcal_burned": tall (forbrent på trening, 0 for mat),
    "duration_min": tall (minutter, 0 for mat),
    "note": "kort beskrivelse"
  }],
  "summary": "kort norsk oppsummering av hva som ble registrert"
}

Referanseverdier: Grandiosa hel ~960kcal, halv ~480kcal. Havregrøt 350ml ~180kcal. Løping 30min ~300kcal. Styrketrening 45min ~250kcal.`;

  try {
    // Kall vår egen Vercel serverless function – unngår CORS og skjuler API-nøkkelen
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    // Les alltid som tekst først, så vi kan gi en fornuftig feilmelding
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Vercel returnerte HTML (404-side, splashside, o.l.) – funksjonen ble ikke funnet
      throw new Error(
        `Serverless-funksjonen ble ikke funnet (HTTP ${res.status}). ` +
        `Sjekk at api/ai.js er pushet til GitHub og at Vercel er redeployet. ` +
        `Råsvar: ${rawText.slice(0, 120)}`
      );
    }
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

    const raw    = data.content?.map(b => b.text ?? '').join('').trim();
    const match  = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Kunne ikke tolke AI-svar');
    const result = JSON.parse(match[0]);

    // Lagre i Supabase
    if (result.type === 'mat') {
      for (const item of result.items) {
        const row = {
          user_id:   currentUser.id,
          date:      currentDate,
          name:      item.name,
          meal_type: item.meal_type ?? 'Annet',
          kcal:      item.kcal ?? 0,
        };
        const { data: inserted } = await db.from('meals').insert(row).select().single();
        if (inserted) dayData.meals.push(inserted);
      }
    } else {
      for (const item of result.items) {
        const row = {
          user_id:       currentUser.id,
          date:          currentDate,
          exercise_type: item.exercise_type ?? 'Annet',
          duration_min:  item.duration_min  ?? 0,
          kcal_burned:   item.kcal_burned   ?? 0,
          note:          item.note ?? item.name ?? '',
        };
        const { data: inserted } = await db.from('exercises').insert(row).select().single();
        if (inserted) dayData.exercises.push(inserted);
      }
    }

    document.getElementById('ai-input').value = '';
    showAIMsg(result.summary, true);
    renderAll();

  } catch (e) {
    showAIMsg(e.message, false);
  }

  btn.textContent = 'Registrer →';
  btn.disabled = false;
}

function showAIMsg(text, ok) {
  const el = document.getElementById('ai-msg');
  el.textContent = (ok ? '✓ ' : '⚠ ') + text;
  el.className   = 'ai-msg ' + (ok ? 'ai-ok' : 'ai-error');
}

// ═════════════════════════════════════════════════════════
//  RENDER: KALORIBALANSE
// ═════════════════════════════════════════════════════════
function renderBalance() {
  const goal      = settings.maal || 2000;
  const tdee      = kalkulerTDEE(settings) ?? goal;
  const eaten     = dayData.meals    .reduce((s, m) => s + (m.kcal        ?? 0), 0);
  const exercise  = dayData.exercises.reduce((s, x) => s + (x.kcal_burned ?? 0), 0);

  const remaining  = goal - eaten;
  const canEat     = goal - eaten + exercise;
  const totalNeed  = tdee + exercise;
  const deficit    = totalNeed - eaten;
  const ok         = remaining >= 0;

  // Hero-tall: gjenstår
  const remEl = document.getElementById('bal-remaining');
  remEl.textContent = Math.abs(remaining);
  remEl.style.color = ok
    ? 'var(--green)'
    : 'var(--red)';

  // Stat-bokser
  document.getElementById('bal-eaten').textContent = `${eaten} kcal`;
  document.getElementById('bal-goal').textContent  = `${goal} kcal`;

  // Trening-bokser: vis kun hvis trening logget
  const exRow  = document.getElementById('bal-exercise-row');
  const canRow = document.getElementById('bal-caneat-row');
  if (exercise > 0) {
    document.getElementById('bal-exercise').textContent = `${exercise} kcal`;
    document.getElementById('bal-can-eat').textContent  = `${canEat} kcal`;
    exRow.style.display  = 'flex';
    canRow.style.display = 'flex';
  } else {
    exRow.style.display  = 'none';
    canRow.style.display = 'none';
  }

  // Progressbar
  const pct  = Math.min(100, (eaten / goal) * 100);
  const fill = document.getElementById('progress-fill');
  fill.style.width      = pct + '%';
  fill.style.background = ok ? 'var(--green)' : 'var(--red)';
  document.getElementById('prog-left').textContent  = `Spist: ${eaten} kcal`;
  document.getElementById('prog-right').textContent = `Mål: ${goal} kcal`;

  // Infofelt
  document.getElementById('bal-tdee').textContent       = `${tdee} kcal`;
  document.getElementById('bal-total-need').textContent = `${totalNeed} kcal`;
  const defEl = document.getElementById('bal-deficit');
  defEl.textContent = `${Math.abs(deficit)} kcal${deficit < 0 ? ' (overskudd)' : ''}`;
  defEl.className   = 'val ' + (deficit >= 0 ? 'green' : 'red');

  // Kortbord
  const card = document.getElementById('balance-card');
  card.style.borderColor = ok ? 'var(--green)' : 'var(--red)';
  card.style.boxShadow   = ok
    ? '0 8px 32px rgba(48,209,88,0.15), 0 2px 8px rgba(48,209,88,0.08)'
    : '0 8px 32px rgba(255,59,48,0.15), 0 2px 8px rgba(255,59,48,0.08)';
}

// ═════════════════════════════════════════════════════════
//  RENDER: MÅLTIDER
// ═════════════════════════════════════════════════════════
function renderMeals() {
  const ORDER   = ['Frokost','Lunsj','Middag','Kveldsmat','Snacks','Annet'];
  const grouped = {};
  ORDER.forEach(t => {
    const items = dayData.meals.filter(m => m.meal_type === t);
    if (items.length) grouped[t] = items;
  });

  const list  = document.getElementById('meals-list');
  const total = document.getElementById('meals-total');
  const badge = document.getElementById('meal-badge');
  const eaten = dayData.meals.reduce((s, m) => s + (m.kcal ?? 0), 0);

  badge.textContent = dayData.meals.length;
  list.innerHTML    = '';

  if (!dayData.meals.length) {
    list.innerHTML = '<p class="empty">Ingen måltider logget</p>';
    total.classList.add('hidden');
    return;
  }

  Object.entries(grouped).forEach(([type, items]) => {
    const groupKcal = items.reduce((s, m) => s + (m.kcal ?? 0), 0);
    const bodyId    = 'grp-' + type;

    // Gruppe-header (klikk for å ekspandere)
    const hdr = document.createElement('div');
    hdr.className = 'group-hdr';
    hdr.innerHTML = `
      <span class="grp-arrow" id="arr-${type}">&#9658;</span>
      <span class="grp-name">${type}</span>
      <span class="grp-meta">${items.length} ${items.length === 1 ? 'rett' : 'retter'}</span>
      <span class="grp-kcal">${groupKcal} kcal</span>
    `;
    hdr.onclick = () => {
      const body  = document.getElementById(bodyId);
      const arrow = document.getElementById('arr-' + type);
      const open  = body.style.display !== 'none' && body.style.display !== '';
      body.style.display  = open ? 'none' : 'block';
      arrow.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
    };

    // Gruppe-innhold (skjult som standard)
    const body = document.createElement('div');
    body.id            = bodyId;
    body.style.display = 'none';

    items.forEach(m => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <span class="item-name">${m.name}</span>
        <span class="item-kcal">${m.kcal} kcal</span>
        <button class="btn-del" onclick="deleteMeal('${m.id}')">&#215;</button>
      `;
      body.appendChild(row);
    });

    list.appendChild(hdr);
    list.appendChild(body);
  });

  total.textContent = `Totalt: ${eaten} kcal`;
  total.classList.remove('hidden');
}

// ═════════════════════════════════════════════════════════
//  RENDER: TRENING
// ═════════════════════════════════════════════════════════
function renderExercises() {
  const list   = document.getElementById('ex-list');
  const total  = document.getElementById('ex-total');
  const badge  = document.getElementById('ex-badge');
  const burned = dayData.exercises.reduce((s, x) => s + (x.kcal_burned ?? 0), 0);

  badge.textContent = dayData.exercises.length;
  list.innerHTML    = '';

  if (!dayData.exercises.length) {
    list.innerHTML = '<p class="empty">Ingen trening logget</p>';
    total.classList.add('hidden');
    return;
  }

  dayData.exercises.forEach(x => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div class="item-left">
        <span class="item-name">${x.note || x.exercise_type}</span>
        <span class="item-sub">${x.exercise_type} &#183; ${x.duration_min} min</span>
      </div>
      <span class="item-kcal blue">&#8722;${x.kcal_burned} kcal</span>
      <button class="btn-del" onclick="deleteExercise('${x.id}')">&#215;</button>
    `;
    list.appendChild(row);
  });

  total.textContent = `Totalt forbrent: ${burned} kcal`;
  total.classList.remove('hidden');
}

function renderAll() {
  renderBalance();
  renderMeals();
  renderExercises();
}

function renderDate() {
  document.getElementById('current-date').textContent = formatDateNO(currentDate);
}

// ═════════════════════════════════════════════════════════
//  RENDER: STATISTIKK
// ═════════════════════════════════════════════════════════
async function renderStats() {
  const period = document.querySelector('.period-tab.active').dataset.period;
  const now    = new Date();
  let dates    = [];

  if (period === 'uke') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return toDateStr(d);
    });
  } else if (period === 'maned') {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    dates = Array.from({ length: days }, (_, i) => {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(i + 1).padStart(2, '0');
      return `${now.getFullYear()}-${mm}-${dd}`;
    });
  } else {
    dates = Array.from({ length: 365 }, (_, i) => {
      const d = new Date(now.getFullYear(), 0, 1 + i);
      return d.getFullYear() === now.getFullYear() ? toDateStr(d) : null;
    }).filter(Boolean);
  }

  const from = dates[0], to = dates[dates.length - 1];
  const uid  = currentUser.id;

  const [{ data: meals }, { data: exercises }] = await Promise.all([
    db.from('meals')    .select('*').eq('user_id', uid).gte('date', from).lte('date', to),
    db.from('exercises').select('*').eq('user_id', uid).gte('date', from).lte('date', to),
  ]);

  const mByDate = {}, xByDate = {};
  (meals     ?? []).forEach(m => { (mByDate[m.date] ??= []).push(m); });
  (exercises ?? []).forEach(x => { (xByDate[x.date] ??= []).push(x); });

  const loggedDates = dates.filter(d => mByDate[d]?.length || xByDate[d]?.length);
  const tdee        = kalkulerTDEE(settings) ?? (settings.maal || 2000);
  const totalEaten  = (meals     ?? []).reduce((s, m) => s + (m.kcal        ?? 0), 0);
  const totalBurned = (exercises ?? []).reduce((s, x) => s + (x.kcal_burned ?? 0), 0);
  const totalTDEE   = loggedDates.length * tdee;
  const netBalance  = totalEaten - totalTDEE - totalBurned;
  const n           = loggedDates.length || 1;

  // Statistikk-kort
  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Snitt spist</div>     <div class="stat-val">${Math.round(totalEaten/n)}</div>      <div class="stat-unit">kcal/dag</div></div>
    <div class="stat-card"><div class="stat-label">Snitt trening</div>   <div class="stat-val blue">${Math.round(totalBurned/n)}</div>  <div class="stat-unit">kcal/dag</div></div>
    <div class="stat-card"><div class="stat-label">Totalt spist</div>    <div class="stat-val">${totalEaten.toLocaleString('nb-NO')}</div>  <div class="stat-unit">kcal</div></div>
    <div class="stat-card"><div class="stat-label">Totalt trening</div>  <div class="stat-val blue">${totalBurned.toLocaleString('nb-NO')}</div><div class="stat-unit">kcal</div></div>
  `;

  // Balanse-oppsummering
  const ok = netBalance <= 0;
  const statBal = document.getElementById('stat-balance');
  statBal.style.borderColor = ok ? '#22c55e' : '#ef4444';
  statBal.innerHTML = `
    <div class="balance-header">
      <span class="balance-title">Kaloribalanse – perioden</span>
      <span>${ok ? '✅' : '🔴'}</span>
    </div>
    <div class="net-big ${ok ? 'green' : 'red'}">${netBalance > 0 ? '+' : ''}${netBalance.toLocaleString('nb-NO')} kcal</div>
    <p class="balance-desc">${ok ? 'Du er i underskudd for perioden 👍' : `Overskudd på ${Math.abs(netBalance).toLocaleString('nb-NO')} kcal`}</p>
    <p class="balance-desc muted">Logget ${loggedDates.length} av ${dates.length} dager</p>
  `;

  // Ukesbreakdown
  const weekEl = document.getElementById('stat-week');
  if (period === 'uke') {
    let html = '<div class="section-hdr"><strong>Daglig oversikt</strong></div>';
    dates.forEach(d => {
      const e  = (mByDate[d] ?? []).reduce((s, m) => s + (m.kcal ?? 0), 0);
      const b  = (xByDate[d] ?? []).reduce((s, x) => s + (x.kcal_burned ?? 0), 0);
      const has = mByDate[d]?.length || xByDate[d]?.length;
      const lbl = new Date(d + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric' });
      const dok = e <= (settings.maal || tdee);
      const pct = Math.min(100, (e / (settings.maal || tdee)) * 100);
      html += `
        <div class="week-row ${d === currentDate ? 'today' : ''}">
          <span class="week-lbl">${lbl}</span>
          ${has ? `
            <div class="week-bar-wrap">
              <div class="week-bar" style="width:${pct}%;background:${dok ? '#22c55e' : '#ef4444'}"></div>
            </div>
            <span class="week-kcal ${dok ? 'green' : 'red'}">${e} kcal</span>
            <span>${dok ? '✅' : '🔴'}</span>
          ` : '<span class="muted flex1" style="font-size:13px">Ikke logget</span>'}
        </div>`;
    });
    weekEl.innerHTML = html;
    weekEl.style.display = 'block';
  } else {
    weekEl.style.display = 'none';
  }
}

// ═════════════════════════════════════════════════════════
//  DARK MODE
// ═════════════════════════════════════════════════════════
function toggleDark() {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  localStorage.setItem('dagbok_dark', dark ? '1' : '0');
  document.getElementById('btn-dark').textContent = dark ? '🌙' : '☀️';
}

// ═════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═════════════════════════════════════════════════════════
document.getElementById('btn-login')   .addEventListener('click', login);
document.getElementById('btn-register').addEventListener('click', registerUser);
document.getElementById('btn-logout')  .addEventListener('click', logout);
document.getElementById('btn-dark')    .addEventListener('click', toggleDark);
document.getElementById('btn-ai')      .addEventListener('click', registerWithAI);
document.getElementById('btn-save')    .addEventListener('click', saveSettings);

document.getElementById('ai-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') registerWithAI();
});

document.getElementById('prev-day').addEventListener('click', () => {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  currentDate = toDateStr(d);
  renderDate();
  loadDay(currentDate);
});

document.getElementById('next-day').addEventListener('click', () => {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  currentDate = toDateStr(d);
  renderDate();
  loadDay(currentDate);
});

document.querySelectorAll('.tab').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

document.querySelectorAll('.period-tab').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderStats();
  })
);

// Live BMR-oppdatering i innstillinger
['s-kjonn','s-aktivitet','s-alder','s-vekt','s-hoyde'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => {
    settings = {
      ...settings,
      kjonn:     document.getElementById('s-kjonn').value,
      aktivitet: document.getElementById('s-aktivitet').value,
      alder:     Number(document.getElementById('s-alder').value),
      vekt:      Number(document.getElementById('s-vekt').value),
      hoyde:     Number(document.getElementById('s-hoyde').value),
    };
    updateBMRLive();
  })
);

// ═════════════════════════════════════════════════════════
//  OPPSTART
// ═════════════════════════════════════════════════════════
if (localStorage.getItem('dagbok_dark') === '1') {
  document.body.classList.add('dark');
  document.getElementById('btn-dark').textContent = '🌙';
}

init();
