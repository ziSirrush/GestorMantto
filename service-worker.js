const SERVICE_WORKER_VERSION = '20260731-permissions-mobile-v005';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

const NOTIFICATION_TITLE = 'Mantto Gestor';
const NOTIFICATION_BODY = 'Tienes una nueva notificación pendiente.';
const APP_URL = './index.html?push_open=notifications';

self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification(NOTIFICATION_TITLE, {
    body: NOTIFICATION_BODY,
    icon: './assets/img/icons/icon-192.png',
    badge: './assets/img/icons/icon-192.png',
    tag: 'mantto-global-notifications',
    renotify: true,
    requireInteraction: false,
    data: { url: APP_URL }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'MANTTO_OPEN_NOTIFICATIONS' });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(event.notification.data && event.notification.data.url || APP_URL);
  })());
});
