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
 */

import { initializeApp }                      from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAnalytics, logEvent, isSupported, setUserId } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js';

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

/* ── Event queue ─────────────────────────────────────────────
   Other scripts call window.trackEvent() before this module
   has finished fetching from the CDN. We buffer those calls
   and replay them once analytics is ready.
   ─────────────────────────────────────────────────────────── */
window._analyticsQueue = [];
window.trackEvent = (name, params = {}) => {
  window._analyticsQueue.push({ name, params });
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

(async () => {
  try {
    /* isSupported() returns false in environments where Analytics
       cannot work (blocked cookies, Safari ITP, SSR, etc.)       */
    const supported = await isSupported();
    if (!supported) {
      console.warn('[analytics] Firebase Analytics not supported here (private mode, blocked storage, etc.). Events disabled.');
      window.trackEvent = noopTrackEvent;
      window._analyticsQueue = [];
      return;
    }

    const app       = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);

    /* Enable GA4 User-ID correlation (best practice vs custom dimension). */
    try {
      if (anonUserId) setUserId(analytics, anonUserId);
    } catch (e) {
      console.debug('[analytics] setUserId failed:', e && e.message ? e.message : e);
    }

    /* GA4 / Firebase: max 25 params per event; string values max 100 chars.
       Exceeding limits can cause logEvent to fail or drop the event. */
    const MAX_EVENT_PARAMS = 25;
    const MAX_PARAM_STR = 100;
    const STORY_KEYS_FIRST = ['journey_id', 'story_step', 'page_kind', 'page_path'];

    function sanitizeValue(v) {
      if (v === null || v === undefined) return undefined;
      if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const s = String(v);
      return s.length > MAX_PARAM_STR ? s.slice(0, MAX_PARAM_STR) : s;
    }

    function sanitizeGa4Params(raw) {
      const entries = Object.entries(raw).filter(([, v]) => v !== null && v !== undefined);
      const story = [];
      const rest = [];
      entries.forEach(([k, v]) => {
        const sv = sanitizeValue(v);
        if (sv === undefined) return;
        if (STORY_KEYS_FIRST.includes(k)) story.push([k, sv]);
        else rest.push([k, sv]);
      });
      rest.sort(([a], [b]) => {
        const pa = a.startsWith('restaurant_') ? 0 : 1;
        const pb = b.startsWith('restaurant_') ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      });
      const ordered = [...story, ...rest];
      const finalEntries = ordered.slice(0, MAX_EVENT_PARAMS);
      if (ordered.length > MAX_EVENT_PARAMS) {
        console.warn(`[analytics] Event had ${ordered.length} params → trimmed to ${MAX_EVENT_PARAMS} (GA4 limit).`);
      }
      return Object.fromEntries(finalEntries);
    }

    function isValidEventName(name) {
      const n = String(name || '');
      return n.length > 0 && n.length <= 40 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(n);
    }

    /* Real tracker — logs to GA4 and prints debug line to console */
    const realTrack = (name, params = {}) => {
      try {
        if (!isValidEventName(name)) {
          console.warn('[analytics] Invalid event name (use snake_case, ≤40 chars):', name);
          return;
        }
        const merged = {
          ...withStoryContext(params),
          page_path: window.location.pathname
        };
        const safe = sanitizeGa4Params(merged);
        logEvent(analytics, name, safe);
        const verbose = window.__DEBUG_ANALYTICS__ === true ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('e_menu_debug_analytics') === '1');
        if (verbose) {
          console.info(`[analytics] ✓ ${name}`, safe);
        } else {
          console.debug(`[analytics] ✓ ${name}`, safe);
        }
      } catch (e) {
        console.warn('[analytics] logEvent failed:', e && e.message ? e.message : e, name);
      }
    };

    /* Flush buffered events (fired before CDN module was ready) */
    const queued = window._analyticsQueue.slice();
    window._analyticsQueue = [];
    queued.forEach(({ name, params }) => realTrack(name, params));

    /* Swap in the live tracker (must still apply story context + page_path) */
    window.trackEvent = realTrack;

    console.debug('[analytics] Firebase Analytics ready ✓');

  } catch (err) {
    console.warn('[analytics] Firebase init failed (network, ad-blocker, or CSP):', err && err.message ? err.message : err);
    window.trackEvent = noopTrackEvent;
  }
})();

/** Warn once when events cannot be sent (no-op). */
function noopTrackEvent() {
  if (noopTrackEvent._warned) return;
  noopTrackEvent._warned = true;
  console.warn('[analytics] trackEvent is a no-op — check ad-blockers, gstatic.com access, or console above.');
}
