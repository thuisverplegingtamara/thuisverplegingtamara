(function () {
  const cfg = window.TAMARA_CONFIG || {};
  const statusEl = document.getElementById('formStatus');
  const form = document.getElementById('callbackForm');

  function isConfigured() {
    return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('PROJECTREF') && !cfg.supabaseAnonKey.includes('PASTE_');
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'status ' + (type || '');
  }

  if (!form) return;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.phone || !data.municipality) {
      setStatus('Vul naam, telefoon en gemeente in.', 'err');
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
      const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { error } = await client.from('callback_requests').insert({
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email ? data.email.trim() : null,
        municipality: data.municipality,
        preferred_contact_time: data.preferred ? data.preferred.trim() : null,
        message: data.message ? data.message.trim() : null,
        status: 'nieuw'
      });
      if (error) throw error;
      form.reset();
      setStatus('Bedankt. Uw terugbelverzoek werd verzonden.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Verzenden lukte niet. Bel Tamara rechtstreeks of probeer later opnieuw.', 'err');
    }
  });
})();
