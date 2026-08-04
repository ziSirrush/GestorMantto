const repository = require('../modules/push-notifications/push-notifications.repository');
const { getVapidConfig, validateVapidConfig, sendPush } = require('../modules/push-notifications/push-notifications.sender');
const logger = require('../shared/logger');

let timer = null;
let running = false;
let warnedConfiguration = false;

function mysqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function cursorFor(subscription) {
  const source = subscription.ultimo_uso_at || subscription.created_at || new Date();
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? mysqlDate(new Date()) : mysqlDate(date);
}

function payloadFor(notification) {
  return {
    title: notification.titulo_notificacion || 'Mantto Gestor',
    body: notification.mensaje_notificacion || 'Tienes una nueva notificacion.',
    icon: './assets/img/icons/icon-192.png',
    badge: './assets/img/icons/icon-192.png',
    tag: `mantto-notification-${notification.id_notificacion}`,
    notificationId: notification.id_notificacion,
    type: notification.tipo_notificacion || null,
    action: notification.accion_notificacion || null,
    referenceId: notification.id_referencia || null,
    route: notification.ruta_destino || 'notifications',
    focus: String(notification.tipo_notificacion || '').toUpperCase().includes('COMENTARIO') ? 'chat' : null
  };
}

async function processSubscription(subscription, cycleCutoff) {
  const rows = await repository.listPendingNotifications({
    userId: subscription.id_usuario,
    cursor: cursorFor(subscription),
    cycleCutoff,
    limit: Number(process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE || 20)
  });

  if (!rows.length) {
    await repository.advanceSubscriptionCursor({ subscriptionId: subscription.id_suscripcion, cycleCutoff });
    return { sent: 0 };
  }

  let sent = 0;
  try {
    for (const notification of rows) {
      await sendPush(subscription, payloadFor(notification), { ttl: 300, urgency: 'high' });
      sent += 1;
    }
    await repository.advanceSubscriptionCursor({ subscriptionId: subscription.id_suscripcion, cycleCutoff });
    return { sent };
  } catch (error) {
    if ([404, 410].includes(Number(error.statusCode))) {
      await repository.deactivateById(subscription.id_suscripcion);
      logger.info(`Suscripcion push ${subscription.id_suscripcion} desactivada por respuesta ${error.statusCode}.`);
      return { sent, expired: true };
    }
    throw error;
  }
}

async function runCycle() {
  if (running) return;
  running = true;
  try {
    const validation = validateVapidConfig(getVapidConfig());
    if (!validation.ok) {
      if (!warnedConfiguration) logger.warn(`Push global inactivo: ${validation.reason}`);
      warnedConfiguration = true;
      return;
    }
    warnedConfiguration = false;
    const cycleCutoff = mysqlDate(new Date());
    const subscriptions = await repository.listActiveSubscriptions(Number(process.env.WEB_PUSH_BATCH_SIZE || 300));
    for (const subscription of subscriptions) {
      try {
        await processSubscription(subscription, cycleCutoff);
      } catch (error) {
        logger.error(`No fue posible enviar push para la suscripcion ${subscription.id_suscripcion}.`, error);
      }
    }
  } catch (error) {
    logger.error('Error en el ciclo global de notificaciones push.', error);
  } finally {
    running = false;
  }
}

function startPushNotificationsJob() {
  if (timer) return timer;
  const validation = validateVapidConfig(getVapidConfig());
  if (!validation.ok) {
    logger.warn(`Job global de notificaciones push no iniciado: ${validation.reason}`);
    return null;
  }
  const intervalMs = Math.max(5000, Number(process.env.WEB_PUSH_DISPATCH_INTERVAL_MS || 5000));
  runCycle().catch(error => logger.error('No fue posible iniciar el primer ciclo push.', error));
  timer = setInterval(() => runCycle().catch(error => logger.error('No fue posible ejecutar el ciclo push.', error)), intervalMs);
  timer.unref?.();
  logger.info(`Job global de notificaciones push activo cada ${intervalMs} ms.`);
  return timer;
}

function stopPushNotificationsJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { startPushNotificationsJob, stopPushNotificationsJob, runCycle };
