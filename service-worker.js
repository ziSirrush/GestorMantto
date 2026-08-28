const SERVICE_WORKER_VERSION = '20260828-fase1-calls-v001';
const DEFAULT_URL = './index.html?push_open=notifications';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
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
  const title = payload.title || 'Mantto Gestor';
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
