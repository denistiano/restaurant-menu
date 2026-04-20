(function () {
  'use strict';

  var TOKEN_KEY = 'menu_admin_jwt';
  var SUPER_MIRROR_KEY = 'menu_admin_jwt_super_mirror';
  var DEFAULT_LOCAL = 'http://127.0.0.1:8080';

  function getMenuApiBase() {
    var w = typeof window !== 'undefined' && window.__MENU_API_BASE__;
    if (w && typeof w === 'string' && w.trim()) return w.trim().replace(/\/?$/, '');
    var meta = document.querySelector('meta[name="menu-api-base"]');
    if (meta) {
      var c = meta.getAttribute('content');
      if (c && c.trim()) return c.trim().replace(/\/?$/, '');
    }
    var h = typeof location !== 'undefined' ? location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return DEFAULT_LOCAL;
    return '';
  }

  function buildPasswordSetupPageUrl(rawToken) {
    var u = new URL(location.href);
    var basePath = u.pathname.replace(/[^/]+$/, '');
    var path = basePath + 'set-password.html?t=' + encodeURIComponent(rawToken);
    return u.origin + path;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
      try {
        localStorage.setItem(SUPER_MIRROR_KEY, t);
      } catch (_) {}
    }
  }
  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    try {
      localStorage.removeItem(SUPER_MIRROR_KEY);
    } catch (_) {}
  }

  var venueCatalog = [];
  var editAssignmentList = [];
  var newUserAssignmentList = [];

  function formatApiError(j, status) {
    if (!j || typeof j !== 'object') return 'HTTP ' + status;
    if (typeof j.detail === 'string' && j.detail) return j.detail;
    if (typeof j.message === 'string' && j.message) return j.message;
    if (Array.isArray(j.errors)) {
      var parts = j.errors.map(function (e) {
        if (typeof e === 'string') return e;
        if (e && e.defaultMessage) return e.defaultMessage;
        if (e && (e.field || e.property) && e.message) return (e.field || e.property) + ': ' + e.message;
        return e && e.message ? String(e.message) : JSON.stringify(e);
      });
      if (parts.length) return parts.join('; ');
    }
    if (Array.isArray(j.violations)) {
      var v = j.violations.map(function (x) {
        return (x.field || x.path || '') + ': ' + (x.message || '');
      });
      if (v.length) return v.join('; ');
    }
    return 'HTTP ' + status;
  }

  function loadVenueCatalog() {
    return api('/api/super/venues')
      .then(function (res) {
        if (!res.ok) {
          venueCatalog = [];
          return;
        }
        return res.json().then(function (list) {
          venueCatalog = Array.isArray(list) ? list : [];
        });
      })
      .catch(function () {
        venueCatalog = [];
      });
  }

  function findVenue(restaurantId) {
    for (var i = 0; i < venueCatalog.length; i++) {
      if (venueCatalog[i].restaurantId === restaurantId) return venueCatalog[i];
    }
    return null;
  }

  function venueLabel(v, restaurantId) {
    if (v) {
      var en = (v.nameEn || '').trim();
      var bg = (v.nameBg || '').trim();
      if (en && bg) return en + ' · ' + bg;
      if (en || bg) return en || bg;
    }
    return restaurantId;
  }

  function assignmentListForPrefix(prefix) {
    return prefix === 'suEdit' ? editAssignmentList : newUserAssignmentList;
  }

  function normalizeRole(r) {
    var u = String(r || 'ADMIN').toUpperCase();
    return u === 'EDITOR' ? 'EDITOR' : 'ADMIN';
  }

  function assignmentsPayloadFromList(list) {
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var rid = String(list[i].restaurantId || '').trim();
      if (!rid || seen[rid]) continue;
      seen[rid] = true;
      out.push({ restaurantId: rid, role: normalizeRole(list[i].role) });
    }
    return out;
  }

  function renderVenueAssignmentUI(prefix) {
    var list = assignmentListForPrefix(prefix);
    var searchEl = el(prefix === 'suEdit' ? 'suEditVenueSearch' : 'suNewVenueSearch');
    var chosenEl = el(prefix === 'suEdit' ? 'suEditVenueChosen' : 'suNewVenueChosen');
    var pickEl = el(prefix === 'suEdit' ? 'suEditVenuePick' : 'suNewVenuePick');
    if (!chosenEl || !pickEl) return;
    var q = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();

    chosenEl.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'su-venue-empty';
      empty.textContent = 'No venues assigned — add from the list below.';
      chosenEl.appendChild(empty);
    } else {
      list.forEach(function (ass, idx) {
        var v = findVenue(ass.restaurantId);
        var chip = document.createElement('div');
        chip.className = 'su-venue-chip';
        var lab = document.createElement('span');
        lab.textContent = venueLabel(v, ass.restaurantId);
        chip.appendChild(lab);
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Role for ' + ass.restaurantId);
        ;['ADMIN', 'EDITOR'].forEach(function (role) {
          var opt = document.createElement('option');
          opt.value = role;
          opt.textContent = role;
          if (normalizeRole(ass.role) === role) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          list[idx].role = sel.value;
        });
        chip.appendChild(sel);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'su-venue-chip__remove';
        rm.setAttribute('aria-label', 'Remove ' + ass.restaurantId);
        rm.textContent = '×';
        rm.addEventListener('click', function () {
          list.splice(idx, 1);
          renderVenueAssignmentUI(prefix);
        });
        chip.appendChild(rm);
        chosenEl.appendChild(chip);
      });
    }

    pickEl.innerHTML = '';
    var added = 0;
    for (var j = 0; j < venueCatalog.length; j++) {
      var rowVenue = venueCatalog[j];
      var rid = rowVenue.restaurantId;
      var taken = list.some(function (a) { return a.restaurantId === rid; });
      if (taken) continue;
      var label = venueLabel(rowVenue, rid).toLowerCase();
      if (q && label.indexOf(q) < 0 && String(rid).toLowerCase().indexOf(q) < 0) continue;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'su-venue-row';
      var title = document.createElement('span');
      title.textContent = venueLabel(rowVenue, rid);
      btn.appendChild(title);
      var sub = document.createElement('div');
      sub.className = 'su-venue-row__id';
      sub.textContent = rid;
      btn.appendChild(sub);
      (function (id) {
        btn.addEventListener('click', function () {
          list.push({ restaurantId: id, role: 'ADMIN' });
          renderVenueAssignmentUI(prefix);
        });
      })(rid);
      pickEl.appendChild(btn);
      added++;
    }
    if (!added) {
      var em = document.createElement('div');
      em.className = 'su-venue-empty';
      em.textContent = venueCatalog.length
        ? 'No matching venues (or all already assigned).'
        : 'No venues in menu database yet — publish a menu first.';
      pickEl.appendChild(em);
    }
  }

  function api(path, opts) {
    opts = opts || {};
    var base = getMenuApiBase();
    if (!base) return Promise.reject(new Error('menu-api-base not set'));
    var headers = {};
    for (var k in opts.headers) headers[k] = opts.headers[k];
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    /* Omit credentials: Operations uses Bearer only. Including cookies requires
       Access-Control-Allow-Credentials: true on /api/** — our API only enables that for /api/auth/login|logout. */
    return fetch(base + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
    });
  }

  function el(id) {
    return document.getElementById(id);
  }

  var editTargetUser = null;

  function verifySuper() {
    return api('/api/auth/me').then(function (res) {
      if (!res.ok) return false;
      return res.json().then(function (me) {
        return !!me.superAdmin;
      });
    });
  }

  function showMainIfSuper() {
    if (!getToken()) return Promise.resolve(false);
    return verifySuper().then(function (ok) {
      if (!ok) {
        clearToken();
        return false;
      }
      el('suLogin').classList.add('su-hidden');
      el('suMain').classList.remove('su-hidden');
      var logsA = el('suLogsLink');
      if (logsA) logsA.href = 'logs.html';
      return loadVenueCatalog()
        .then(function () {
          return refreshList();
        })
        .then(function () {
          if (el('suNewVenueChosen')) renderVenueAssignmentUI('suNew');
          return true;
        });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fillVenuesTableCell(td, assignments) {
    td.className = 'su-table-venues';
    td.textContent = '';
    if (!assignments || !assignments.length) {
      td.classList.add('su-table-venues--empty');
      td.textContent = '—';
      return;
    }
    assignments.forEach(function (a) {
      var pill = document.createElement('span');
      pill.className = 'su-table-pill';
      pill.title = a.restaurantId + ' · ' + String(a.role || 'ADMIN').toUpperCase();
      var nameSpan = document.createElement('span');
      nameSpan.className = 'su-table-pill__name';
      var v = findVenue(a.restaurantId);
      nameSpan.textContent = venueLabel(v, a.restaurantId);
      var roleSpan = document.createElement('span');
      roleSpan.className = 'su-table-pill__role';
      roleSpan.textContent = String(a.role || 'ADMIN').toUpperCase();
      pill.appendChild(nameSpan);
      pill.appendChild(roleSpan);
      td.appendChild(pill);
    });
  }

  function refreshList() {
    var tbody = el('suTbody');
    if (!tbody) return Promise.resolve();
    return api('/api/super/users').then(function (res) {
      if (!res.ok) {
        alert('Failed to load users: HTTP ' + res.status);
        return;
      }
      return res.json().then(function (users) {
        tbody.innerHTML = '';
        /* forEach + .bind: a `for` loop with `var u` made every row's Setup link / Delete target the last user. */
        users.forEach(function (u) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' +
            u.id +
            '</td><td>' +
            escapeHtml(u.username) +
            '</td><td>' +
            (u.enabled ? 'yes' : 'no') +
            '</td><td>' +
            (u.superAdmin ? 'yes' : 'no') +
            '</td><td></td><td class="su-actions"></td>';
          fillVenuesTableCell(tr.cells[4], u.assignments);
          var cell = tr.querySelector('.su-actions');
          var editBtn = document.createElement('button');
          editBtn.className = 'su-btn';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', openEditModal.bind(null, u));
          var linkBtn = document.createElement('button');
          linkBtn.className = 'su-btn';
          linkBtn.textContent = 'Setup link';
          linkBtn.title = 'Generate URL + QR for password set/reset';
          linkBtn.addEventListener('click', generateSetupLink.bind(null, u.id));
          var delBtn = document.createElement('button');
          delBtn.className = 'su-btn su-btn--danger';
          delBtn.textContent = 'Delete';
          delBtn.addEventListener('click', deleteUser.bind(null, u.id, u.username));
          cell.appendChild(editBtn);
          cell.appendChild(linkBtn);
          cell.appendChild(delBtn);
          tbody.appendChild(tr);
        });
      });
    });
  }

  function openEditModal(u) {
    editTargetUser = u;
    el('suEditUsername').textContent = 'Username: ' + u.username;
    el('suEditEn').checked = !!u.enabled;
    el('suEditSuper').checked = !!u.superAdmin;
    editAssignmentList = (u.assignments || []).map(function (a) {
      return { restaurantId: a.restaurantId, role: normalizeRole(a.role) };
    });
    if (el('suEditVenueSearch')) el('suEditVenueSearch').value = '';
    renderVenueAssignmentUI('suEdit');
    el('suEditPass').value = '';
    el('suEditPass2').value = '';
    el('suEditErr').classList.add('su-hidden');
    el('suEditBackdrop').classList.remove('su-hidden');
  }

  function closeEditModal() {
    editTargetUser = null;
    var eb = el('suEditBackdrop');
    if (eb) eb.classList.add('su-hidden');
  }

  function saveEditModal() {
    if (!editTargetUser) return;
    var u = editTargetUser;
    var p1 = el('suEditPass').value;
    var p2 = el('suEditPass2').value;
    var errEl = el('suEditErr');
    errEl.classList.add('su-hidden');
    if (p1 || p2) {
      if (p1 !== p2) {
        errEl.textContent = 'Passwords do not match.';
        errEl.classList.remove('su-hidden');
        return;
      }
      if (p1.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.classList.remove('su-hidden');
        return;
      }
    }
    var body = {
      enabled: el('suEditEn').checked,
      superAdmin: el('suEditSuper').checked,
      assignments: assignmentsPayloadFromList(editAssignmentList)
    };
    var pwTrim = p1.trim();
    if (pwTrim) body.password = pwTrim;
    api('/api/super/users/' + u.id, { method: 'PUT', json: body }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          errEl.textContent = formatApiError(j, res.status);
          errEl.classList.remove('su-hidden');
        }).catch(function () {
          errEl.textContent = 'HTTP ' + res.status;
          errEl.classList.remove('su-hidden');
        });
      }
      closeEditModal();
      return refreshList();
    });
  }

  function generateSetupLink(userId) {
    api('/api/super/users/' + userId + '/password-setup-token', { method: 'POST' }).then(function (res) {
      if (!res.ok) {
        alert('Failed to create link: HTTP ' + res.status);
        return;
      }
      return res.json().then(function (data) {
        var fullUrl = buildPasswordSetupPageUrl(data.token);
        el('suLinkUrl').value = fullUrl;
        var exp = data.expiresAt ? new Date(data.expiresAt) : null;
        el('suLinkExpires').textContent = exp ? 'Expires: ' + exp.toLocaleString() : '';
        el('suLinkBackdrop').classList.remove('su-hidden');
        if (typeof QRious !== 'undefined') {
          new QRious({
            element: el('suQrCanvas'),
            value: fullUrl,
            size: 200,
            background: '#ffffff',
            foreground: '#000000'
          });
        }
      });
    });
  }

  function closeLinkModal() {
    var lb = el('suLinkBackdrop');
    if (lb) lb.classList.add('su-hidden');
  }

  function deleteUser(id, username) {
    if (!confirm('Delete user ' + username + '?')) return;
    api('/api/super/users/' + id, { method: 'DELETE' }).then(function (res) {
      if (!res.ok) {
        alert('Delete failed: HTTP ' + res.status);
        return;
      }
      refreshList();
    });
  }

  if (el('suLinkCopy')) {
    el('suLinkCopy').addEventListener('click', function () {
      var urlEl = el('suLinkUrl');
      if (!urlEl) return;
      var v = urlEl.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).catch(function () {
          urlEl.select();
          document.execCommand('copy');
        });
      } else {
        urlEl.select();
        document.execCommand('copy');
      }
    });
  }
  if (el('suLinkClose')) el('suLinkClose').addEventListener('click', closeLinkModal);
  if (el('suEditCancel')) el('suEditCancel').addEventListener('click', closeEditModal);
  if (el('suEditSave')) el('suEditSave').addEventListener('click', saveEditModal);
  if (el('suEditBackdrop')) {
    el('suEditBackdrop').addEventListener('click', function (e) {
      if (e.target === el('suEditBackdrop')) closeEditModal();
    });
  }
  if (el('suLinkBackdrop')) {
    el('suLinkBackdrop').addEventListener('click', function (e) {
      if (e.target === el('suLinkBackdrop')) closeLinkModal();
    });
  }

  el('suLoginBtn').addEventListener('click', function () {
    var username = el('suUser').value.trim();
    var password = el('suPass').value;
    var err = el('suLoginErr');
    err.classList.add('su-hidden');
    if (!username || !password) {
      err.textContent = 'Enter username and password.';
      err.classList.remove('su-hidden');
      return;
    }
    var base = getMenuApiBase();
    if (!base) {
      err.textContent = 'Set menu-api-base meta.';
      err.classList.remove('su-hidden');
      return;
    }
    fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
      credentials: 'include'
    })
      .then(function (res) {
        if (!res.ok) {
          err.textContent = 'Invalid credentials.';
          err.classList.remove('su-hidden');
          return null;
        }
        return res.json();
      })
      .then(function (body) {
        if (!body) return;
        setToken(body.accessToken);
        if (!body.superAdmin) {
          clearToken();
          err.textContent = 'Not a super administrator.';
          err.classList.remove('su-hidden');
          return;
        }
        el('suPass').value = '';
        showMainIfSuper();
      })
      .catch(function (e) {
        err.textContent = e.message || 'Network error';
        err.classList.remove('su-hidden');
      });
  });

  el('suLogoutBtn').addEventListener('click', function () {
    var base = getMenuApiBase();
    function done() {
      clearToken();
      el('suMain').classList.add('su-hidden');
      el('suLogin').classList.remove('su-hidden');
    }
    if (base) {
      fetch(base + '/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(done);
    } else {
      done();
    }
  });

  if (el('suRefreshBtn')) {
    el('suRefreshBtn').addEventListener('click', function () {
      loadVenueCatalog()
        .then(function () {
          return refreshList();
        })
        .then(function () {
          if (el('suNewVenueChosen')) renderVenueAssignmentUI('suNew');
          var eb = el('suEditBackdrop');
          if (editTargetUser && eb && !eb.classList.contains('su-hidden')) {
            renderVenueAssignmentUI('suEdit');
          }
        });
    });
  }

  el('suCreateBtn').addEventListener('click', function () {
    var err = el('suCreateErr');
    err.classList.add('su-hidden');
    var username = el('suNewUser').value.trim();
    var passwordRaw = el('suNewPass').value;
    var enabled = el('suNewEn').checked;
    var superAdmin = el('suNewSuper').checked;
    var assignments = assignmentsPayloadFromList(newUserAssignmentList);
    if (!username) {
      err.textContent = 'Username required.';
      err.classList.remove('su-hidden');
      return;
    }
    if (passwordRaw.length > 0 && passwordRaw.length < 8) {
      err.textContent = 'Password must be at least 8 characters or leave empty for invite-only.';
      err.classList.remove('su-hidden');
      return;
    }
    var json = { username: username, enabled: enabled, superAdmin: superAdmin, assignments: assignments };
    if (passwordRaw.length >= 8) json.password = passwordRaw;
    api('/api/super/users', { method: 'POST', json: json }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          err.textContent = formatApiError(j, res.status);
          err.classList.remove('su-hidden');
        }).catch(function () {
          err.textContent = 'HTTP ' + res.status;
          err.classList.remove('su-hidden');
        });
      }
      el('suNewUser').value = '';
      el('suNewPass').value = '';
      newUserAssignmentList = [];
      if (el('suNewVenueSearch')) el('suNewVenueSearch').value = '';
      renderVenueAssignmentUI('suNew');
      refreshList();
    });
  });

  if (el('suEditVenueSearch')) {
    el('suEditVenueSearch').addEventListener('input', function () {
      renderVenueAssignmentUI('suEdit');
    });
  }
  if (el('suNewVenueSearch')) {
    el('suNewVenueSearch').addEventListener('input', function () {
      renderVenueAssignmentUI('suNew');
    });
  }

  showMainIfSuper();
})();
