// ScheduleMate — Service Worker v3.0 (push)
const CACHE = 'scheduleMate-v3';
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/mm-config.js',
  '/mm-ext.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// 설치: 핵심 파일 캐시
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(STATIC).catch(err => console.warn('[SW] Cache prefetch partial fail:', err))
    )
  );
  self.skipWaiting();
});

// 활성화: 구버전 캐시 삭제
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 요청 처리
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Supabase API — 캐시 안 함
  if (url.includes('supabase.co') || url.includes('supabase.io')) return;

  // 앱 HTML — 네트워크 우선, 실패 시 캐시
  if (url.endsWith('/') || url.endsWith('/index.html') || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // CDN 라이브러리 — 캐시 우선
  if (url.includes('unpkg.com') || url.includes('cdn.jsdelivr.net') || url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => new Response('', { status: 408 })))
    );
    return;
  }

  // 아이콘/정적 파일 — 캐시 우선
  if (url.includes('/icons/') || url.endsWith('manifest.json')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }
});


// ── 푸시 알림 (등원/하원, 수업 요약) ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: '알림', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ScheduleMate', {
    body: d.body || '',
    icon: '/studio-pro/icons/icon-192.png',
    badge: '/studio-pro/icons/icon-192.png',
    data: { url: d.url || '/studio-pro/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/studio-pro/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
