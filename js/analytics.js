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
      console.debug('[analytics] not supported in this environment');
      window.trackEvent = () => {};
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

    /* Real tracker — logs to GA4 and prints debug line to console */
    const realTrack = (name, params = {}) => {
      try {
        const merged = {
          ...withStoryContext(params),
          page_path: window.location.pathname
        };
        logEvent(analytics, name, merged);
        console.debug(`[analytics] ✓ ${name}`, merged);
      } catch (e) {
        console.debug('[analytics] logEvent error:', e.message);
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
    /* Analytics blocked by ad-blocker or browser restriction — degrade silently */
    console.debug('[analytics] init failed (likely blocked):', err.message);
    window.trackEvent = () => {};
  }
})();
