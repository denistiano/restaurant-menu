(function () {
  'use strict';

  const DEFAULT_LOCAL = 'http://127.0.0.1:8080';

  function getMenuApiBase() {
    const w = typeof window !== 'undefined' && window.__MENU_API_BASE__;
    if (w && typeof w === 'string' && w.trim()) return w.trim().replace(/\/?$/, '');
    const meta = document.querySelector('meta[name="menu-api-base"]');
    if (meta) {
      const c = meta.getAttribute('content');
      if (c && c.trim()) return c.trim().replace(/\/?$/, '');
    }
    const h = typeof location !== 'undefined' ? location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return DEFAULT_LOCAL;
    return '';
  }

  function getTokenFromQuery() {
    try {
      const p = new URLSearchParams(location.search);
      const t = p.get('t');
      return t && t.trim() ? t.trim() : '';
    } catch (_) {
      return '';
    }
  }

  const token = getTokenFromQuery();
  const form = document.getElementById('spForm');
  const noToken = document.getElementById('spNoToken');
  const hint = document.getElementById('spHint');
  const errEl = document.getElementById('spErr');
  const okEl = document.getElementById('spOk');
  const submitBtn = document.getElementById('spSubmit');

  if (!token) {
    noToken.classList.remove('sp-hidden');
    hint.classList.add('sp-hidden');
  } else {
    form.classList.remove('sp-hidden');
  }

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.classList.add('sp-hidden');
    const p1 = document.getElementById('spPass').value;
    const p2 = document.getElementById('spPass2').value;
    if (p1 !== p2) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('sp-hidden');
      return;
    }
    if (p1.length < 8) {
      errEl.textContent = 'Use at least 8 characters.';
      errEl.classList.remove('sp-hidden');
      return;
    }
    const base = getMenuApiBase();
    if (!base) {
      errEl.textContent = 'API base not configured (menu-api-base meta).';
      errEl.classList.remove('sp-hidden');
      return;
    }
    submitBtn.disabled = true;
    try {
      const res = await fetch(base + '/api/auth/password/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: p1 })
      });
      if (!res.ok) {
        let msg = res.status === 410 ? 'This link is invalid or has expired. Ask for a new one.' : `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j.message) msg = j.message;
        } catch (_) {}
        errEl.textContent = msg;
        errEl.classList.remove('sp-hidden');
        submitBtn.disabled = false;
        return;
      }
      form.classList.add('sp-hidden');
      hint.classList.add('sp-hidden');
      okEl.classList.remove('sp-hidden');
    } catch (err) {
      errEl.textContent = err.message || 'Network error';
      errEl.classList.remove('sp-hidden');
      submitBtn.disabled = false;
    }
  });
})();
