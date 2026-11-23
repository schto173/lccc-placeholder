// Interest forms (vendors.html, sponsors.html): sends every named field to /api/interest (api/server.js)
(function () {
  document.querySelectorAll('form[data-type]').forEach(function (form) {
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type="submit"]');

    function say(text, ok) {
      msg.textContent = text;
      msg.className = 'form-msg ' + (ok ? 'is-ok' : 'is-error');
      msg.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { type: form.dataset.type };
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      var missing = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (el) {
        return el.type === 'checkbox' ? !el.checked : !el.value.trim();
      });
      if (missing.length) { say('Please fill in the fields marked with * and tick the box.'); missing[0].focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || '').trim())) { say('Please enter a valid email.'); form.elements.email.focus(); return; }
      btn.disabled = true;
      fetch('/api/interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong.'); });
        })
        .then(function () {
          form.reset();
          say(form.dataset.thanks || 'Thank you! We\'ve sent you a confirmation email.', true);
        })
        .catch(function (err) { say(err.message + ' You can also email us: royalfamilyeventing+web@gmail.com'); })
        .then(function () { btn.disabled = false; });
    });
  });
})();
