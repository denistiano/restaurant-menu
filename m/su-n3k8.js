(function () {
  'use strict';

  var TOKEN_KEY = 'menu_admin_jwt';
  var SUPER_MIRROR_KEY = 'menu_admin_jwt_super_mirror';
  var DEFAULT_LOCAL = 'http://127.0.0.1:8080';
  var ME_TIMEOUT_MS = 28000;

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
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(SUPER_MIRROR_KEY) || '';
    } catch (e) {
      return '';
    }
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

  function hideSuGate() {
    var gate = el('suGate');
    if (gate) gate.classList.add('su-hidden');
  }

  (function initSessionGate() {
    var gate = el('suGate');
    var login = el('suLogin');
    var token = '';
    try {
      token = getToken();
    } catch (e) {}
    if (!token) {
      hideSuGate();
      return;
    }
    /* Pages without #suGate: login stays visible until verify (legacy); new-user.html includes #suGate. */
    if (!gate) return;
    gate.classList.remove('su-hidden');
    if (login) login.classList.add('su-hidden');
  })();

  function verifySuper() {
    var base = getMenuApiBase();
    if (!base) {
      return Promise.resolve({ ok: false, clearSession: false, noBase: true });
    }
    var token = getToken();
    if (!token) {
      return Promise.resolve({ ok: false, clearSession: false });
    }
    var ctrl = new AbortController();
    var tid = setTimeout(function () {
      ctrl.abort();
    }, ME_TIMEOUT_MS);
    return fetch(base + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
      signal: ctrl.signal
    })
      .then(function (res) {
        clearTimeout(tid);
        if (res.status === 401 || res.status === 403) {
          return { ok: false, clearSession: true };
        }
        if (!res.ok) {
          return { ok: false, clearSession: false };
        }
        return res.json().then(function (me) {
          return { ok: !!me.superAdmin, clearSession: !me.superAdmin };
        });
      })
      .catch(function (e) {
        clearTimeout(tid);
        if (e && e.name === 'AbortError') {
          return { ok: false, clearSession: false, timedOut: true };
        }
        return { ok: false, clearSession: false };
      });
  }

  function showMainIfSuper() {
    var retryBtn = el('suRetryVerifyBtn');
    if (retryBtn) retryBtn.classList.add('su-hidden');
    if (!getToken()) {
      hideSuGate();
      el('suMain').classList.add('su-hidden');
      el('suLogin').classList.remove('su-hidden');
      return Promise.resolve(false);
    }
    var gate = el('suGate');
    if (gate) {
      gate.classList.remove('su-hidden');
      var gm = el('suGateMsg');
      if (gm) gm.textContent = 'Checking access…';
      el('suLogin').classList.add('su-hidden');
    }
    return verifySuper().then(function (r) {
      hideSuGate();
      var errEl = el('suLoginErr');
      if (errEl) errEl.classList.add('su-hidden');
      if (!r.ok) {
        if (r.clearSession) clearToken();
        el('suLogin').classList.remove('su-hidden');
        el('suMain').classList.add('su-hidden');
        if (errEl) {
          if (r.noBase) {
            errEl.textContent = 'This page is missing the menu service address. Ask your administrator.';
            errEl.classList.remove('su-hidden');
          } else if (r.timedOut) {
            errEl.textContent =
              'Checking your session timed out. Check your connection, use Try again, or open Menu admin and return here.';
            errEl.classList.remove('su-hidden');
            if (retryBtn) retryBtn.classList.remove('su-hidden');
          } else if (!r.clearSession) {
            errEl.textContent =
              'Could not verify your session (network or server error). Check your connection and try again.';
            errEl.classList.remove('su-hidden');
            if (retryBtn) retryBtn.classList.remove('su-hidden');
          }
        }
        return false;
      }
      el('suLogin').classList.add('su-hidden');
      el('suMain').classList.remove('su-hidden');
      return loadVenueCatalog()
        .then(function () {
          return refreshList();
        })
        .then(function () {
          if (el('suNewVenueChosen')) renderVenueAssignmentUI('suNew');
          /* Do not move focus into add-user fields on tab load or after verify (avoids mobile keyboard). */
          try {
            var ae = document.activeElement;
            if (ae && (ae === el('suUser') || ae === el('suPass') || ae === el('suNewUser') || ae === el('suNewPass') || ae === el('suNewVenueSearch'))) {
              ae.blur();
            }
          } catch (_) {}
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

  var SVG_CHECK =
    '<svg class="su-bool-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var SVG_X =
    '<svg class="su-bool-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function boolCell(ok, yesLabel, noLabel) {
    return (
      '<span class="su-cell-icon ' +
      (ok ? 'su-cell-icon--ok' : 'su-cell-icon--no') +
      '" role="img" aria-label="' +
      escapeHtml(ok ? yesLabel : noLabel) +
      '">' +
      (ok ? SVG_CHECK : SVG_X) +
      '</span>'
    );
  }

  function iconButton(className, title, ariaLabel, svgInner) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.title = title;
    b.setAttribute('aria-label', ariaLabel);
    b.innerHTML =
      '<svg class="su-icon-btn__svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      svgInner +
      '</svg>';
    return b;
  }

  var VENUE_PIN_SVG =
    '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="currentColor" stroke="none"/></g>';

  function closeAllVenueDetails(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('.su-venue-detail-row:not(.su-hidden)').forEach(function (r) {
      r.classList.add('su-hidden');
    });
    tbody.querySelectorAll('.su-venues-toggle[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function buildVenueDetailList(assignments) {
    var ul = document.createElement('ul');
    ul.className = 'su-venue-detail-list';
    for (var i = 0; i < assignments.length; i++) {
      var a = assignments[i];
      var li = document.createElement('li');
      var v = findVenue(a.restaurantId);
      var name = document.createElement('span');
      name.className = 'su-venue-detail-name';
      name.textContent = venueLabel(v, a.restaurantId);
      var role = document.createElement('span');
      role.className = 'su-venue-detail-role';
      role.textContent = String(a.role || 'ADMIN').toUpperCase();
      li.appendChild(name);
      li.appendChild(role);
      ul.appendChild(li);
    }
    return ul;
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
        users.forEach(function (u) {
          var tr = document.createElement('tr');
          tr.className = 'su-user-row';
          var passwordSet = u.passwordSet !== false;
          tr.innerHTML =
            '<td>' +
            u.id +
            '</td><td>' +
            escapeHtml(u.username) +
            '</td><td class="su-td-icon">' +
            boolCell(!!u.enabled, 'Account active', 'Account disabled') +
            '</td><td class="su-td-icon">' +
            boolCell(!!u.superAdmin, 'Full administrator', 'Not full administrator') +
            '</td><td class="su-td-icon">' +
            boolCell(passwordSet, 'Password set', 'Password not set yet') +
            '</td><td></td><td class="su-actions su-actions--icons"></td>';
          var vCell = tr.cells[5];
          vCell.className = 'su-table-venues';
          vCell.textContent = '';
          var asg = u.assignments || [];
          if (!asg.length) {
            vCell.classList.add('su-table-venues--empty');
            vCell.textContent = '—';
          } else {
            var n = asg.length;
            var vBtn = document.createElement('button');
            vBtn.type = 'button';
            vBtn.className = 'su-venues-toggle';
            vBtn.setAttribute('aria-expanded', 'false');
            vBtn.setAttribute('aria-label', n + ' venue' + (n === 1 ? '' : 's') + ' — show details');
            vBtn.innerHTML =
              '<svg class="su-venues-toggle__ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              VENUE_PIN_SVG +
              '</svg><span class="su-venues-toggle__n">' +
              n +
              '</span>';
            vCell.appendChild(vBtn);
          }
          var cell = tr.querySelector('.su-actions');
          var editBtn = iconButton(
            'su-icon-btn',
            'Edit',
            'Edit user',
            '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'
          );
          editBtn.addEventListener('click', openEditModal.bind(null, u));
          var linkBtn = iconButton(
            'su-icon-btn',
            'Password setup link',
            'Create password setup link',
            '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
          );
          linkBtn.addEventListener('click', generateSetupLink.bind(null, u.id));
          var delBtn = iconButton(
            'su-icon-btn su-icon-btn--danger',
            'Delete',
            'Delete user',
            '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'
          );
          delBtn.addEventListener('click', deleteUser.bind(null, u.id, u.username));
          cell.appendChild(editBtn);
          cell.appendChild(linkBtn);
          cell.appendChild(delBtn);
          tbody.appendChild(tr);
          if (asg.length) {
            var dTr = document.createElement('tr');
            dTr.className = 'su-venue-detail-row su-hidden';
            var dTd = document.createElement('td');
            dTd.className = 'su-venue-detail-cell';
            dTd.colSpan = 7;
            dTd.appendChild(buildVenueDetailList(asg));
            dTr.appendChild(dTd);
            tbody.appendChild(dTr);
            (function (btn, row) {
              btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var wasHidden = row.classList.contains('su-hidden');
                closeAllVenueDetails(tbody);
                if (wasHidden) {
                  row.classList.remove('su-hidden');
                  btn.setAttribute('aria-expanded', 'true');
                } else {
                  row.classList.add('su-hidden');
                  btn.setAttribute('aria-expanded', 'false');
                }
              });
            })(vCell.querySelector('.su-venues-toggle'), dTr);
          }
        });
      });
    });
  }

  function openEditModal(u) {
    editTargetUser = u;
    el('suEditUsername').textContent = 'Sign-in name: ' + u.username;
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

  if (el('suLoginBtn')) {
    el('suLoginBtn').addEventListener('click', function () {
      var username = el('suUser') ? el('suUser').value.trim() : '';
      var password = el('suPass') ? el('suPass').value : '';
      var err = el('suLoginErr');
      if (!err) return;
      err.classList.add('su-hidden');
      if (!username || !password) {
        err.textContent = 'Enter username and password.';
        err.classList.remove('su-hidden');
        return;
      }
      var base = getMenuApiBase();
      if (!base) {
        err.textContent = 'This page is missing the menu service address. Ask your administrator.';
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
          if (el('suPass')) el('suPass').value = '';
          showMainIfSuper();
        })
        .catch(function (e) {
          err.textContent = e.message || 'Network error';
          err.classList.remove('su-hidden');
        });
    });
  }

  if (el('suLogoutBtn')) {
    el('suLogoutBtn').addEventListener('click', function () {
      var base = getMenuApiBase();
      function done() {
        clearToken();
        if (el('suMain')) el('suMain').classList.add('su-hidden');
        if (el('suLogin')) el('suLogin').classList.remove('su-hidden');
      }
      if (base) {
        fetch(base + '/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(done);
      } else {
        done();
      }
    });
  }

  if (el('suCreateBtn')) {
    el('suCreateBtn').addEventListener('click', function () {
      var err = el('suCreateErr');
      if (!err) return;
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
  }

  if (el('suRetryVerifyBtn')) {
    el('suRetryVerifyBtn').addEventListener('click', function () {
      var err = el('suLoginErr');
      if (err) err.classList.add('su-hidden');
      el('suRetryVerifyBtn').classList.add('su-hidden');
      showMainIfSuper();
    });
  }

  if (el('suEditVenueSearch')) {
    el('suEditVenueSearch').addEventListener('input', function () {
      renderVenueAssignmentUI('suEdit');
    });
  }
  if (el('suNewVenueSearch')) {
    el('suNewVenueSearch').addEventListener('input', function () {
      renderVenueAssignmentUI('suNew');
    });
    window.addEventListener('pageshow', function () {
      setTimeout(function () {
        try {
          var m = el('suMain');
          if (!m || m.classList.contains('su-hidden')) return;
          var ae = document.activeElement;
          if (ae && ae.tagName === 'INPUT' && m.contains(ae)) ae.blur();
        } catch (_) {}
      }, 0);
    });
  }

  showMainIfSuper();
})();
