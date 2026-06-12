(function () {
  const cfg = window.TAMARA_CONFIG || {};
  const statusEl = document.getElementById('formStatus');
  const form = document.getElementById('callbackForm');
  const formLoadedAt = Date.now();
  const MIN_FORM_TIME_MS = 2200;
  const LOCAL_RATE_LIMIT_MS = 60000;

  function isConfigured() {
    return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('PROJECTREF') && !cfg.supabaseAnonKey.includes('PASTE_');
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'status ' + (type || '');
  }

  function clean(value, max) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
  }

  function validEmail(value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  }

  function validPhone(value) {
    return /^[0-9+()/.\-\s]{7,40}$/.test(value || '');
  }

  function recentlySubmitted() {
    try {
      const last = Number(localStorage.getItem('tamara:lastCallbackSubmit') || '0');
      return Date.now() - last < LOCAL_RATE_LIMIT_MS;
    } catch (_) {
      return false;
    }
  }

  function markSubmitted() {
    try {
      localStorage.setItem('tamara:lastCallbackSubmit', String(Date.now()));
    } catch (_) {}
  }

  if (!form) return;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(form).entries());

    // Honeypot tegen eenvoudige spambots. Deze controle is geen beveiligingsgrens,
    // maar houdt veel automatische formulierposts tegen voordat Supabase geraakt wordt.
    if (raw.website) {
      form.reset();
      setStatus('Bedankt. Uw terugbelverzoek werd verzonden.', 'ok');
      return;
    }

    if (Date.now() - formLoadedAt < MIN_FORM_TIME_MS) {
      setStatus('Wacht even en probeer opnieuw.', 'err');
      return;
    }

    if (recentlySubmitted()) {
      setStatus('Er werd net al een aanvraag verzonden. Probeer later opnieuw of bel Tamara rechtstreeks.', 'err');
      return;
    }

    const data = {
      name: clean(raw.name, 120),
      phone: clean(raw.phone, 40),
      email: clean(raw.email, 160).toLowerCase(),
      municipality: clean(raw.municipality, 40),
      preferred: clean(raw.preferred, 160),
      message: clean(raw.message, 800)
    };

    if (!data.name || !data.phone || !data.municipality) {
      setStatus('Vul naam, telefoon en gemeente in.', 'err');
      return;
    }
    if (!validPhone(data.phone)) {
      setStatus('Controleer het telefoonnummer.', 'err');
      return;
    }
    if (!validEmail(data.email)) {
      setStatus('Controleer het e-mailadres.', 'err');
      return;
    }

    if (!isConfigured()) {
      const subject = encodeURIComponent('Terugbelverzoek via thuisverplegingtamara.be');
      const body = encodeURIComponent(`Naam: ${data.name}\nTelefoon: ${data.phone}\nE-mail: ${data.email || '-'}\nGemeente: ${data.municipality}\nGewenst contactmoment: ${data.preferred || '-'}\nBoodschap: ${data.message || '-'}`);
      window.location.href = `mailto:${cfg.contactEmail || 'thuisverplegingvoftamara@gmail.com'}?subject=${subject}&body=${body}`;
      setStatus('Supabase is nog niet geconfigureerd. Er wordt een e-mail geopend als tijdelijke fallback.', 'ok');
      return;
    }

    try {
      setStatus('Bezig met verzenden...', '');
      const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { error } = await client.from('callback_requests').insert({
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        municipality: data.municipality,
        preferred_contact_time: data.preferred || null,
        message: data.message || null,
        status: 'nieuw'
      });
      if (error) throw error;
      markSubmitted();
      form.reset();
      setStatus('Bedankt. Uw terugbelverzoek werd verzonden.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Verzenden lukte niet. Bel Tamara rechtstreeks of probeer later opnieuw.', 'err');
    }
  });
})();
