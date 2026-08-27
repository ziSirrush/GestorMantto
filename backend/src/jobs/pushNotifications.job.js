const repository = require('../modules/push-notifications/push-notifications.repository');
const { getVapidConfig, validateVapidConfig, sendPush } = require('../modules/push-notifications/push-notifications.sender');
const logger = require('../shared/logger');

let timer = null;
let startupTimer = null;
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
  const baseTitle = notification.titulo_notificacion || 'Mantto Gestor';
  const emoji = String(notification.icono_notificacion || '').trim();
  const priority = String(notification.prioridad_notificacion || 'MEDIA').trim().toUpperCase();
  const priorityEmoji = {
    ALTA: '🟠',
    MEDIA: '🟡',
    BAJA: '⚪'
  }[priority] || '';
  const prefixes = [priorityEmoji, emoji]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const titlePrefix = prefixes.join(' ');
  const title = titlePrefix && !String(baseTitle).trim().startsWith(titlePrefix)
    ? `${titlePrefix} ${baseTitle}`
    : baseTitle;

  return {
    title,
    body: notification.mensaje_notificacion || 'Tienes una nueva notificacion.',
    icon: './assets/img/icons/icon-192.png',
    badge: './assets/img/icons/icon-192.png',
    tag: `mantto-notification-${notification.id_notificacion}`,
    notificationId: notification.id_notificacion,
    type: notification.tipo_notificacion || null,
    priority,
    action: notification.accion_notificacion || null,
    referenceId: notification.id_referencia || null,
    route: notification.ruta_destino || 'notifications',
    focus: String(notification.tipo_notificacion || '').toUpperCase().includes('COMENTARIO') ? 'chat' : null
  };
}

function deliveryOptionsFor(notification) {
  const priority = String(notification.prioridad_notificacion || 'MEDIA').trim().toUpperCase();
  if (priority === 'CRITICA') return { ttl: 300, urgency: 'high' };
  if (priority === 'ALTA') return { ttl: 900, urgency: 'high' };
  if (priority === 'BAJA') return { ttl: 86400, urgency: 'low' };
  return { ttl: 3600, urgency: 'normal' };
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
      await sendPush(subscription, payloadFor(notification), deliveryOptionsFor(notification));
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

function executePushCycle() {
  runCycle().catch(error => logger.error('No fue posible ejecutar el ciclo push.', error));
}

function startPushNotificationsJob() {
  if (timer || startupTimer) return timer || startupTimer;
  const validation = validateVapidConfig(getVapidConfig());
  if (!validation.ok) {
    logger.warn(`Job global de notificaciones push no iniciado: ${validation.reason}`);
    return null;
  }

  const intervalMs = Math.max(5000, Number(process.env.WEB_PUSH_DISPATCH_INTERVAL_MS || 5000));
  const initialDelayMs = Math.max(intervalMs, 15000);

  startupTimer = setTimeout(() => {
    startupTimer = null;
    executePushCycle();
    timer = setInterval(executePushCycle, intervalMs);
    timer.unref?.();
  }, initialDelayMs);
  startupTimer.unref?.();

  logger.info(`Job global de notificaciones push activo: primer ciclo en ${initialDelayMs} ms y luego cada ${intervalMs} ms.`);
  return startupTimer;
}

function stopPushNotificationsJob() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startPushNotificationsJob,
  stopPushNotificationsJob,
  runCycle,
  payloadFor,
  deliveryOptionsFor
};
