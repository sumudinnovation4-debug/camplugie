/* Camplugie service worker.
   Chrome requires a fetch handler for the install prompt, and Play Store
   TWA packaging expects a working offline story. Strategy:
     - app shell (HTML/CSS/JS/icons): stale-while-revalidate
     - Supabase + Paystack + any API call: always network, never cached
     - offline navigation: fall back to the cached page, then offline.html
*/

const VERSION = 'camplugie-v1';
const SHELL = [
  '/', '/home.html', '/market.html', '/notifications.html', '/yard.html',
  '/profile.html', '/create.html', '/chat-thread.html', '/group-thread.html',
  '/groups.html', '/call.html', '/wallet.html', '/orders.html', '/cart.html',
  '/listing.html', '/swift.html', '/settings.html', '/offline.html',
  '/style.css', '/config.js', '/payments.js', '/chat-core.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

// Never cache: auth tokens, realtime, payments, serverless endpoints.
const NEVER_CACHE = [
  'supabase.co', 'supabase.in', 'paystack.co', 'paystack.com',
  '/api/', 'expressturn.com', 'google.com/recaptcha',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u)))) // one 404 must not abort install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (NEVER_CACHE.some(p => url.href.includes(p))) return;          // straight to network
  if (url.origin !== self.location.origin) return;                   // don't cache CDNs' opaque responses

  // Navigations: network first so students always get the latest build.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/offline.html')))
    );
    return;
  }

  // Assets: serve cached instantly, refresh in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Lets a new version take over without the user force-closing the app.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* Web Push — wired up but dormant until you add a VAPID key and start
   sending pushes from the server. Without this, notifications only ring
   while a tab is open. */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch (_) { payload = { title: 'Camplugie', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Camplugie', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: payload.tag || 'camplugie',
      data: { url: payload.url || '/notifications.html' },
      vibrate: [180, 90, 180],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/notifications.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) { c.navigate(target); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
