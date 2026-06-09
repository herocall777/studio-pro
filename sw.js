// ScheduleMate — Service Worker v2.0
const CACHE = 'scheduleMate-v2';
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
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
