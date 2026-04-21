/* ============================================================
   sw.js — Service Worker for emenu.click admin push notifications
   Scope: / (covers /m/ and the whole site)
   ============================================================ */
'use strict';

const SW_VERSION = 'v1';

/* ── Install & Activate ──────────────────────────────────── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* ── Push handler ───────────────────────────────────────── */
self.addEventListener('push', event => {
  let data = { title: 'New notification', body: '', url: '/m/' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (_) {}
  }

  const options = {
    body:    data.body,
    icon:    '/resources/logo.webp',
    badge:   '/resources/logo.webp',
    vibrate: [150, 80, 150],
    tag:     'emenu-admin-' + (data.tag || 'default'),
    renotify: true,
    data:    { url: data.url || '/m/' },
    actions: [
      { action: 'open', title: 'Open' }
    ]
  };

  event.waitUntil(
    /* Notify any open admin clients to play the sound */
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'PLAY_NOTIFICATION_SOUND' }));
      return self.registration.showNotification(data.title, options);
    })
  );
});

/* ── Notification click ─────────────────────────────────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/m/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      /* Focus an existing admin tab if one is open */
      for (const client of clients) {
        if (client.url.includes('/m/') && 'focus' in client) {
          return client.focus();
        }
      }
      /* Otherwise open a new window */
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
