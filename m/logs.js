/**
 * Telemetry logs — GET /api/v1/logs with Bearer JWT (super admin).
 * Token: sessionStorage menu_admin_jwt or localStorage menu_admin_jwt_super_mirror.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'menu_admin_jwt';
  var SUPER_MIRROR_KEY = 'menu_admin_jwt_super_mirror';
  var DEFAULT_LOCAL_API = 'http://127.0.0.1:8080';

  function getMenuApiBase() {
    var w = typeof window !== 'undefined' && window.__MENU_API_BASE__;
    if (w && typeof w === 'string' && w.trim()) return w.trim().replace(/\/?$/, '');
    var meta = document.querySelector('meta[name="menu-api-base"]');
    if (meta) {
      var c = meta.getAttribute('content');
      if (c && c.trim()) return c.trim().replace(/\/?$/, '');
    }
    var h = typeof location !== 'undefined' ? location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return DEFAULT_LOCAL_API;
    return '';
  }

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(SUPER_MIRROR_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function parsePage(json) {
    var content = Array.isArray(json.content) ? json.content : [];
    var pm = json.page || json.metadata || {};
    return {
      content: content,
      number: typeof pm.number === 'number' ? pm.number : 0,
      size: typeof pm.size === 'number' ? pm.size : 50,
      totalElements: typeof pm.totalElements === 'number' ? pm.totalElements : 0,
      totalPages: typeof pm.totalPages === 'number' ? pm.totalPages : 0
    };
  }

  function buildQueryParams(pageIndex, overrides) {
    var p = new URLSearchParams();
    p.set('page', String(pageIndex));
    p.set('size', String(overrides.size || 50));
    p.set('sort', 'occurredAt,desc');
    ['app', 'sessionId', 'userId', 'eventType', 'eventName', 'from', 'to', 'payloadContains'].forEach(function (key) {
      var v = overrides[key];
      if (v != null && String(v).trim() !== '') p.set(key, String(v).trim());
    });
    var paths = overrides.payloadJsonPaths || [];
    var vals = overrides.payloadJsonValues || [];
    var n = Math.max(paths.length, vals.length);
    for (var i = 0; i < n; i++) {
      var path = paths[i] && String(paths[i]).trim();
      var val = vals[i] != null ? String(vals[i]) : '';
      if (path || val) {
        if (path) p.append('payloadJsonPath', path);
        p.append('payloadJsonValue', val);
      }
    }
    return p;
  }

  function el(id) {
    return document.getElementById(id);
  }

  var state = { page: 0, filters: { size: 50 } };

  function showGate(msg) {
    el('logsGate').classList.remove('hidden');
    el('logsMain').classList.add('hidden');
    var ge = el('logsGateText');
    if (ge) ge.textContent = msg || '';
  }

  function showMain() {
    el('logsGate').classList.add('hidden');
    el('logsMain').classList.remove('hidden');
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + getToken() };
  }

  function verifySuperAdmin() {
    var base = getMenuApiBase();
    var token = getToken();
    if (!base) {
      showGate('Set meta menu-api-base to your API URL (e.g. https://tebeshir.online).');
      return Promise.resolve(false);
    }
    if (!token) {
      showGate('Sign in as a super administrator from the admin app first, then open this page again.');
      return Promise.resolve(false);
    }
    return fetch(base + '/api/auth/me', { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) {
          showGate('Session expired or invalid. Sign in again from Admin.');
          return false;
        }
        return res.json().then(function (me) {
          if (!me.superAdmin) {
            showGate('Telemetry is limited to super administrators.');
            return false;
          }
          return true;
        });
      })
      .catch(function (e) {
        showGate('Could not reach the API: ' + (e.message || 'network error'));
        return false;
      });
  }

  function readFiltersFromDom() {
    function val(id) {
      var n = el(id);
      return n ? n.value.trim() : '';
    }
    var paths = [];
    var vals = [];
    document.querySelectorAll('.logs-json-row').forEach(function (row) {
      var pi = row.querySelector('.logs-json-path');
      var vi = row.querySelector('.logs-json-val');
      paths.push(pi ? pi.value.trim() : '');
      vals.push(vi ? vi.value.trim() : '');
    });
    return {
      size: Math.min(500, Math.max(1, parseInt(val('filterSize'), 10) || 50)),
      app: val('filterApp'),
      sessionId: val('filterSession'),
      userId: val('filterUser'),
      eventType: val('filterEventType'),
      eventName: val('filterEventName'),
      from: val('filterFrom'),
      to: val('filterTo'),
      payloadContains: val('filterPayload'),
      payloadJsonPaths: paths,
      payloadJsonValues: vals
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderList(pageData) {
    var list = el('logsList');
    var empty = el('logsEmpty');
    if (!list) return;
    list.innerHTML = '';
    if (!pageData.content.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    pageData.content.forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'logs-card';
      var ts = row.timestamp || row.occurredAt || '';
      var app = row.app || row.appId || '';
      var sid = row.sessionId || '';
      var uid = row.userId || '';
      var payload = row.payloadJson != null ? row.payloadJson : row.payload || '{}';
      li.innerHTML =
        '<div class="logs-card__meta"><time>' +
        escapeHtml(String(ts)) +
        '</time><span class="logs-badge">' +
        escapeHtml(String(app)) +
        '</span><span class="logs-badge">' +
        escapeHtml(String(row.eventType || '')) +
        '</span></div><div class="logs-card__title">' +
        escapeHtml(String(row.eventName || '')) +
        '</div><div class="logs-card__chips">' +
        (sid ? '<span>session: ' + escapeHtml(sid) + '</span>' : '') +
        (uid ? '<span>user: ' + escapeHtml(uid) + '</span>' : '') +
        '<span>id: ' +
        escapeHtml(String(row.id != null ? row.id : '')) +
        '</span></div><details class="logs-payload"><summary>Payload</summary><pre>' +
        escapeHtml(String(payload)) +
        '</pre></details>';
      list.appendChild(li);
    });
  }

  function updateStats(pageData) {
    var st = el('logsStats');
    if (!st) return;
    st.innerHTML =
      '<div class="logs-stat"><span>Matches</span>' +
      pageData.totalElements +
      '</div><div class="logs-stat"><span>Page</span>' +
      (pageData.number + 1) +
      ' / ' +
      Math.max(1, pageData.totalPages) +
      '</div><div class="logs-stat"><span>Per page</span>' +
      pageData.size +
      '</div>';
  }

  function updatePager(pageData) {
    var prev = el('logsPrev');
    var next = el('logsNext');
    var meta = el('logsPagerMeta');
    if (prev) prev.disabled = pageData.number <= 0;
    if (next) next.disabled = pageData.number + 1 >= pageData.totalPages || pageData.totalPages === 0;
    if (meta) {
      meta.textContent =
        'Page ' + (pageData.number + 1) + ' of ' + Math.max(1, pageData.totalPages);
    }
  }

  function loadPage(pageIndex) {
    var base = getMenuApiBase();
    var errEl = el('logsError');
    var loading = el('logsLoading');
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
    if (loading) loading.classList.remove('hidden');
    state.filters = readFiltersFromDom();
    state.page = pageIndex;
    var qs = buildQueryParams(pageIndex, state.filters);
    return fetch(base + '/api/v1/logs?' + qs.toString(), { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 404) {
          throw new Error('Not authorized (404). Use a super-admin account; check API and CORS.');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var pageData = parsePage(json);
        renderList(pageData);
        updateStats(pageData);
        updatePager(pageData);
      })
      .catch(function (e) {
        if (errEl) {
          errEl.textContent = e.message || String(e);
          errEl.classList.remove('hidden');
        }
      })
      .finally(function () {
        if (loading) loading.classList.add('hidden');
      });
  }

  function filterQueryForExport() {
    return buildQueryParams(0, state.filters);
  }

  function downloadExport(kind) {
    var base = getMenuApiBase();
    var p = filterQueryForExport();
    p.delete('page');
    p.delete('size');
    p.delete('sort');
    var url = base + '/api/v1/export/' + kind + '?' + p.toString();
    return fetch(url, { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var dispo = ''; /* optional parse Content-Disposition */
        var name = kind === 'csv' ? 'logs-export.csv' : 'logs-export.json';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(function (e) {
        alert('Export failed: ' + (e.message || e));
      });
  }

  function showMetrics() {
    var base = getMenuApiBase();
    var out = el('logsMetricsOut');
    if (!out) return;
    out.textContent = 'Loading…';
    fetch(base + '/api/v1/metrics/by-app', { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        out.textContent = JSON.stringify(data, null, 2);
      })
      .catch(function (e) {
        out.textContent = 'Error: ' + (e.message || e);
      });
  }

  function addJsonRow() {
    var host = el('logsJsonRows');
    if (!host) return;
    var row = document.createElement('div');
    row.className = 'logs-field logs-json-row';
    row.innerHTML =
      '<label>JSON path</label><input type="text" class="logs-json-path" placeholder="$.field" />' +
      '<label style="margin-top:8px">Equals</label><input type="text" class="logs-json-val" placeholder="value" />';
    host.appendChild(row);
  }

  document.addEventListener('DOMContentLoaded', function () {
    verifySuperAdmin().then(function (ok) {
      if (!ok) return;
      showMain();

      el('logsFilterForm').addEventListener('submit', function (e) {
        e.preventDefault();
        loadPage(0);
      });
      el('logsPrev').addEventListener('click', function () {
        if (state.page > 0) loadPage(state.page - 1);
      });
      el('logsNext').addEventListener('click', function () {
        loadPage(state.page + 1);
      });
      el('logsExportJson').addEventListener('click', function () {
        downloadExport('json');
      });
      el('logsExportCsv').addEventListener('click', function () {
        downloadExport('csv');
      });
      el('logsMetricsBtn').addEventListener('click', function () {
        var panel = el('logsMetricsPanel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) showMetrics();
      });
      el('logsAddJsonRow').addEventListener('click', addJsonRow);

      loadPage(0);
    });
  });
})();
