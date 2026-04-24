/**
 * Activity log search (signed-in full administrators).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'menu_admin_jwt';
  var SUPER_MIRROR_KEY = 'menu_admin_jwt_super_mirror';
  var DEFAULT_LOCAL_API = 'http://127.0.0.1:8080';

  var KEY_ALIASES = {
    app: 'app',
    application: 'app',
    session: 'sessionId',
    sessionid: 'sessionId',
    sid: 'sessionId',
    user: 'userId',
    userid: 'userId',
    type: 'eventType',
    eventtype: 'eventType',
    name: 'eventName',
    eventname: 'eventName'
  };

  /** Search-bar keys → SQLite json_extract paths (see LogQueryService). */
  var JSON_PATH_BAR_ALIASES = {
    journey_id: '$.journey_id',
    jid: '$.journey_id',
    journey: '$.journey_id',
    anon_user_id: '$.anon_user_id',
    anon: '$.anon_user_id',
    visitor: '$.anon_user_id',
    restaurant_id: '$.restaurant_id',
    rid: '$.restaurant_id'
  };

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

  function el(id) {
    return document.getElementById(id);
  }

  var state = { page: 0, filters: { size: 50 }, lastMs: 0, highlightTerms: [] };

  function parseSearchBar(text) {
    var kv = {};
    var keywords = [];
    if (!text || !String(text).trim()) return { kv: kv, keywords: keywords };
    var tokens = text.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    tokens.forEach(function (tok) {
      var t = tok.replace(/^"|"$/g, '');
      var m = /^([\w.]+):("([^"]*)"|'([^']*)'|(\S+))$/.exec(t);
      if (m) {
        var key = m[1];
        var val = m[3] != null ? m[3] : m[4] != null ? m[4] : m[5] || '';
        kv[key] = val;
      } else {
        keywords.push(t);
      }
    });
    return { kv: kv, keywords: keywords };
  }

  var FILTER_FIELDS = ['app', 'sessionId', 'userId', 'eventType', 'eventName'];

  function mapBarToFilters(barKv, base) {
    Object.keys(barKv).forEach(function (k) {
      var lk = k.toLowerCase();
      var canon = KEY_ALIASES[lk] || k;
      if (FILTER_FIELDS.indexOf(canon) >= 0) base[canon] = barKv[k];
    });
  }

  function applyTimeRange(base) {
    var sel = el('splTimeRange');
    if (!sel) return;
    var v = sel.value;
    if (v === 'custom') return;
    if (v === 'all') {
      base.from = '';
      base.to = '';
      return;
    }
    var now = Date.now();
    var start;
    if (v === '15m') start = now - 15 * 60 * 1000;
    else if (v === '60m') start = now - 60 * 60 * 1000;
    else if (v === '24h') start = now - 24 * 60 * 60 * 1000;
    else if (v === '7d') start = now - 7 * 24 * 60 * 60 * 1000;
    else return;
    base.from = new Date(start).toISOString();
    base.to = new Date(now).toISOString();
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

    var bar = parseSearchBar(el('splMainSearch') ? el('splMainSearch').value : '');
    Object.keys(bar.kv).forEach(function (k) {
      var lk = k.toLowerCase();
      var jpath = JSON_PATH_BAR_ALIASES[lk];
      if (!jpath) return;
      var rawVal = bar.kv[k];
      var v = rawVal != null ? String(rawVal).trim() : '';
      if (v) {
        paths.push(jpath);
        vals.push(v);
      }
    });

    var base = {
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

    mapBarToFilters(bar.kv, base);
    var kw = bar.keywords.join(' ').trim();
    if (kw && base.payloadContains) base.payloadContains = kw + ' ' + base.payloadContains;
    else if (kw) base.payloadContains = kw;

    applyTimeRange(base);
    return base;
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
      showGate('This page needs the menu service address configured. Ask your administrator.');
      return Promise.resolve(false);
    }
    if (!token) {
      showGate('Sign in from the menu admin first (full administrator), then open this page again.');
      return Promise.resolve(false);
    }
    return fetch(base + '/api/auth/me', { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) {
          showGate('Session expired or invalid. Sign in again from the menu admin.');
          return false;
        }
        return res.json().then(function (me) {
          if (!me.superAdmin) {
            showGate('Only full administrators can open the activity log.');
            return false;
          }
          return true;
        });
      })
      .catch(function (e) {
        showGate('Could not reach the menu service: ' + (e.message || 'network error'));
        return false;
      });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightTerms(text, terms) {
    var out = escapeHtml(text);
    if (!terms || !terms.length) return out;
    terms.forEach(function (t) {
      if (!t || t.length < 2) return;
      var esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var rx = new RegExp('(' + esc + ')', 'gi');
      out = out.replace(rx, '<mark class="spl-highlight">$1</mark>');
    });
    return out;
  }

  function buildHighlightTerms() {
    var f = state.filters || readFiltersFromDom();
    var terms = [];
    if (f.payloadContains) {
      f.payloadContains.split(/\s+/).forEach(function (w) {
        if (w.length >= 2) terms.push(w);
      });
    }
    return terms.slice(0, 8);
  }

  function rawEventLine(row) {
    var app = row.app || row.appId || '';
    var parts = [
      row.eventType || '',
      row.eventName || '',
      row.sessionId ? 'session=' + row.sessionId : '',
      row.userId ? 'user=' + row.userId : ''
    ].filter(Boolean);
    var head = parts.join(' | ');
    var payload = row.payloadJson != null ? row.payloadJson : row.payload || '{}';
    var oneLine = payload.replace(/\s+/g, ' ').trim();
    if (oneLine.length > 220) oneLine = oneLine.slice(0, 217) + '…';
    return head ? head + ' — ' + oneLine : oneLine;
  }

  function parseTs(iso) {
    if (!iso) return NaN;
    var t = Date.parse(String(iso));
    return isNaN(t) ? NaN : t;
  }

  function renderTimeline(content) {
    var wrap = el('splTimelineBars');
    var axis = el('splTimelineAxis');
    if (!wrap || !axis) return;
    wrap.innerHTML = '';
    if (!content.length) {
      el('splTimeline').setAttribute('aria-hidden', 'true');
      return;
    }
    el('splTimeline').setAttribute('aria-hidden', 'false');
    var ts = content.map(function (r) {
      return parseTs(r.timestamp || r.occurredAt);
    }).filter(function (x) {
      return !isNaN(x);
    });
    if (!ts.length) return;
    var min = Math.min.apply(null, ts);
    var max = Math.max.apply(null, ts);
    if (max <= min) max = min + 1;
    var n = Math.min(32, Math.max(12, content.length));
    var buckets = new Array(n).fill(0);
    ts.forEach(function (t) {
      var i = Math.floor(((t - min) / (max - min)) * (n - 0.001));
      if (i < 0) i = 0;
      if (i >= n) i = n - 1;
      buckets[i]++;
    });
    var mx = Math.max.apply(null, buckets);
    buckets.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'spl-timeline__bar';
      d.style.height = mx ? Math.max(4, Math.round((c / mx) * 100)) + '%' : '4px';
      d.title = c + ' events';
      wrap.appendChild(d);
    });
    axis.textContent =
      new Date(min).toLocaleString() + ' — ' + new Date(max).toLocaleString() + ' (this page)';
  }

  function countDistribution(content, getv) {
    var m = {};
    content.forEach(function (row) {
      var v = getv(row);
      if (v == null || v === '') return;
      m[v] = (m[v] || 0) + 1;
    });
    return m;
  }

  function parsePayloadObject(row) {
    var raw = row.payloadJson != null ? row.payloadJson : row.payload || '{}';
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) {}
    return null;
  }

  function countPayloadField(content, key) {
    var m = {};
    content.forEach(function (row) {
      var o = parsePayloadObject(row);
      if (!o) return;
      var v = o[key];
      if (v == null || v === '') return;
      var s = String(v);
      m[s] = (m[s] || 0) + 1;
    });
    return m;
  }

  function shortLabel(s, maxLen) {
    var t = String(s);
    if (t.length <= maxLen) return t;
    return t.slice(0, 8) + '…' + t.slice(-6);
  }

  function renderFieldsSidebar(content) {
    var sel = el('splFieldsSelected');
    var intr = el('splFieldsInteresting');
    if (!sel || !intr) return;
    sel.innerHTML = '';
    intr.innerHTML = '';

    var fields = [
      { name: '_time', label: '_time', count: content.length },
      { name: 'app', label: 'app', count: content.filter(function (r) { return r.app || r.appId; }).length },
      {
        name: 'eventType',
        label: 'eventType',
        count: content.filter(function (r) { return r.eventType; }).length
      },
      {
        name: 'eventName',
        label: 'eventName',
        count: content.filter(function (r) { return r.eventName; }).length
      },
      {
        name: 'sessionId',
        label: 'session',
        count: content.filter(function (r) { return r.sessionId; }).length
      },
      {
        name: 'userId',
        label: 'user',
        count: content.filter(function (r) { return r.userId; }).length
      }
    ];
    fields.forEach(function (f) {
      var li = document.createElement('li');
      li.className = 'spl-fields__item';
      li.innerHTML =
        '<span class="spl-fields__fname">' +
        escapeHtml(f.label) +
        '</span> <span class="spl-fields__count">(' +
        f.count +
        ')</span>';
      sel.appendChild(li);
    });

    ['app', 'eventType', 'eventName', 'sessionId'].forEach(function (field) {
      var getv =
        field === 'app'
          ? function (r) {
              return r.app || r.appId;
            }
          : function (r) {
              return r[field];
            };
      var dist = countDistribution(content, getv);
      var entries = Object.entries(dist).sort(function (a, b) {
        return b[1] - a[1];
      });
      if (!entries.length) return;
      var li = document.createElement('li');
      li.className = 'spl-fields__item';
      var h = document.createElement('div');
      h.className = 'spl-fields__fname';
      h.textContent = field;
      li.appendChild(h);
      entries.slice(0, 8).forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'spl-fields__val';
        b.textContent = shortLabel(pair[0], 44) + ' (' + pair[1] + ')';
        b.title = pair[0];
        b.addEventListener('click', function () {
          if (field === 'app') el('filterApp').value = pair[0];
          else if (field === 'eventType') el('filterEventType').value = pair[0];
          else if (field === 'eventName') el('filterEventName').value = pair[0];
          else if (field === 'sessionId') el('filterSession').value = pair[0];
          loadPage(0);
        });
        li.appendChild(b);
      });
      intr.appendChild(li);
    });

    [['journey_id', '$.journey_id'], ['anon_user_id', '$.anon_user_id']].forEach(function (spec) {
      var key = spec[0];
      var jpath = spec[1];
      var dist = countPayloadField(content, key);
      var entries = Object.entries(dist).sort(function (a, b) {
        return b[1] - a[1];
      });
      if (!entries.length) return;
      var li = document.createElement('li');
      li.className = 'spl-fields__item';
      var h = document.createElement('div');
      h.className = 'spl-fields__fname';
      h.textContent = key + ' (payload)';
      li.appendChild(h);
      entries.slice(0, 6).forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'spl-fields__val';
        b.textContent = shortLabel(pair[0], 40) + ' (' + pair[1] + ')';
        b.title = pair[0];
        b.addEventListener('click', function () {
          setPayloadJsonFilters([{ path: jpath, val: pair[0] }]);
          loadPage(0);
        });
        li.appendChild(b);
      });
      intr.appendChild(li);
    });

    var keyFreq = {};
    content.forEach(function (row) {
      var o = parsePayloadObject(row);
      if (o) {
        Object.keys(o).forEach(function (k) {
          keyFreq[k] = (keyFreq[k] || 0) + 1;
        });
      }
    });
    var topKeys = Object.entries(keyFreq)
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 10);
    if (topKeys.length) {
      var li2 = document.createElement('li');
      li2.className = 'spl-fields__item';
      var h2 = document.createElement('div');
      h2.className = 'spl-fields__fname';
      h2.textContent = 'payload keys';
      li2.appendChild(h2);
      topKeys.forEach(function (pair) {
        var s = document.createElement('span');
        s.className = 'spl-fields__val';
        s.style.cursor = 'default';
        s.textContent = pair[0] + ' (' + pair[1] + ')';
        li2.appendChild(s);
      });
      intr.appendChild(li2);
    }
  }

  function renderStatsTable(content) {
    var body = el('splStatsBody');
    if (!body) return;
    body.innerHTML = '';
    var rows = [
      {
        name: '_time',
        nonNull: content.length,
        distinct: new Set(content.map(function (r) { return String(r.timestamp || r.occurredAt || ''); })).size
      },
      {
        name: 'app',
        nonNull: content.filter(function (r) { return r.app || r.appId; }).length,
        distinct: new Set(
          content.map(function (r) {
            return r.app || r.appId || '';
          }).filter(Boolean)
        ).size
      },
      {
        name: 'eventType',
        nonNull: content.filter(function (r) { return r.eventType; }).length,
        distinct: new Set(content.map(function (r) { return r.eventType || ''; }).filter(Boolean)).size
      },
      {
        name: 'eventName',
        nonNull: content.filter(function (r) { return r.eventName; }).length,
        distinct: new Set(content.map(function (r) { return r.eventName || ''; }).filter(Boolean)).size
      }
    ];
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(r.name) +
        '</td><td>' +
        r.nonNull +
        '</td><td>' +
        r.distinct +
        '</td>';
      body.appendChild(tr);
    });
  }

  function renderList(pageData) {
    var tbody = el('logsList');
    var empty = el('logsEmpty');
    var table = el('splEventsTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.highlightTerms = buildHighlightTerms();

    if (!pageData.content.length) {
      empty.classList.remove('hidden');
      if (table) table.hidden = true;
      renderTimeline([]);
      renderFieldsSidebar([]);
      return;
    }
    empty.classList.add('hidden');
    if (table) table.hidden = false;

    pageData.content.forEach(function (row, idx) {
      var ts = row.timestamp || row.occurredAt || '';
      var rawLine = rawEventLine(row);
      var tr = document.createElement('tr');
      tr.className = 'spl-event-row';
      var id = 'spl-exp-' + idx;
      tr.innerHTML =
        '<td><button type="button" class="spl-expand" aria-expanded="false" aria-controls="' +
        id +
        '">▶</button></td>' +
        '<td class="spl-time-cell">' +
        escapeHtml(String(ts)) +
        '</td>' +
        '<td class="spl-raw-cell">' +
        highlightTerms(rawLine, state.highlightTerms) +
        '</td>';
      var btn = tr.querySelector('.spl-expand');
      var detail = document.createElement('tr');
      detail.className = 'spl-event-detail hidden';
      detail.id = id;
      var payload = row.payloadJson != null ? row.payloadJson : row.payload || '{}';
      detail.innerHTML =
        '<td colspan="3"><div class="spl-detail-grid">' +
        '<div class="spl-detail-kv"><span>id</span> ' +
        escapeHtml(String(row.id)) +
        '</div>' +
        '<div class="spl-detail-kv"><span>app</span> ' +
        escapeHtml(String(row.app || row.appId || '')) +
        '</div>' +
        '<div class="spl-detail-kv"><span>eventType</span> ' +
        escapeHtml(String(row.eventType || '')) +
        '</div>' +
        '<div class="spl-detail-kv"><span>eventName</span> ' +
        escapeHtml(String(row.eventName || '')) +
        '</div>' +
        '</div><pre class="spl-detail-pre">' +
        highlightTerms(payload, state.highlightTerms) +
        '</pre></td>';
      var tdCell = detail.querySelector('td');
      if (tdCell) {
        var ar = document.createElement('div');
        ar.className = 'spl-detail-actions';
        ar.setAttribute('role', 'group');
        ar.setAttribute('aria-label', 'Narrow search');
        if (row.eventName) {
          var b1 = document.createElement('button');
          b1.type = 'button';
          b1.className = 'spl-btn spl-btn--small spl-btn--ghost';
          b1.textContent = 'Same event name';
          b1.addEventListener('click', function () {
            el('filterEventName').value = String(row.eventName || '');
            loadPage(0);
          });
          ar.appendChild(b1);
        }
        if (row.sessionId) {
          var b2 = document.createElement('button');
          b2.type = 'button';
          b2.className = 'spl-btn spl-btn--small spl-btn--ghost';
          b2.textContent = 'Same session';
          b2.addEventListener('click', function () {
            el('filterSession').value = String(row.sessionId || '');
            loadPage(0);
          });
          ar.appendChild(b2);
        }
        var pay = parsePayloadObject(row);
        if (pay && pay.journey_id) {
          var b3 = document.createElement('button');
          b3.type = 'button';
          b3.className = 'spl-btn spl-btn--small spl-btn--ghost';
          b3.textContent = 'Same journey';
          b3.addEventListener('click', function () {
            setPayloadJsonFilters([{ path: '$.journey_id', val: String(pay.journey_id) }]);
            loadPage(0);
          });
          ar.appendChild(b3);
        }
        if (pay && pay.anon_user_id) {
          var b4 = document.createElement('button');
          b4.type = 'button';
          b4.className = 'spl-btn spl-btn--small spl-btn--ghost';
          b4.textContent = 'Same visitor';
          b4.addEventListener('click', function () {
            setPayloadJsonFilters([{ path: '$.anon_user_id', val: String(pay.anon_user_id) }]);
            loadPage(0);
          });
          ar.appendChild(b4);
        }
        if (ar.firstChild) tdCell.insertBefore(ar, tdCell.firstChild);
      }
      btn.addEventListener('click', function () {
        detail.classList.toggle('hidden');
        var expanded = !detail.classList.contains('hidden');
        btn.setAttribute('aria-expanded', expanded);
        btn.textContent = expanded ? '▼' : '▶';
      });
      tbody.appendChild(tr);
      tbody.appendChild(detail);
    });

    renderTimeline(pageData.content);
    renderFieldsSidebar(pageData.content);
    renderStatsTable(pageData.content);
  }

  function updateJobStats(pageData, elapsedMs) {
    var st = el('splJobStats');
    var tm = el('splJobTiming');
    if (st) {
      st.textContent =
        pageData.totalElements.toLocaleString() +
        ' event' +
        (pageData.totalElements === 1 ? '' : 's') +
        ' (total)';
    }
    if (tm) {
      tm.textContent =
        elapsedMs != null
          ? 'Completed in ' + elapsedMs + ' ms · Showing ' + pageData.content.length + ' on this page'
          : '';
    }
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
    var t0 = typeof performance !== 'undefined' ? performance.now() : 0;
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
        var elapsed =
          typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null;
        state.lastMs = elapsed;
        renderList(pageData);
        updateJobStats(pageData, elapsed);
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
    var panel = el('logsMetricsPanel');
    if (!out || !panel) return;
    panel.classList.remove('hidden');
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
    row.className = 'spl-json-row logs-json-row';
    row.innerHTML =
      '<input type="text" class="logs-json-path spl-mono" placeholder="$.path" />' +
      '<input type="text" class="logs-json-val spl-mono" placeholder="value" />';
    host.appendChild(row);
  }

  function setPayloadJsonFilters(pairs) {
    var host = el('logsJsonRows');
    if (!host) return;
    host.querySelectorAll('.logs-json-row').forEach(function (r, i) {
      if (i > 0) r.remove();
    });
    var first = host.querySelector('.logs-json-row');
    if (!first) {
      addJsonRow();
      first = host.querySelector('.logs-json-row');
    }
    var pi = first.querySelector('.logs-json-path');
    var vi = first.querySelector('.logs-json-val');
    if (!pi || !vi) return;
    if (!pairs || !pairs.length) {
      pi.value = '';
      vi.value = '';
      return;
    }
    pi.value = pairs[0].path;
    vi.value = pairs[0].val;
    for (var i = 1; i < pairs.length; i++) {
      addJsonRow();
      var rows = host.querySelectorAll('.logs-json-row');
      var row = rows[rows.length - 1];
      var p2 = row.querySelector('.logs-json-path');
      var v2 = row.querySelector('.logs-json-val');
      if (p2) p2.value = pairs[i].path;
      if (v2) v2.value = pairs[i].val;
    }
  }

  function resetJsonRowsEmpty() {
    setPayloadJsonFilters([]);
  }

  function applyPreset(kind) {
    var fa = el('filterApp');
    var fs = el('filterSession');
    var fu = el('filterUser');
    var ft = el('filterEventType');
    var fn = el('filterEventName');
    var fp = el('filterPayload');
    var ms = el('splMainSearch');
    if (kind === 'clear') {
      if (fa) fa.value = '';
      if (fs) fs.value = '';
      if (fu) fu.value = '';
      if (ft) ft.value = '';
      if (fn) fn.value = '';
      if (fp) fp.value = '';
      resetJsonRowsEmpty();
      if (ms) ms.value = '';
      var tr = el('splTimeRange');
      if (tr) tr.value = '24h';
    } else if (kind === 'analytics') {
      if (fa) fa.value = '';
      if (fs) fs.value = '';
      if (fu) fu.value = '';
      if (ft) ft.value = 'analytics';
      if (fn) fn.value = '';
      if (fp) fp.value = '';
      resetJsonRowsEmpty();
      var trA = el('splTimeRange');
      if (trA && trA.value === 'all') trA.value = '24h';
    } else if (kind === 'reservations') {
      if (fa) fa.value = '';
      if (fs) fs.value = '';
      if (fu) fu.value = '';
      if (ft) ft.value = 'analytics';
      if (fn) fn.value = '';
      if (fp) fp.value = '';
      setPayloadJsonFilters([{ path: '$.reservation_funnel', val: 'guest_booking' }]);
      var trR = el('splTimeRange');
      if (trR && trR.value === 'all') trR.value = '7d';
    }
    onTimeRangeChange();
    loadPage(0);
  }

  function setResultTab(name) {
    document.querySelectorAll('[data-result-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-result-tab') === name;
      btn.classList.toggle('spl-result-tabs__btn--active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    el('splPanelEvents').classList.toggle('hidden', name !== 'events');
    el('splPanelStats').classList.toggle('hidden', name !== 'stats');
  }

  function onTimeRangeChange() {
    var custom = el('splCustomTime');
    var sel = el('splTimeRange');
    if (!custom || !sel) return;
    custom.classList.toggle('hidden', sel.value !== 'custom');
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
      el('logsMetricsBtn').addEventListener('click', showMetrics);
      var mc = el('logsMetricsClose');
      if (mc) mc.addEventListener('click', function () { el('logsMetricsPanel').classList.add('hidden'); });
      el('logsAddJsonRow').addEventListener('click', addJsonRow);

      el('splToggleAdvanced').addEventListener('click', function () {
        var adv = el('splAdvanced');
        adv.classList.toggle('hidden');
        var expanded = !adv.classList.contains('hidden');
        el('splToggleAdvanced').setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
      el('splAdvanced').classList.add('hidden');

      var tr = el('splTimeRange');
      if (tr) {
        tr.addEventListener('change', onTimeRangeChange);
        onTimeRangeChange();
      }

      document.querySelectorAll('[data-result-tab]').forEach(function (btn) {
        if (btn.disabled) return;
        btn.addEventListener('click', function () {
          setResultTab(btn.getAttribute('data-result-tab'));
        });
      });

      el('splTimelineZoom').addEventListener('click', function () {
        loadPage(state.page);
      });

      var pb = el('splPresetBar');
      if (pb) {
        pb.addEventListener('click', function (e) {
          var t = e.target;
          if (!t || !t.getAttribute) return;
          var pr = t.getAttribute('data-spl-preset');
          if (!pr) return;
          e.preventDefault();
          applyPreset(pr);
        });
      }

      loadPage(0);
    });
  });
})();
