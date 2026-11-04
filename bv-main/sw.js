const CACHE_NAME = 'thunder-lounge-os-v16-shell';
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css?v=15',
    '/app.js?v=15',
    '/ion-storm.js',
    '/backend-config.js',
    '/security.js',
    '/manifest.webmanifest',
    '/thunder-icon.svg',
    '/adminx.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('thunder-lounge-os-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    if (
        request.method !== 'GET' ||
        url.origin !== self.location.origin ||
        url.pathname.startsWith('/api') ||
        url.pathname.startsWith('/admin') ||
        url.pathname.includes('firebase') ||
        url.pathname.includes('firestore')
    ) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match('/index.html');
                    if (cached) return cached;
                    throw new Error('No cached application shell is available offline.');
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const update = fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            });
            return cached || update;
        })
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
