// ============================================================
//  Tennis Tournament — Service Worker
//  Cache désactivé temporairement pour forcer les mises à jour
// ============================================================

const CACHE_NAME = 'tennis-v3-nocache';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Supprimer TOUS les anciens caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Ne JAMAIS servir depuis le cache — toujours le réseau
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});

// Notifications push
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
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const existing = cls.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
