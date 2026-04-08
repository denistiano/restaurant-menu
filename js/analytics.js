/**
 * analytics.js — Firebase Analytics initialisation
 *
 * Loaded as <script type="module"> on every page.
 * Exposes:
 *   window.trackEvent(name, params)  — fire a GA4 event
 *   window._sessionStartMs           — ms timestamp of this page load
 *
 * Story / sequence correlation (every event):
 *   • Firebase User-ID = anonymous id (localStorage, stable across visits)
 *   • journey_id       = per browser-tab id (sessionStorage)
 *   • story_step       = 0,1,2,… within that tab (sessionStorage)
 *   • page_kind        = landing | menu | admin (derived from pathname)
 *   • journey_start    = fired once per tab when analytics first loads
 *
 * In GA4 Explorations: filter by journey_id, sort by story_step, or use User-ID
 * for cross-session paths. Register custom dimensions for journey_id, story_step,
 * page_kind if needed.
 *
 * Uses an event queue so events fired BEFORE this async module finishes
 * loading from the CDN are buffered and replayed — nothing is lost.
 *
 * GA4 constraints (enforced by good convention, not runtime checks):
 *   • Event name   : snake_case, ≤ 40 chars
 *   • Param name   : snake_case, ≤ 40 chars
 *   • Param value  : string ≤ 100 chars  OR  number
 *   • Max params   : 25 per event
 *
 * Custom parameters (e.g. search_term, filter_type, item_name) must be
 * registered as custom dimensions in GA4 Admin → Data display → Custom definitions
 * before they appear in standard reports and Explorations.
 *
 * Secondary sink — custom ingest (no GA4 limits on param count / string length):
 *   POST → {apiOrigin}/api/v1/events (apiOrigin from __MENU_API_BASE__ or meta; on localhost defaults to http://127.0.0.1:8080)
 *   Body includes:
 *     • restaurantId (nullable) — resolved id for filtering/search (params > window.RESTAURANT_ID > path)
 *     • restaurantScope — landing | menu | admin
 *     • payload — full merged event params + ingest_meta (device, path sources, ga4_mirror_params)
 *   ga4_mirror_params duplicates exactly what Firebase logEvent receives (sanitized).
 *   Landing: session last restaurant id from e_menu_last_restaurant_id_v1 (set on card click).
 *   Override base URL: window.__ANALYTICS_INGEST_URL__
 *
 * Ingest and GA4 are independent: same merged snapshot, two dispatch paths.
 * Ingest: dispatchIngest → setTimeout → fetch. GA4: dispatchGa4 → queue until
 * Firebase ready, then logEvent. Neither path replaces window.trackEvent.
 * Failures log as console.warn [analytics.ingest] / [analytics.ga4].
 */

/* ── Session start time ──────────────────────────────────────
   Exposed so app.js / restaurant.js can compute page duration
   without relying on their own Date.now() calls.
   ─────────────────────────────────────────────────────────── */
window._sessionStartMs = Date.now();

/* ── Story correlation IDs ───────────────────────────────────
   Goal: reconstruct per-user action sequences without needing a backend.
   - anon_user_id: uses GA4 "User-ID" feature (not a custom dimension)
   - journey_id: per-tab anonymous journey id (event param)
   - story_step: monotonically increasing step index per journey (event param)
   */
const STORY_USER_KEY    = 'e_menu_anon_user_id_v1';
const STORY_JOURNEY_KEY = 'e_menu_journey_id_v1';
const STORY_STEP_KEY    = 'e_menu_story_step_v1';

function safeStorageGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeStorageSet(storage, key, val) {
  try { storage.setItem(key, val); } catch { }
}
function uuidV4() {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* ignore */ }
  // Fallback: not cryptographically strong, but good enough for correlation.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const anonUserId = (() => {
  const existing = safeStorageGet(localStorage, STORY_USER_KEY);
  if (existing) return existing;
  const created = uuidV4();
  safeStorageSet(localStorage, STORY_USER_KEY, created);
  return created;
})();

const journeyId = (() => {
  const existing = safeStorageGet(sessionStorage, STORY_JOURNEY_KEY);
  if (existing) return existing;
  const created = uuidV4();
  safeStorageSet(sessionStorage, STORY_JOURNEY_KEY, created);
  // Reset step counter for a new journey.
  safeStorageSet(sessionStorage, STORY_STEP_KEY, '0');
  return created;
})();

let storyStep = (() => {
  const raw = safeStorageGet(sessionStorage, STORY_STEP_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
})();

function nextStoryStep() {
  const cur = storyStep;
  storyStep = cur + 1;
  safeStorageSet(sessionStorage, STORY_STEP_KEY, String(storyStep));
  return cur;
}

/** Read-only debug (console): journey id + current step counter. */
window.__eMenuStory = {
  get journeyId() { return journeyId; },
  get nextStep() { return storyStep; }
};

/** High-level page bucket for Explorations (path-based, no PII). */
function inferPageKind() {
  const raw = (window.location.pathname || '/').replace(/\/index\.html$/i, '/');
  if (raw.includes('/admin')) return 'admin';
  if (raw === '/' || raw === '') return 'landing';
  return 'menu';
}

/* ── GA4 sanitization (module-level — shared by Firebase + ingest mirror) ── */
const GA4_MAX_EVENT_PARAMS = 25;
const GA4_MAX_PARAM_STR = 100;
const GA4_STORY_KEYS_FIRST = ['journey_id', 'story_step', 'page_kind', 'page_path'];

function ga4SanitizeValue(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v);
  return s.length > GA4_MAX_PARAM_STR ? s.slice(0, GA4_MAX_PARAM_STR) : s;
}

function sanitizeGa4Params(raw) {
  const entries = Object.entries(raw).filter(([, v]) => v !== null && v !== undefined);
  const story = [];
  const rest = [];
  entries.forEach(([k, v]) => {
    const sv = ga4SanitizeValue(v);
    if (sv === undefined) return;
    if (GA4_STORY_KEYS_FIRST.includes(k)) story.push([k, sv]);
    else rest.push([k, sv]);
  });
  rest.sort(([a], [b]) => {
    const pa = a.startsWith('restaurant_') ? 0 : 1;
    const pb = b.startsWith('restaurant_') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  const ordered = [...story, ...rest];
  const finalEntries = ordered.slice(0, GA4_MAX_EVENT_PARAMS);
  if (ordered.length > GA4_MAX_EVENT_PARAMS) {
    console.warn(`[analytics] Event had ${ordered.length} params → trimmed to ${GA4_MAX_EVENT_PARAMS} (GA4 limit).`);
  }
  return Object.fromEntries(finalEntries);
}

const LAST_RESTAURANT_SESSION_KEY = 'e_menu_last_restaurant_id_v1';

function inferRestaurantScope() {
  const raw = (window.location.pathname || '/').replace(/\/index\.html$/i, '/');
  if (raw.includes('/admin')) return 'admin';
  if (raw === '/' || raw === '') return 'landing';
  return 'menu';
}

function parseRestaurantSlugFromPath() {
  const parts = (window.location.pathname || '/').replace(/\/index\.html$/i, '/').split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'admin') return null;
  return parts[0];
}

function getRestaurantIdFromWindow() {
  try {
    const id = window.RESTAURANT_ID;
    if (typeof id === 'string' && id.trim()) return id.trim();
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  } catch { /* ignore */ }
  return null;
}

function buildDeviceContext() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const w = typeof window !== 'undefined' ? window : {};
  const sc = typeof screen !== 'undefined' ? screen : {};
  return {
    viewport_w: w.innerWidth,
    viewport_h: w.innerHeight,
    screen_w: sc.width,
    screen_h: sc.height,
    device_memory: nav.deviceMemory,
    hardware_concurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    connection_effective_type: nav.connection && nav.connection.effectiveType,
    save_data: nav.connection && nav.connection.saveData,
    standalone_pwa: nav.standalone === true,
    timezone_offset_min: new Date().getTimezoneOffset(),
    visibility_state: typeof document !== 'undefined' ? document.visibilityState : undefined,
    prerendering: typeof document !== 'undefined' && document.prerendering === true,
  };
}

/**
 * Resolve a single primary restaurant id for indexing + attribution.
 * Order: explicit param → inline RESTAURANT_ID → URL path segment → (landing only) last session selection.
 */
function buildRestaurantIngestMeta(params = {}) {
  const scope = inferRestaurantScope();
  const fromParams = (params.restaurant_id != null && String(params.restaurant_id).trim() !== '')
    ? String(params.restaurant_id).trim()
    : null;
  const fromPage = getRestaurantIdFromWindow();
  const fromPath = parseRestaurantSlugFromPath();
  const lastSession = safeStorageGet(sessionStorage, LAST_RESTAURANT_SESSION_KEY);
  const primary = fromParams || fromPage || fromPath;
  return {
    restaurant_scope: scope,
    restaurant_id_resolved: primary || null,
    restaurant_id_from_params: fromParams,
    restaurant_id_from_page: fromPage,
    restaurant_id_from_path: fromPath,
    last_restaurant_id_session: lastSession || undefined,
  };
}

/**
 * All events get the same story fields. Applied inside realTrack only so
 * queued events are not double-enriched and post-init calls still get steps.
 */
function withStoryContext(params = {}) {
  return {
    ...params,
    journey_id: journeyId,
    story_step: nextStoryStep(),
    page_kind:  inferPageKind()
  };
}

/** Session id for custom ingest API (guide: sessionStorage "sid") */
const INGEST_SESSION_KEY = 'sid';
const INGEST_MAX_PAYLOAD_CHARS = 120000;

const DEFAULT_LOCAL_MENU_API = 'http://127.0.0.1:8080';

/** Same base resolution as menu fetches: __MENU_API_BASE__, meta menu-api-base, or localhost default. */
function resolveAnalyticsApiOrigin() {
  const w = typeof window !== 'undefined' && window.__MENU_API_BASE__;
  if (w && typeof w === 'string' && w.trim()) return w.trim().replace(/\/?$/, '');
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="menu-api-base"]');
  if (meta) {
    const c = meta.getAttribute('content');
    if (c && c.trim()) return c.trim().replace(/\/?$/, '');
  }
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (h === 'localhost' || h === '127.0.0.1' || h === '') {
    return DEFAULT_LOCAL_MENU_API;
  }
  return '';
}
const GA_MEASUREMENT_ID = 'G-FKQNB5Y1DP';

function getIngestEndpoint() {
  const custom = typeof window !== 'undefined' && window.__ANALYTICS_INGEST_URL__;
  if (custom && typeof custom === 'string' && custom.trim()) {
    const u = custom.trim();
    return u.includes('/api/') ? u : u.replace(/\/?$/, '') + '/api/v1/events';
  }
  const base = resolveAnalyticsApiOrigin();
  return base ? base + '/api/v1/events' : '';
}

Object.defineProperty(window, '__MENU_ANALYTICS_INGEST_URL', {
  get() { return getIngestEndpoint(); },
  configurable: true,
});

function getOrCreateIngestSessionId() {
  let sid = safeStorageGet(sessionStorage, INGEST_SESSION_KEY);
  if (!sid) {
    sid = uuidV4();
    safeStorageSet(sessionStorage, INGEST_SESSION_KEY, sid);
  }
  return sid;
}

/** Deep-clone event params for JSON (numbers, strings, plain objects only). */
function jsonSafePayload(obj, depth = 0) {
  if (depth > 8) return '[deep]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (typeof obj === 'string') return obj.length > 8000 ? obj.slice(0, 8000) + '…' : obj;
  if (Array.isArray(obj)) return obj.map(x => jsonSafePayload(x, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k !== 'string' || k.length > 200) continue;
      out[k] = jsonSafePayload(v, depth + 1);
    }
    return out;
  }
  return String(obj);
}

let ingestHttpWarnCount = 0;
const INGEST_HTTP_WARN_CAP = 8;
let ingestNetworkHintLogged = false;

/**
 * POST to custom ingest (same merged snapshot as GA4 would use). Runs synchronously — call from setTimeout only.
 */
function runIngestHttp(eventName, mergedParams) {
  if (typeof window !== 'undefined' && window.__ANALYTICS_INGEST_DISABLED__ === true) return;
  const evName = eventName;
  const merged = mergedParams;
  const mirror = sanitizeGa4Params(merged);
  const sid = getOrCreateIngestSessionId();
  const ingestMeta = buildRestaurantIngestMeta(merged);
  const device = buildDeviceContext();
  const payload = jsonSafePayload({
    ...merged,
    path: window.location.pathname,
    href: window.location.href,
    search: typeof window !== 'undefined' && window.location.search ? window.location.search : undefined,
    hash_fragment: typeof window !== 'undefined' && window.location.hash ? String(window.location.hash).slice(0, 200) : undefined,
    document_title: typeof document !== 'undefined' && document.title ? document.title.slice(0, 300) : undefined,
    referrer: (typeof document !== 'undefined' && document.referrer) ? document.referrer : undefined,
    language: typeof navigator !== 'undefined' ? navigator.language : undefined,
    languages: typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages.slice(0, 8) : undefined,
    user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 500) : undefined,
    anon_user_id: anonUserId,
    ga_measurement_id: GA_MEASUREMENT_ID,
    session_ts_ms: Date.now(),
    ga4_mirror_params: mirror && typeof mirror === 'object' ? jsonSafePayload(mirror) : null,
    ingest_meta: {
      ...ingestMeta,
      device_client: device,
    },
  });
  const body = {
    app: 'restaurant-menu',
    eventType: 'analytics',
    eventName: String(evName || '').slice(0, 200),
    sessionId: sid,
    restaurantId: ingestMeta.restaurant_id_resolved,
    restaurantScope: ingestMeta.restaurant_scope,
    payload,
  };
  const json = JSON.stringify(body);
  if (json.length > INGEST_MAX_PAYLOAD_CHARS) {
    console.warn('[analytics.ingest] payload too large, skipped:', evName);
    return;
  }
  const url = getIngestEndpoint();
  if (!url || !String(url).trim()) {
    return;
  }
  if (!ingestNetworkHintLogged) {
    ingestNetworkHintLogged = true;
    console.info(
      '%c[analytics] Ingest POST',
      'color:#0a0;font-weight:bold',
      '\n → URL:', url,
      '\n Override: window.__ANALYTICS_INGEST_URL__ or window.__MENU_API_BASE__ / meta menu-api-base'
    );
  }
  if (typeof location !== 'undefined' && location.protocol === 'https:' && String(url).startsWith('http:') && ingestHttpWarnCount < INGEST_HTTP_WARN_CAP) {
    ingestHttpWarnCount++;
    console.warn('[analytics.ingest] Page is https but ingest URL is http — browsers usually block this (mixed content). Set window.__ANALYTICS_INGEST_URL__ to https or serve the site over http.', url);
  }
  const verbose = window.__DEBUG_ANALYTICS__ === true ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('e_menu_debug_analytics') === '1');
  if (verbose) console.info('[analytics.ingest] POST', url, evName);
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    mode: 'cors',
    keepalive: true,
    credentials: 'omit',
  }).then((res) => {
    if (!res.ok && ingestHttpWarnCount < INGEST_HTTP_WARN_CAP) {
      ingestHttpWarnCount++;
      console.warn('[analytics.ingest] HTTP', res.status, evName, url);
    }
  }).catch((err) => {
    if (ingestHttpWarnCount < INGEST_HTTP_WARN_CAP) {
      ingestHttpWarnCount++;
      console.warn('[analytics.ingest] fetch failed:', evName, err && err.message ? err.message : err, url);
    }
  });
}

/** Ingest only — isolated from GA4 (non-blocking). */
function dispatchIngest(name, merged) {
  setTimeout(() => {
    try {
      runIngestHttp(name, merged);
    } catch (e) {
      console.warn('[analytics.ingest] pipeline error:', e && e.message ? e.message : e, name);
    }
  }, 0);
}

/* ── GA4: separate state; never blocks ingest ── */
let ga4State = 'pending';
let ga4LogHandler = null;
const ga4PendingQueue = [];

Object.defineProperty(window, '__analyticsGa4State', {
  get() { return ga4State; },
  configurable: true,
});

function dispatchGa4(name, merged) {
  if (ga4State === 'ready' && ga4LogHandler) {
    setTimeout(() => {
      try {
        ga4LogHandler(name, merged);
      } catch (e) {
        console.warn('[analytics.ga4] dispatch error:', e && e.message ? e.message : e, name);
      }
    }, 0);
    return;
  }
  if (ga4State === 'pending') {
    ga4PendingQueue.push({ name, merged });
    return;
  }
}

function buildMergedEvent(name, params = {}) {
  return {
    ...withStoryContext(params),
    page_path: window.location.pathname
  };
}

window.trackEvent = (name, params = {}) => {
  let merged;
  try {
    merged = buildMergedEvent(name, params);
  } catch (e) {
    console.warn('[analytics] trackEvent merge failed:', e && e.message ? e.message : e);
    return;
  }
  dispatchIngest(name, merged);
  dispatchGa4(name, merged);
};

/* Mark start of a new journey once per-tab */
(() => {
  const startedKey = 'e_menu_journey_started_v1';
  const already = safeStorageGet(sessionStorage, startedKey);
  if (already) return;
  safeStorageSet(sessionStorage, startedKey, '1');
  // Use the queue so event ordering stays correct.
  window.trackEvent('journey_start', { source_page: window.location.pathname });
})();

/* ── Firebase config ─────────────────────────────────────────
   These values are NOT secrets — they identify the GA4 property
   but grant no write access.  Safe to include in public JS.
   ─────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBURgWGKUcJPJchNed_wwFdO9cZfDbbskA',
  authDomain:        'restaurant-menu-a225a.firebaseapp.com',
  projectId:         'restaurant-menu-a225a',
  storageBucket:     'restaurant-menu-a225a.firebasestorage.app',
  messagingSenderId: '831079760781',
  appId:             '1:831079760781:web:9e2dea774577f6d6a6f3c4',
  measurementId:     'G-FKQNB5Y1DP'
};

const FIREBASE_VER = '12.10.0';
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-app.js`;
const FIREBASE_ANALYTICS_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-analytics.js`;

(async function initFirebaseAnalytics() {
  let initializeApp;
  let getAnalytics;
  let logEvent;
  let isSupported;
  let setUserId;
  try {
    const [appMod, analyticsMod] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_ANALYTICS_URL),
    ]);
    initializeApp = appMod.initializeApp;
    getAnalytics = analyticsMod.getAnalytics;
    logEvent = analyticsMod.logEvent;
    isSupported = analyticsMod.isSupported;
    setUserId = analyticsMod.setUserId;
  } catch (err) {
    ga4State = 'failed';
    ga4PendingQueue.length = 0;
    console.warn('[analytics.ga4] Firebase modules failed to load (CDN blocked, offline, CSP):', err && err.message ? err.message : err);
    return;
  }

  function isValidEventName(name) {
    const n = String(name || '');
    return n.length > 0 && n.length <= 40 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(n);
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      ga4State = 'failed';
      ga4PendingQueue.length = 0;
      console.warn('[analytics.ga4] not supported (private mode, blocked storage, etc.). Ingest still works.');
      return;
    }

    const app       = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);

    try {
      if (anonUserId) setUserId(analytics, anonUserId);
    } catch (e) {
      console.debug('[analytics.ga4] setUserId failed:', e && e.message ? e.message : e);
    }

    ga4LogHandler = (name, merged) => {
      const safe = sanitizeGa4Params(merged);
      try {
        if (!isValidEventName(name)) {
          console.warn('[analytics.ga4] invalid event name (snake_case, ≤40 chars):', name);
          return;
        }
        logEvent(analytics, name, safe);
        const verbose = window.__DEBUG_ANALYTICS__ === true ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('e_menu_debug_analytics') === '1');
        if (verbose) {
          console.info(`[analytics.ga4] ✓ ${name}`, safe);
        } else {
          console.debug(`[analytics.ga4] ✓ ${name}`, safe);
        }
      } catch (e) {
        console.warn('[analytics.ga4] logEvent failed:', e && e.message ? e.message : e, name);
      }
    };

    ga4State = 'ready';
    const backlog = ga4PendingQueue.splice(0);
    for (const { name, merged } of backlog) {
      try {
        ga4LogHandler(name, merged);
      } catch (e) {
        console.warn('[analytics.ga4] backlog item failed:', e, name);
      }
    }

    console.debug('[analytics.ga4] ready ✓');
  } catch (err) {
    ga4State = 'failed';
    ga4PendingQueue.length = 0;
    console.warn('[analytics.ga4] init failed:', err && err.message ? err.message : err);
  }
})();
