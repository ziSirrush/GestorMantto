const SERVICE_WORKER_VERSION = '20261015-pwa-version-sync-v003';
const DEFAULT_URL = './index.html?push_open=notifications';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
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
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    await Promise.all(windows.map(refreshLegacyClient));
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
