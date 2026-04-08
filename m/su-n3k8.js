(function () {
  'use strict';

  const TOKEN_KEY = 'menu_admin_jwt';
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

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
  }
  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function parseAssignments(text) {
    const out = [];
    if (!text || !text.trim()) return out;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf(':');
      if (idx < 1) continue;
      const rid = t.slice(0, idx).trim();
      const role = t.slice(idx + 1).trim().toUpperCase();
      if (!rid || (role !== 'ADMIN' && role !== 'EDITOR')) continue;
      out.push({ restaurantId: rid, role });
    }
    return out;
  }

  function formatAssignments(assignments) {
    if (!assignments || !assignments.length) return '';
    return assignments.map(a => `${a.restaurantId}:${a.role}`).join('\n');
  }

  async function api(path, opts = {}) {
    const base = getMenuApiBase();
    if (!base) throw new Error('menu-api-base not set');
    const headers = { ...opts.headers };
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(base + path, {
      ...opts,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
    });
    return res;
  }

  const el = id => document.getElementById(id);

  async function verifySuper() {
    const res = await api('/api/auth/me');
    if (!res.ok) return false;
    const me = await res.json();
    return !!me.superAdmin;
  }

  async function showMainIfSuper() {
    if (!getToken()) return false;
    if (!(await verifySuper())) {
      clearToken();
      return false;
    }
    el('suLogin').classList.add('su-hidden');
    el('suMain').classList.remove('su-hidden');
    await refreshList();
    return true;
  }

  async function refreshList() {
    const res = await api('/api/super/users');
    if (!res.ok) {
      alert('Failed to load users: HTTP ' + res.status);
      return;
    }
    const users = await res.json();
    const tbody = el('suTbody');
    tbody.innerHTML = '';
    for (const u of users) {
      const tr = document.createElement('tr');
      const venues = (u.assignments || []).map(a => `${a.restaurantId}:${a.role}`).join(', ') || '—';
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${u.enabled ? 'yes' : 'no'}</td>
        <td>${u.superAdmin ? 'yes' : 'no'}</td>
        <td style="max-width:220px;word-break:break-all">${escapeHtml(venues)}</td>
        <td class="su-actions"></td>`;
      const cell = tr.querySelector('.su-actions');
      const editBtn = document.createElement('button');
      editBtn.className = 'su-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openEdit(u));
      const delBtn = document.createElement('button');
      delBtn.className = 'su-btn su-btn--danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteUser(u.id, u.username));
      cell.appendChild(editBtn);
      cell.appendChild(delBtn);
      tbody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openEdit(u) {
    const pwd = prompt('New password (leave empty to keep current, min 8 if set):');
    if (pwd === null) return;
    const en = confirm('User enabled?');
    const sup = confirm('Super administrator?');
    const assignText = prompt('Venue assignments (one per line, retur:ADMIN):', formatAssignments(u.assignments));
    if (assignText === null) return;
    const body = {
      enabled: en,
      superAdmin: sup,
      assignments: parseAssignments(assignText)
    };
    const pwTrim = pwd.trim();
    if (pwTrim) {
      if (pwTrim.length < 8) {
        alert('Password must be at least 8 characters.');
        return;
      }
      body.password = pwTrim;
    }
    (async () => {
      const res = await api(`/api/super/users/${u.id}`, { method: 'PUT', json: body });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const j = await res.json();
          if (j.message) msg = j.message;
        } catch (_) {}
        alert(msg);
        return;
      }
      await refreshList();
    })();
  }

  async function deleteUser(id, username) {
    if (!confirm('Delete user ' + username + '?')) return;
    const res = await api(`/api/super/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Delete failed: HTTP ' + res.status);
      return;
    }
    await refreshList();
  }

  el('suLoginBtn').addEventListener('click', async () => {
    const username = el('suUser').value.trim();
    const password = el('suPass').value;
    const err = el('suLoginErr');
    err.classList.add('su-hidden');
    if (!username || !password) {
      err.textContent = 'Enter username and password.';
      err.classList.remove('su-hidden');
      return;
    }
    const base = getMenuApiBase();
    if (!base) {
      err.textContent = 'Set menu-api-base meta.';
      err.classList.remove('su-hidden');
      return;
    }
    try {
      const res = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        err.textContent = 'Invalid credentials.';
        err.classList.remove('su-hidden');
        return;
      }
      const body = await res.json();
      setToken(body.accessToken);
      if (!body.superAdmin) {
        clearToken();
        err.textContent = 'Not a super administrator.';
        err.classList.remove('su-hidden');
        return;
      }
      el('suPass').value = '';
      await showMainIfSuper();
    } catch (e) {
      err.textContent = e.message || 'Network error';
      err.classList.remove('su-hidden');
    }
  });

  el('suLogoutBtn').addEventListener('click', () => {
    clearToken();
    el('suMain').classList.add('su-hidden');
    el('suLogin').classList.remove('su-hidden');
  });

  el('suRefreshBtn').addEventListener('click', () => refreshList());

  el('suCreateBtn').addEventListener('click', async () => {
    const err = el('suCreateErr');
    err.classList.add('su-hidden');
    const username = el('suNewUser').value.trim();
    const password = el('suNewPass').value;
    const enabled = el('suNewEn').checked;
    const superAdmin = el('suNewSuper').checked;
    const assignments = parseAssignments(el('suNewAssign').value);
    if (!username || password.length < 8) {
      err.textContent = 'Username and password (min 8) required.';
      err.classList.remove('su-hidden');
      return;
    }
    const res = await api('/api/super/users', {
      method: 'POST',
      json: { username, password, enabled, superAdmin, assignments }
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = await res.json();
        if (j.message) msg = j.message;
      } catch (_) {}
      err.textContent = msg;
      err.classList.remove('su-hidden');
      return;
    }
    el('suNewUser').value = '';
    el('suNewPass').value = '';
    el('suNewAssign').value = '';
    await refreshList();
  });

  showMainIfSuper();
})();
