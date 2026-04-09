// ============================================================
//  Tennis Tournament — Service Worker
//  Gère : cache offline + notifications push
// ============================================================

const CACHE_NAME = 'tennis-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

// ---- INSTALL : mise en cache des assets ----
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ---- ACTIVATE : nettoyage anciens caches ----
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- FETCH : serve depuis le cache si dispo ----
self.addEventListener('fetch', e => {
  // Ne pas intercepter les requêtes Supabase
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ---- PUSH : réception notification ----
self.addEventListener('push', e => {
  let data = { title: '🎾 Tournoi de Tennis', body: 'Vous avez un match à jouer !', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'tennis-match',
      renotify: true,
      data: { url: data.url },
      actions: [
        { action: 'open', title: 'Voir le tournoi' },
        { action: 'dismiss', title: 'Ignorer' }
      ]
    })
  );
});

// ---- NOTIFICATION CLICK ----
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const existing = cls.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
