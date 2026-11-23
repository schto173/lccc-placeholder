// ===== Interest forms (vendors.html, sponsors.html) =====
// Same look and behaviour as the request forms on the main website. Posted to /api/interest (api/server.js),
// which stores the sign-up and sends the emails.
(function () {
  document.querySelectorAll('form.lccc-form').forEach(function (form) {
    const msg = form.querySelector('.form-msg');

    function say(text, warn) {
      msg.textContent = text;
      msg.className = 'form-msg notice' + (warn ? ' notice-gold' : '');
      msg.hidden = !text;
      msg.scrollIntoView({ block: 'nearest' });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const data = { type: form.dataset.form };
      new FormData(form).forEach(function (value, key) { data[key] = value; });
      data.consent = !!form.querySelector('[name=consent]:checked');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      say('Sending…');
      fetch('/api/interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ')'); }); })
        .then(function () {
          form.querySelectorAll('.form-body').forEach(function (b) { b.hidden = true; });
          say(form.dataset.thanks || 'Thank you! We sent you a confirmation email.');
        })
        .catch(function (err) { say('Not sent: ' + err.message + ' You can also email us: royalfamilyeventing+web@gmail.com', true); button.disabled = false; });
    });
  });
})();

// ===== Mobile navigation toggle (as on the main website) =====
(function () {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', function () {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
