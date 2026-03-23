/**
 * analytics.js — Firebase Analytics for Restaurant Menu
 *
 * Loaded as <script type="module"> on every page.
 * Exposes window.trackEvent(name, params) to non-module IIFE scripts.
 *
 * Uses an event queue so events fired before this module finishes
 * loading from CDN are buffered and flushed on init — nothing is lost.
 */

import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAnalytics, logEvent, isSupported } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js';

/* ── Event queue ─────────────────────────────────────────────
   Other scripts call window.trackEvent() before this module
   has finished fetching from the CDN. We buffer those calls
   and replay them once analytics is ready.
   ──────────────────────────────────────────────────────────── */
window._analyticsQueue = [];
window.trackEvent = (name, params = {}) => {
  window._analyticsQueue.push({ name, params });
};

/* ── Firebase config ─────────────────────────────────────────
   Config values are non-secret (they identify the project,
   they don't grant write access). Safe to include in JS.
   ──────────────────────────────────────────────────────────── */
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
       cannot work (blocked cookies, certain browsers, SSR, etc.) */
    const supported = await isSupported();
    if (!supported) {
      console.debug('[analytics] not supported in this environment');
      window.trackEvent = () => {};
      return;
    }

    const app       = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);

    /* Replace the queue stub with the real function */
    const realTrack = (name, params = {}) => {
      try {
        logEvent(analytics, name, {
          ...params,
          app_version: '1.0'
        });
        console.debug(`[analytics] ${name}`, params);
      } catch (e) {
        console.debug('[analytics] logEvent error:', e);
      }
    };

    /* Flush buffered events */
    window._analyticsQueue.forEach(({ name, params }) => realTrack(name, params));
    window._analyticsQueue = [];

    /* Swap in the live tracker */
    window.trackEvent = realTrack;

    /* Manual page_view with enriched params (supplements auto-tracking) */
    realTrack('page_view', {
      page_title:    document.title,
      page_location: window.location.href,
      page_path:     window.location.pathname
    });

    console.debug('[analytics] Firebase Analytics ready');

  } catch (err) {
    /* Analytics blocked by ad-blocker or extension — degrade silently */
    console.debug('[analytics] init failed (likely blocked):', err.message);
    window.trackEvent = () => {};
  }
})();
