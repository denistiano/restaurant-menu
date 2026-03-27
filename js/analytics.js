/**
 * analytics.js — Firebase Analytics initialisation
 *
 * Loaded as <script type="module"> on every page.
 * Exposes:
 *   window.trackEvent(name, params)  — fire a GA4 event
 *   window._sessionStartMs           — ms timestamp of this page load
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
import { getAnalytics, logEvent, isSupported } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js';

/* ── Session start time ──────────────────────────────────────
   Exposed so app.js / restaurant.js can compute page duration
   without relying on their own Date.now() calls.
   ─────────────────────────────────────────────────────────── */
window._sessionStartMs = Date.now();

/* ── Event queue ─────────────────────────────────────────────
   Other scripts call window.trackEvent() before this module
   has finished fetching from the CDN. We buffer those calls
   and replay them once analytics is ready.
   ─────────────────────────────────────────────────────────── */
window._analyticsQueue = [];
window.trackEvent = (name, params = {}) => {
  window._analyticsQueue.push({ name, params });
};

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

    /* Real tracker — logs to GA4 and prints debug line to console */
    const realTrack = (name, params = {}) => {
      try {
        logEvent(analytics, name, {
          ...params,
          /* Automatically enrich every event with the current URL path so
             GA4 Explorer can filter events by page without extra setup.    */
          page_path: window.location.pathname
        });
        console.debug(`[analytics] ✓ ${name}`, params);
      } catch (e) {
        console.debug('[analytics] logEvent error:', e.message);
      }
    };

    /* Flush buffered events (fired before CDN module was ready) */
    const queued = window._analyticsQueue.slice();
    window._analyticsQueue = [];
    queued.forEach(({ name, params }) => realTrack(name, params));

    /* Swap in the live tracker */
    window.trackEvent = realTrack;

    console.debug('[analytics] Firebase Analytics ready ✓');

  } catch (err) {
    /* Analytics blocked by ad-blocker or browser restriction — degrade silently */
    console.debug('[analytics] init failed (likely blocked):', err.message);
    window.trackEvent = () => {};
  }
})();
