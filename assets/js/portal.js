(function () {
  const cfg = window.TAMARA_CONFIG || {};
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
  const LOGIN_BACKOFF_MS = 15000;

  const app = {
    client: null,
    user: null,
    profile: null,
    patient: null,
    patients: [],
    appointments: [],
    recoveringPassword: false
  };

  const $ = (id) => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmtDate = new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDateOnly = new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium' });
  const fmtCurrency = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });

  function configured() {
    return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('PROJECTREF') && !cfg.supabaseAnonKey.includes('PASTE_');
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function clean(value, max = 200) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
  }

  function cleanEmail(value) {
    return clean(value, 160).toLowerCase();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value || '');
  }

  function validPhone(value) {
    return !value || /^[0-9+()/.\-\s]{7,40}$/.test(value);
  }

  function strongEnough(password) {
    return typeof password === 'string' && password.length >= 12;
  }

  function setStatus(id, message, type = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.className = 'status ' + type;
  }

  function setBusy(formOrButton, busy) {
    if (!formOrButton) return;
    const buttons = formOrButton.matches?.('button') ? [formOrButton] : Array.from(formOrButton.querySelectorAll('button[type="submit"], button[data-action]'));
    buttons.forEach(btn => { btn.disabled = Boolean(busy); });
  }

  function localInputToIso(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  function showAuth() {
    $('authView')?.classList.remove('hidden');
    $('dashboardView')?.classList.add('hidden');
  }

  function showDashboard() {
    $('authView')?.classList.add('hidden');
    $('dashboardView')?.classList.remove('hidden');
  }

  function showView(viewId) {
    qsa('.portal-view').forEach(el => el.classList.add('hidden'));
    const target = $(viewId);
    if (target) target.classList.remove('hidden');
    qsa('.portal-menu button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
  }

  function setAuthPanel(name) {
    qsa('[data-auth-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === name));
    qsa('.auth-panel').forEach(p => p.classList.add('hidden'));
    const panels = { login: 'loginForm', signup: 'signupForm', reset: 'resetForm', newPassword: 'newPasswordForm' };
    $(panels[name] || 'loginForm')?.classList.remove('hidden');
    if (name !== 'newPassword') app.recoveringPassword = false;
    setStatus('authStatus', '');
  }

  function renderTable(targetId, headers, rows, empty = 'Geen gegevens gevonden.') {
    const target = $(targetId);
    if (!target) return;
    if (!rows || !rows.length) {
      target.innerHTML = `<p class="muted">${esc(empty)}</p>`;
      return;
    }
    target.innerHTML = `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function lastLoginAttemptTooSoon() {
    try {
      const last = Number(localStorage.getItem('tamara:lastLoginFail') || '0');
      return Date.now() - last < LOGIN_BACKOFF_MS;
    } catch (_) {
      return false;
    }
  }

  function markLoginFailure() {
    try { localStorage.setItem('tamara:lastLoginFail', String(Date.now())); } catch (_) {}
  }

  async function init() {
    qsa('[data-auth-tab]').forEach(btn => btn.addEventListener('click', () => setAuthPanel(btn.dataset.authTab)));
    qsa('.portal-menu button').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
    qsa('[data-refresh]').forEach(btn => btn.addEventListener('click', () => refreshAdminSection(btn.dataset.refresh)));

    $('loginForm')?.addEventListener('submit', handleLogin);
    $('signupForm')?.addEventListener('submit', handleSignup);
    $('resetForm')?.addEventListener('submit', handleReset);
    $('newPasswordForm')?.addEventListener('submit', handleNewPassword);
    $('logoutBtn')?.addEventListener('click', handleLogout);
    $('patientForm')?.addEventListener('submit', handlePatientUpsert);
    $('appointmentForm')?.addEventListener('submit', handleAppointmentCreate);
    $('documentForm')?.addEventListener('submit', handleDocumentUpload);
    $('costForm')?.addEventListener('submit', handleCostCreate);
    document.addEventListener('click', handleActionClick);

    if (!configured()) {
      $('configWarning')?.classList.remove('hidden');
      setStatus('authStatus', 'Configureer eerst Supabase voordat de login werkt.', 'err');
      return;
    }

    app.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    app.client.auth.onAuthStateChange(async (eventName, session) => {
      if (eventName === 'PASSWORD_RECOVERY') {
        app.user = session?.user || null;
        app.recoveringPassword = true;
        showAuth();
        setAuthPanel('newPassword');
        setStatus('authStatus', 'Kies een nieuw wachtwoord om de reset af te ronden.', 'ok');
        return;
      }
      if (app.recoveringPassword) return;
      if (session?.user) await loadUser(session.user);
      else showAuth();
    });

    const { data } = await app.client.auth.getSession();
    const urlParams = new URLSearchParams((window.location.hash || window.location.search).replace(/^[#?]/, ''));
    if (urlParams.get('type') === 'recovery' && data.session?.user) {
      app.user = data.session.user;
      app.recoveringPassword = true;
      showAuth();
      setAuthPanel('newPassword');
      setStatus('authStatus', 'Kies een nieuw wachtwoord om de reset af te ronden.', 'ok');
    } else if (data.session?.user) {
      await loadUser(data.session.user);
    } else {
      showAuth();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!app.client) return;
    if (lastLoginAttemptTooSoon()) {
      return setStatus('authStatus', 'Te veel pogingen. Wacht enkele seconden en probeer opnieuw.', 'err');
    }
    const form = event.currentTarget;
    const email = cleanEmail($('loginEmail').value);
    const password = $('loginPassword').value;
    if (!validEmail(email) || !password) return setStatus('authStatus', 'Controleer e-mail en wachtwoord.', 'err');
    setBusy(form, true);
    setStatus('authStatus', 'Aanmelden...', '');
    const { data, error } = await app.client.auth.signInWithPassword({ email, password });
    setBusy(form, false);
    if (error) {
      markLoginFailure();
      console.error(error);
      return setStatus('authStatus', 'Aanmelden mislukt. Controleer uw gegevens of reset uw wachtwoord.', 'err');
    }
    await loadUser(data.user);
  }

  async function handleSignup(event) {
    event.preventDefault();
    if (!app.client) return;
    const form = event.currentTarget;
    const fullName = clean($('signupName').value, 120);
    const phone = clean($('signupPhone').value, 40);
    const email = cleanEmail($('signupEmail').value);
    const password = $('signupPassword').value;
    if (!fullName || !validEmail(email) || !strongEnough(password) || !validPhone(phone)) {
      return setStatus('authStatus', 'Controleer naam, telefoon, e-mail en wachtwoord. Gebruik minstens 12 tekens.', 'err');
    }
    setBusy(form, true);
    setStatus('authStatus', 'Accountaanvraag wordt verzonden...', '');
    const { data, error } = await app.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: cfg.siteUrl ? `${cfg.siteUrl}/patientenzone.html` : window.location.href
      }
    });
    setBusy(form, false);
    if (error) {
      console.error(error);
      return setStatus('authStatus', 'Accountaanvraag kon niet verwerkt worden. Controleer het e-mailadres of contacteer Tamara.', 'err');
    }
    if (data.session?.user) {
      await app.client.from('profiles').update({ full_name: fullName, phone, status: 'pending' }).eq('id', data.session.user.id);
    }
    form.reset();
    setStatus('authStatus', 'Accountaanvraag ontvangen. Controleer eventueel uw mailbox en wacht tot Tamara uw account koppelt.', 'ok');
    setAuthPanel('login');
  }

  async function handleReset(event) {
    event.preventDefault();
    if (!app.client) return;
    const email = cleanEmail($('resetEmail').value);
    if (!validEmail(email)) return setStatus('authStatus', 'Controleer het e-mailadres.', 'err');
    const form = event.currentTarget;
    setBusy(form, true);
    const { error } = await app.client.auth.resetPasswordForEmail(email, { redirectTo: cfg.siteUrl ? `${cfg.siteUrl}/patientenzone.html` : window.location.href });
    setBusy(form, false);
    if (error) console.error(error);
    setStatus('authStatus', 'Resetlink verzonden als dit e-mailadres bestaat.', 'ok');
  }

  async function handleNewPassword(event) {
    event.preventDefault();
    if (!app.client) return;
    const password = $('newPassword').value;
    const confirm = $('newPasswordConfirm').value;
    if (!strongEnough(password)) return setStatus('authStatus', 'Gebruik minstens 12 tekens.', 'err');
    if (password !== confirm) return setStatus('authStatus', 'De wachtwoorden komen niet overeen.', 'err');
    const form = event.currentTarget;
    setBusy(form, true);
    setStatus('authStatus', 'Nieuw wachtwoord wordt opgeslagen...', '');
    const { error } = await app.client.auth.updateUser({ password });
    setBusy(form, false);
    if (error) {
      console.error(error);
      return setStatus('authStatus', 'Het wachtwoord kon niet aangepast worden. Vraag eventueel een nieuwe resetlink aan.', 'err');
    }
    form.reset();
    app.recoveringPassword = false;
    await app.client.auth.signOut();
    showAuth();
    setAuthPanel('login');
    setStatus('authStatus', 'Uw wachtwoord is aangepast. Meld u opnieuw aan met uw nieuwe wachtwoord.', 'ok');
  }

  async function handleLogout() {
    if (!app.client) return;
    await app.client.auth.signOut();
    app.user = null; app.profile = null; app.patient = null; app.patients = []; app.appointments = [];
    showAuth();
  }

  async function loadUser(user) {
    app.user = user;
    const { data: profile, error } = await app.client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      console.error(error);
      setStatus('authStatus', 'Profiel kon niet geladen worden.', 'err');
      return;
    }
    app.profile = profile || { id: user.id, email: user.email, role: 'patient', status: 'pending' };
    if (app.profile.status === 'disabled') {
      await app.client.auth.signOut();
      showAuth();
      return setStatus('authStatus', 'Dit account is niet actief. Contacteer Tamara.', 'err');
    }
    $('userIdentity').textContent = app.profile.full_name || user.email;
    const isAdmin = app.profile.role === 'admin' && app.profile.status === 'active';
    $('roleBadge').textContent = isAdmin ? 'Admin' : 'Patiënt';
    $('patientMenu').classList.toggle('hidden', isAdmin);
    $('adminMenu').classList.toggle('hidden', !isAdmin);
    showDashboard();
    if (isAdmin) {
      showView('adminOverview');
      await loadAdminDashboard();
    } else {
      showView('patientOverview');
      await loadPatientDashboard();
    }
  }

  async function loadPatientDashboard() {
    const { data: patient, error } = await app.client.from('patients').select('*').eq('user_id', app.user.id).eq('active', true).maybeSingle();
    if (error) console.error(error);
    app.patient = patient || null;
    if (!app.patient) {
      $('patientIntro').innerHTML = 'Uw login is aangemaakt, maar is nog niet gekoppeld aan een patiëntendossier. Contacteer Tamara wanneer dit onverwacht is.';
      renderTable('patientAppointmentsTable', [], [], 'Nog geen gekoppelde agenda.');
      renderTable('patientDocumentsTable', [], [], 'Nog geen gekoppeld dossier.');
      renderTable('patientCostsTable', [], [], 'Nog geen kostenoverzicht.');
      return;
    }
    $('patientIntro').innerHTML = `Welkom ${esc(app.patient.full_name)}. Hieronder vindt u uw afspraken, documenten en kostenoverzicht.`;
    await Promise.all([loadPatientAppointments(), loadPatientDocuments(), loadPatientCosts()]);
  }

  async function loadPatientAppointments() {
    const { data, error } = await app.client.from('appointments').select('*').eq('patient_id', app.patient.id).order('starts_at', { ascending: true });
    if (error) return console.error(error);
    app.appointments = data || [];
    const upcoming = app.appointments.find(a => new Date(a.starts_at) >= new Date() && a.status !== 'geannuleerd');
    $('nextAppointment').innerHTML = upcoming ? `<strong>${esc(upcoming.title)}</strong><br>${esc(fmtDate.format(new Date(upcoming.starts_at)))}<br><span class="muted">${esc(upcoming.location || '')}</span>` : '<span class="muted">Geen komende afspraak gevonden.</span>';
    const rows = app.appointments.map(a => `<tr><td>${esc(fmtDate.format(new Date(a.starts_at)))}</td><td>${esc(a.title)}</td><td>${esc(a.care_type || '')}</td><td><span class="badge green">${esc(a.status)}</span></td><td>${esc(a.location || '')}</td><td><button class="btn btn-ghost btn-small" data-action="ics" data-id="${esc(a.id)}">ICS</button></td></tr>`);
    renderTable('patientAppointmentsTable', ['Datum', 'Titel', 'Type', 'Status', 'Locatie', 'Kalender'], rows, 'Geen afspraken gevonden.');
  }

  async function loadPatientDocuments() {
    const { data, error } = await app.client.from('documents').select('*').eq('patient_id', app.patient.id).order('created_at', { ascending: false });
    if (error) return console.error(error);
    const rows = (data || []).map(d => `<tr><td>${esc(d.title)}</td><td>${esc(d.category || '')}</td><td>${esc(fmtDateOnly.format(new Date(d.created_at)))}</td><td><button class="btn btn-ghost btn-small" data-action="download-doc" data-path="${esc(d.file_path)}">Download</button></td></tr>`);
    renderTable('patientDocumentsTable', ['Titel', 'Categorie', 'Datum', 'Bestand'], rows, 'Geen documenten gevonden.');
  }

  async function loadPatientCosts() {
    const { data, error } = await app.client.from('costs').select('*').eq('patient_id', app.patient.id).order('care_date', { ascending: false });
    if (error) return console.error(error);
    const open = (data || []).filter(c => c.status !== 'betaald').reduce((sum, c) => sum + Number(c.amount || 0), 0);
    $('openAmount').innerHTML = `<strong style="font-size:1.8rem;color:var(--sage-deep)">${fmtCurrency.format(open)}</strong>`;
    const rows = (data || []).map(c => `<tr><td>${esc(fmtDateOnly.format(new Date(c.care_date)))}</td><td>${esc(c.description)}</td><td>${esc(fmtCurrency.format(Number(c.amount)))}</td><td><span class="badge ${c.status === 'betaald' ? 'green' : ''}">${esc(c.status)}</span></td></tr>`);
    renderTable('patientCostsTable', ['Datum', 'Omschrijving', 'Bedrag', 'Status'], rows, 'Geen kosten gevonden.');
  }

  async function loadAdminDashboard() {
    await loadPatients();
    await Promise.all([loadRequests(), loadAdminAppointments(), loadAdminDocuments(), loadAdminCosts()]);
    $('adminStats').innerHTML = `
      <div class="info-card"><h3>Patiënten</h3><p style="font-size:2rem;font-weight:900;color:var(--sage-deep)">${app.patients.length}</p></div>
      <div class="info-card"><h3>Volgende afspraken</h3><p style="font-size:2rem;font-weight:900;color:var(--sage-deep)">${app.appointments.filter(a => new Date(a.starts_at) >= new Date() && a.status !== 'geannuleerd').length}</p></div>`;
  }

  async function refreshAdminSection(section) {
    if (section === 'requests') await loadRequests();
    if (section === 'patients') await loadPatients();
    if (section === 'appointments') await loadAdminAppointments();
    if (section === 'documents') await loadAdminDocuments();
    if (section === 'costs') await loadAdminCosts();
  }

  async function loadPatients() {
    const { data, error } = await app.client.from('patients').select('*').order('full_name', { ascending: true });
    if (error) return console.error(error);
    app.patients = data || [];
    const options = app.patients.map(p => `<option value="${esc(p.id)}">${esc(p.full_name)} (${esc(p.municipality || '-')})</option>`).join('');
    ['appointmentPatient', 'documentPatient', 'costPatient'].forEach(id => { const el = $(id); if (el) el.innerHTML = options || '<option value="">Geen patiënten</option>'; });
    const rows = app.patients.map(p => `<tr><td>${esc(p.full_name)}</td><td>${esc(p.email || '')}</td><td>${esc(p.phone || '')}</td><td>${esc(p.municipality || '')}</td><td>${p.user_id ? '<span class="badge green">gekoppeld</span>' : '<span class="badge">geen login</span>'}</td></tr>`);
    renderTable('patientsTable', ['Naam', 'E-mail', 'Telefoon', 'Gemeente', 'Login'], rows, 'Geen patiënten gevonden.');
  }

  async function loadRequests() {
    const { data, error } = await app.client.from('callback_requests').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    const rows = (data || []).map(r => `<tr><td>${esc(fmtDate.format(new Date(r.created_at)))}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.email || '')}</td><td>${esc(r.municipality || '')}</td><td>${esc(r.preferred_contact_time || '')}</td><td>${esc(r.message || '')}</td><td><span class="badge ${r.status === 'afgewerkt' ? 'green' : ''}">${esc(r.status)}</span></td><td><button class="btn btn-ghost btn-small" data-action="request-contacted" data-id="${esc(r.id)}">Gecontacteerd</button> <button class="btn btn-secondary btn-small" data-action="request-done" data-id="${esc(r.id)}">Afwerken</button></td></tr>`);
    renderTable('requestsTable', ['Datum', 'Naam', 'Telefoon', 'E-mail', 'Gemeente', 'Moment', 'Boodschap', 'Status', 'Actie'], rows, 'Geen terugbelaanvragen gevonden.');
  }

  async function loadAdminAppointments() {
    const { data, error } = await app.client.from('appointments').select('*, patients(full_name)').order('starts_at', { ascending: false });
    if (error) return console.error(error);
    app.appointments = data || [];
    const rows = app.appointments.map(a => `<tr><td>${esc(a.patients?.full_name || '')}</td><td>${esc(fmtDate.format(new Date(a.starts_at)))}</td><td>${esc(a.title)}</td><td>${esc(a.care_type || '')}</td><td><span class="badge green">${esc(a.status)}</span></td><td><button class="btn btn-ghost btn-small" data-action="delete-appointment" data-id="${esc(a.id)}">Verwijder</button></td></tr>`);
    renderTable('appointmentsTable', ['Patiënt', 'Datum', 'Titel', 'Type', 'Status', 'Actie'], rows, 'Geen afspraken gevonden.');
  }

  async function loadAdminDocuments() {
    const { data, error } = await app.client.from('documents').select('*, patients(full_name)').order('created_at', { ascending: false });
    if (error) return console.error(error);
    const rows = (data || []).map(d => `<tr><td>${esc(d.patients?.full_name || '')}</td><td>${esc(d.title)}</td><td>${esc(d.category || '')}</td><td>${esc(fmtDateOnly.format(new Date(d.created_at)))}</td><td><button class="btn btn-ghost btn-small" data-action="download-doc" data-path="${esc(d.file_path)}">Download</button> <button class="btn btn-secondary btn-small" data-action="delete-doc" data-id="${esc(d.id)}" data-path="${esc(d.file_path)}">Verwijder</button></td></tr>`);
    renderTable('documentsTable', ['Patiënt', 'Titel', 'Categorie', 'Datum', 'Actie'], rows, 'Geen documenten gevonden.');
  }

  async function loadAdminCosts() {
    const { data, error } = await app.client.from('costs').select('*, patients(full_name)').order('care_date', { ascending: false });
    if (error) return console.error(error);
    const rows = (data || []).map(c => `<tr><td>${esc(c.patients?.full_name || '')}</td><td>${esc(fmtDateOnly.format(new Date(c.care_date)))}</td><td>${esc(c.description)}</td><td>${esc(fmtCurrency.format(Number(c.amount)))}</td><td><span class="badge ${c.status === 'betaald' ? 'green' : ''}">${esc(c.status)}</span></td><td><button class="btn btn-ghost btn-small" data-action="delete-cost" data-id="${esc(c.id)}">Verwijder</button></td></tr>`);
    renderTable('costsTable', ['Patiënt', 'Datum', 'Omschrijving', 'Bedrag', 'Status', 'Actie'], rows, 'Geen kosten gevonden.');
  }

  async function handlePatientUpsert(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fullName = clean($('patientName').value, 120);
    const email = cleanEmail($('patientEmail').value);
    const phone = clean($('patientPhone').value, 40);
    const municipality = $('patientMunicipality').value;
    if (!fullName || !validEmail(email) || !validPhone(phone)) return setStatus('patientFormStatus', 'Controleer naam, e-mail en telefoon.', 'err');
    setBusy(form, true);
    setStatus('patientFormStatus', 'Patiënt wordt opgeslagen...', '');
    const { data: profile, error: profileError } = await app.client.from('profiles').select('id,email').eq('email', email).maybeSingle();
    if (profileError) {
      setBusy(form, false);
      return setStatus('patientFormStatus', 'Profiel kon niet gecontroleerd worden.', 'err');
    }
    const payload = { full_name: fullName, email, phone: phone || null, municipality, active: true, user_id: profile?.id || null };
    const { error } = await app.client.from('patients').upsert(payload, { onConflict: 'email' });
    if (!error && profile?.id) await app.client.from('profiles').update({ role: 'patient', status: 'active', full_name: fullName, phone: phone || null }).eq('id', profile.id);
    setBusy(form, false);
    if (error) return setStatus('patientFormStatus', error.message, 'err');
    form.reset();
    setStatus('patientFormStatus', profile?.id ? 'Patiënt opgeslagen en login gekoppeld.' : 'Patiënt opgeslagen. Login nog niet gekoppeld: patiënt moet zich eerst aanmelden/registreren met dit e-mailadres.', 'ok');
    await loadPatients();
  }

  async function handleAppointmentCreate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const startsAt = localInputToIso($('appointmentStart').value);
    const endsAt = localInputToIso($('appointmentEnd').value);
    if (!startsAt) return setStatus('appointmentStatusMessage', 'Kies een geldige startdatum.', 'err');
    if (endsAt && new Date(endsAt) < new Date(startsAt)) return setStatus('appointmentStatusMessage', 'Eindtijd mag niet vóór starttijd liggen.', 'err');
    const payload = {
      patient_id: $('appointmentPatient').value,
      title: clean($('appointmentTitle').value, 120),
      care_type: $('appointmentType').value,
      starts_at: startsAt,
      ends_at: endsAt,
      location: clean($('appointmentLocation').value, 160) || 'Aan huis',
      status: $('appointmentStatus').value,
      notes: clean($('appointmentNotes').value, 1000) || null
    };
    if (!payload.patient_id || !payload.title) return setStatus('appointmentStatusMessage', 'Kies een patiënt en titel.', 'err');
    setBusy(form, true);
    setStatus('appointmentStatusMessage', 'Afspraak wordt opgeslagen...', '');
    const { error } = await app.client.from('appointments').insert(payload);
    setBusy(form, false);
    if (error) return setStatus('appointmentStatusMessage', error.message, 'err');
    form.reset();
    $('appointmentTitle').value = 'Thuisverpleging';
    setStatus('appointmentStatusMessage', 'Afspraak opgeslagen.', 'ok');
    await loadAdminAppointments();
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const patientId = $('documentPatient').value;
    const title = clean($('documentTitle').value, 160);
    const file = $('documentFile').files[0];
    if (!patientId || !title || !file) return setStatus('documentStatusMessage', 'Kies patiënt, titel en bestand.', 'err');
    if (!ALLOWED_MIME.has(file.type)) return setStatus('documentStatusMessage', 'Alleen PDF, PNG en JPG zijn toegelaten.', 'err');
    if (file.size > MAX_FILE_SIZE) return setStatus('documentStatusMessage', 'Bestand is te groot. Maximum is 10 MB.', 'err');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
    const path = `${patientId}/${crypto.randomUUID()}-${safeName}`;
    setBusy(form, true);
    setStatus('documentStatusMessage', 'Document wordt opgeladen...', '');
    const upload = await app.client.storage.from('patient-files').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (upload.error) {
      setBusy(form, false);
      return setStatus('documentStatusMessage', upload.error.message, 'err');
    }
    const { error } = await app.client.from('documents').insert({ patient_id: patientId, title, category: $('documentCategory').value, file_path: path, mime_type: file.type || null, file_size: file.size });
    if (error) {
      await app.client.storage.from('patient-files').remove([path]);
      setBusy(form, false);
      return setStatus('documentStatusMessage', error.message, 'err');
    }
    form.reset();
    setBusy(form, false);
    setStatus('documentStatusMessage', 'Document opgeladen.', 'ok');
    await loadAdminDocuments();
  }

  async function handleCostCreate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = Number($('costAmount').value);
    const payload = {
      patient_id: $('costPatient').value,
      care_date: $('costDate').value,
      amount,
      status: $('costStatus').value,
      description: clean($('costDescription').value, 200),
      notes: clean($('costNotes').value, 1000) || null
    };
    if (!payload.patient_id || !payload.care_date || !payload.description || !Number.isFinite(amount) || amount < 0 || amount > 99999) {
      return setStatus('costStatusMessage', 'Controleer patiënt, datum, omschrijving en bedrag.', 'err');
    }
    setBusy(form, true);
    setStatus('costStatusMessage', 'Kost wordt opgeslagen...', '');
    const { error } = await app.client.from('costs').insert(payload);
    setBusy(form, false);
    if (error) return setStatus('costStatusMessage', error.message, 'err');
    form.reset();
    setStatus('costStatusMessage', 'Kost opgeslagen.', 'ok');
    await loadAdminCosts();
  }

  async function handleActionClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn || !app.client) return;
    const action = btn.dataset.action;
    try {
      if (action === 'download-doc') {
        const path = btn.dataset.path;
        const { data, error } = await app.client.storage.from('patient-files').createSignedUrl(path, 300);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
      if (action === 'request-contacted') {
        const { error } = await app.client.from('callback_requests').update({ status: 'gecontacteerd' }).eq('id', btn.dataset.id);
        if (error) throw error;
        await loadRequests();
      }
      if (action === 'request-done') {
        const { error } = await app.client.from('callback_requests').update({ status: 'afgewerkt' }).eq('id', btn.dataset.id);
        if (error) throw error;
        await loadRequests();
      }
      if (action === 'delete-appointment' && confirm('Afspraak definitief verwijderen?')) {
        const { error } = await app.client.from('appointments').delete().eq('id', btn.dataset.id);
        if (error) throw error;
        await loadAdminAppointments();
      }
      if (action === 'delete-cost' && confirm('Kost definitief verwijderen?')) {
        const { error } = await app.client.from('costs').delete().eq('id', btn.dataset.id);
        if (error) throw error;
        await loadAdminCosts();
      }
      if (action === 'delete-doc' && confirm('Document definitief verwijderen? Controleer of dit volgens de bewaartermijn/procedure mag.')) {
        const { error } = await app.client.from('documents').delete().eq('id', btn.dataset.id);
        if (error) throw error;
        const removed = await app.client.storage.from('patient-files').remove([btn.dataset.path]);
        if (removed.error) alert('Dossierrecord verwijderd, maar het bestand kon niet automatisch uit opslag verwijderd worden. Controleer Supabase Storage handmatig.');
        await loadAdminDocuments();
      }
      if (action === 'ics') {
        const appt = app.appointments.find(a => a.id === btn.dataset.id);
        if (appt) downloadICS(appt);
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Actie mislukt.');
    }
  }

  function icsDate(date) {
    return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function escapeICS(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function downloadICS(appt) {
    const start = icsDate(appt.starts_at);
    const end = icsDate(appt.ends_at || new Date(new Date(appt.starts_at).getTime() + 30 * 60000));
    const title = escapeICS(appt.title || 'Afspraak Tamara Thuisverpleging');
    const location = escapeICS(appt.location || '');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Tamara Thuisverpleging//Patientenzone//NL\nBEGIN:VEVENT\nUID:${appt.id}@thuisverplegingtamara.be\nDTSTAMP:${icsDate(new Date())}\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${title}\nLOCATION:${location}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'afspraak-tamara-thuisverpleging.ics';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
