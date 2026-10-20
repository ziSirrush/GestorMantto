const SERVICE_WORKER_VERSION = '20261020-fix-altas-admin-v001';
// Nueva Fase 5: sincronización por backend protegido; respuestas API nunca se cachean.
const SHELL_CACHE = `blt-now-shell-${SERVICE_WORKER_VERSION}-catalog-f5-v001`;
const DEFAULT_URL = './index.html?push_open=notifications';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './manifest-github.json',
  './styles/base.css',
  './styles/home.css',
  './styles/device-permissions.css',
  './core/daily-phrases.js',
  './core/config.js',
  './core/build-info.js',
  './core/app-update.js',
  './core/project-name.js',
  './core/push-notifications.js',
  './core/device-permissions.js',
  './core/auth.js',
  './core/viewer-readonly.js',
  './core/http.js',
  './core/data-sync.js',
  './core/human-time.js',
  './core/module-loader.js',
  './core/router.js',
  './core/estados-visuales.js',
  './core/pdf/pdf-engine.js',
  './core/rich-text.js',
  './core/details.js',
  './core/user-viewer.js',
  './core/offline-storage.js',
  './core/offline-scheduler.js',
  './core/app.js',
  './modules/home/home.js',
  './modules/support/support.js',
  './modules/offline-pilot/offline-pilot.js',
  './modules/offline-pilot/offline-pilot.css',
  './assets/img/icons/icon-192.png',
  './assets/img/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Un recurso opcional no debe impedir instalar una nueva versión. El
    // núcleo se precarga y el resto se completa con cache-first al utilizarse.
    await Promise.allSettled(SHELL_ASSETS.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

function clientHasManagedUpdates(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Boolean(value));
    };
    const timer = setTimeout(() => finish(false), 900);
    channel.port1.onmessage = message => {
      const data = message.data || {};
      finish(data.type === 'BLT_VERSION_RESPONSE' && data.managedUpdate === true);
    };
    try {
      client.postMessage({ type:'BLT_VERSION_PROBE', serviceWorkerVersion:SERVICE_WORKER_VERSION }, [channel.port2]);
    } catch (error) {
      finish(false);
    }
  });
}

async function refreshLegacyClient(client) {
  if (await clientHasManagedUpdates(client)) return;
  const target = new URL(client.url);
  if (target.searchParams.get('blt_sw_update') === SERVICE_WORKER_VERSION) return;
  target.searchParams.set('blt_sw_update', SERVICE_WORKER_VERSION);
  await client.navigate(target.href);
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('blt-now-shell-') && key !== SHELL_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    await Promise.all(windows.map(refreshLegacyClient));
  })());
});

function isStaticShellRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.includes('/api/')) return false;
  if (/build-info\.generated\.js$|change-audit\.generated\.js$/i.test(url.pathname)) return false;
  const scopePath = new URL('./', self.location.href).pathname;
  if (!url.pathname.startsWith(scopePath)) return false;
  const relativePath = url.pathname.slice(scopePath.length);
  if (!relativePath || relativePath === 'index.html') return true;
  if (relativePath === 'manifest.json' || relativePath === 'manifest-github.json') return true;
  if (/^(?:styles|core)\/.+\.(?:css|js|woff2?)$/i.test(relativePath)) return true;
  if (/^modules\/.+\.(?:css|js)$/i.test(relativePath)) return true;
  return /^assets\/img\/icons\/.+\.(?:png|svg|ico|webp)$/i.test(relativePath);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Las respuestas autenticadas nunca entran a Cache Storage.
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (_error) {
        const cached = await caches.match('./index.html', { ignoreSearch:true });
        return cached || Response.error();
      }
    })());
    return;
  }

  if (!isStaticShellRequest(request)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch:true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

function normalizePayload(event) {
  if (!event.data) return {};
  try { return event.data.json(); } catch (error) {
    try { return JSON.parse(event.data.text()); } catch (nestedError) { return {}; }
  }
}

function buildUrl(payload) {
  const params = new URLSearchParams();
  params.set('push_open', 'target');
  if (payload.route) params.set('push_route', payload.route);
  if (payload.action) params.set('push_action', payload.action);
  if (payload.referenceId != null) params.set('push_reference', String(payload.referenceId));
  if (payload.notificationId != null) params.set('push_notification_id', String(payload.notificationId));
  if (payload.type) params.set('push_type', payload.type);
  if (payload.focus) params.set('push_focus', payload.focus);
  return `./index.html?${params.toString()}`;
}

self.addEventListener('push', event => {
  const payload = normalizePayload(event);
  const title = payload.title || 'BLT NOW';
  const url = buildUrl(payload);
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: payload.body || 'Tienes una nueva notificacion pendiente.',
      icon: payload.icon || './assets/img/icons/icon-192.png',
      badge: payload.badge || './assets/img/icons/icon-192.png',
      tag: payload.tag || `mantto-${payload.notificationId || Date.now()}`,
      renotify: true,
      requireInteraction: String(payload.priority || '').toUpperCase() === 'CRITICA',
      data: { url, target: payload }
    });

    const windows = await clients.matchAll({ type:'window', includeUncontrolled:true });
    windows.forEach(client => {
      client.postMessage({ type:'MANTTO_PUSH_RECEIVED', target:payload });
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.target || null;
  const url = data.url || DEFAULT_URL;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'MANTTO_OPEN_PUSH_TARGET', target });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
