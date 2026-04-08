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

  function parseAssignments(text) {
    var out = [];
    if (!text || !text.trim()) return out;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      var idx = line.indexOf(':');
      if (idx < 1) continue;
      var rid = line.slice(0, idx).trim();
      var role = line.slice(idx + 1).trim().toUpperCase();
      if (!rid || (role !== 'ADMIN' && role !== 'EDITOR')) continue;
      out.push({ restaurantId: rid, role: role });
    }
    return out;
  }

  function formatAssignments(assignments) {
    if (!assignments || !assignments.length) return '';
    return assignments.map(function (a) { return a.restaurantId + ':' + a.role; }).join('\n');
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
      return refreshList().then(function () {
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

  function refreshList() {
    return api('/api/super/users').then(function (res) {
      if (!res.ok) {
        alert('Failed to load users: HTTP ' + res.status);
        return;
      }
      return res.json().then(function (users) {
        var tbody = el('suTbody');
        tbody.innerHTML = '';
        /* forEach + .bind: a `for` loop with `var u` made every row's Setup link / Delete target the last user. */
        users.forEach(function (u) {
          var tr = document.createElement('tr');
          var venues = (u.assignments || [])
            .map(function (a) {
              return a.restaurantId + ':' + a.role;
            })
            .join(', ') || '—';
          tr.innerHTML =
            '<td>' +
            u.id +
            '</td><td>' +
            escapeHtml(u.username) +
            '</td><td>' +
            (u.enabled ? 'yes' : 'no') +
            '</td><td>' +
            (u.superAdmin ? 'yes' : 'no') +
            '</td><td style="max-width:220px;word-break:break-all">' +
            escapeHtml(venues) +
            '</td><td class="su-actions"></td>';
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
    el('suEditAssign').value = formatAssignments(u.assignments);
    el('suEditPass').value = '';
    el('suEditPass2').value = '';
    el('suEditErr').classList.add('su-hidden');
    el('suEditBackdrop').classList.remove('su-hidden');
  }

  function closeEditModal() {
    editTargetUser = null;
    el('suEditBackdrop').classList.add('su-hidden');
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
      assignments: parseAssignments(el('suEditAssign').value)
    };
    var pwTrim = p1.trim();
    if (pwTrim) body.password = pwTrim;
    api('/api/super/users/' + u.id, { method: 'PUT', json: body }).then(function (res) {
      if (!res.ok) {
        var msg = 'HTTP ' + res.status;
        return res.json().then(function (j) {
          if (j.message) msg = j.message;
          errEl.textContent = msg;
          errEl.classList.remove('su-hidden');
        }).catch(function () {
          errEl.textContent = msg;
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
    el('suLinkBackdrop').classList.add('su-hidden');
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

  el('suLinkCopy').addEventListener('click', function () {
    var v = el('suLinkUrl').value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).catch(function () {
        el('suLinkUrl').select();
        document.execCommand('copy');
      });
    } else {
      el('suLinkUrl').select();
      document.execCommand('copy');
    }
  });

  el('suLinkClose').addEventListener('click', closeLinkModal);
  el('suEditCancel').addEventListener('click', closeEditModal);
  el('suEditSave').addEventListener('click', saveEditModal);
  el('suEditBackdrop').addEventListener('click', function (e) {
    if (e.target === el('suEditBackdrop')) closeEditModal();
  });
  el('suLinkBackdrop').addEventListener('click', function (e) {
    if (e.target === el('suLinkBackdrop')) closeLinkModal();
  });

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

  el('suRefreshBtn').addEventListener('click', function () {
    refreshList();
  });

  el('suCreateBtn').addEventListener('click', function () {
    var err = el('suCreateErr');
    err.classList.add('su-hidden');
    var username = el('suNewUser').value.trim();
    var passwordRaw = el('suNewPass').value;
    var enabled = el('suNewEn').checked;
    var superAdmin = el('suNewSuper').checked;
    var assignments = parseAssignments(el('suNewAssign').value);
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
        var msg = 'HTTP ' + res.status;
        return res.json().then(function (j) {
          if (j.message) msg = j.message;
          err.textContent = msg;
          err.classList.remove('su-hidden');
        }).catch(function () {
          err.textContent = msg;
          err.classList.remove('su-hidden');
        });
      }
      el('suNewUser').value = '';
      el('suNewPass').value = '';
      el('suNewAssign').value = '';
      refreshList();
    });
  });

  showMainIfSuper();
})();
