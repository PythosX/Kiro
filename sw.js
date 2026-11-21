const CACHE = 'kiro-v1', ASSETS = ['/', '/css/styles.css', '/js/app.js', '/icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'KIRO', body: 'You have a reminder' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icons/icon.svg', data: d,
    actions: [{ action: 'open', title: 'Open task' }, { action: 'snooze', title: 'Snooze 10 min' }] }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil(clients.openWindow('/#/tasks' + (e.action === 'snooze' ? '?snooze=' + d.reminderId : '')));
});
