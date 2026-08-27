// [Aster | 2026-08-27 | ASTER-MG | FASE_1_CIERRE_LUMBRE_CURSOR_ID_UNICO_V001]
const repository = require('../modules/push-notifications/push-notifications.repository');
const { getVapidConfig, validateVapidConfig, sendPush } = require('../modules/push-notifications/push-notifications.sender');
const logger = require('../shared/logger');

let timer = null;
let startupTimer = null;
let running = false;
let warnedConfiguration = false;

function normalizeCursorId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

/**
 * Desde FASE_1_CIERRE_LUMBRE_CURSOR_ID_UNICO_V001 el unico cursor autoritativo
 * del dispatcher es notificaciones_push_suscripciones.ultimo_id_notificacion.
 * ultimo_uso_at se conserva solo como dato operativo/auditable y nunca vuelve
 * a calcular ni adelantar la frontera de despacho.
 */
function cursorFor(subscription) {
  const raw = subscription?.ultimo_id_notificacion;
  if (raw === null || raw === undefined || raw === '') return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function notificationLimit() {
  const configured = Number(process.env.WEB_PUSH_NOTIFICATIONS_PER_CYCLE || 20);
  if (!Number.isFinite(configured) || configured < 1) return 20;
  return Math.min(100, Math.floor(configured));
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

async function persistPartialProgress(subscriptionId, startCursorId, lastSuccessfulId) {
  if (lastSuccessfulId <= startCursorId) return;
  try {
    await repository.advanceSubscriptionCursor({
      subscriptionId,
      cursorId: lastSuccessfulId,
      caughtUp: false
    });
  } catch (error) {
    logger.error(`No fue posible conservar el cursor parcial de la suscripcion ${subscriptionId}.`, error);
  }
}

async function processSubscription(subscription, cycleWatermarkId) {
  const startCursorId = cursorFor(subscription);
  if (startCursorId === null) {
    const error = new Error(
      `La suscripcion push ${subscription?.id_suscripcion || '(sin id)'} no tiene un ultimo_id_notificacion valido.`
    );
    error.code = 'PUSH_SUBSCRIPTION_CURSOR_ID_INVALID';
    throw error;
  }

  const watermarkId = normalizeCursorId(cycleWatermarkId);
  const limit = notificationLimit();

  if (watermarkId <= startCursorId) {
    await repository.advanceSubscriptionCursor({
      subscriptionId: subscription.id_suscripcion,
      cursorId: startCursorId,
      caughtUp: true
    });
    return { sent: 0, cursorId: startCursorId, caughtUp: true };
  }

  const rows = await repository.listPendingNotifications({
    userId: subscription.id_usuario,
    cursorId: startCursorId,
    watermarkId,
    limit
  });

  if (!rows.length) {
    await repository.advanceSubscriptionCursor({
      subscriptionId: subscription.id_suscripcion,
      cursorId: watermarkId,
      caughtUp: true
    });
    return { sent: 0, cursorId: watermarkId, caughtUp: true };
  }

  let sent = 0;
  let lastSuccessfulId = startCursorId;

  try {
    for (const notification of rows) {
      const notificationId = normalizeCursorId(notification.id_notificacion);
      if (notificationId <= lastSuccessfulId || notificationId > watermarkId) {
        const error = new Error(`Secuencia de notificaciones invalida para la suscripcion ${subscription.id_suscripcion}.`);
        error.code = 'PUSH_NOTIFICATION_CURSOR_SEQUENCE_INVALID';
        throw error;
      }

      await sendPush(subscription, payloadFor(notification), deliveryOptionsFor(notification));
      sent += 1;
      lastSuccessfulId = notificationId;
    }

    const caughtUp = rows.length < limit || lastSuccessfulId >= watermarkId;
    const nextCursorId = caughtUp ? watermarkId : lastSuccessfulId;

    await repository.advanceSubscriptionCursor({
      subscriptionId: subscription.id_suscripcion,
      cursorId: nextCursorId,
      caughtUp
    });

    return { sent, cursorId: nextCursorId, caughtUp };
  } catch (error) {
    await persistPartialProgress(
      subscription.id_suscripcion,
      startCursorId,
      lastSuccessfulId
    );

    if ([404, 410].includes(Number(error.statusCode))) {
      await repository.deactivateById(subscription.id_suscripcion);
      logger.info(`Suscripcion push ${subscription.id_suscripcion} desactivada por respuesta ${error.statusCode}.`);
      return { sent, expired: true, cursorId: lastSuccessfulId, caughtUp: false };
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

    const cycleWatermarkId = await repository.getNotificationWatermark();
    const subscriptions = await repository.listActiveSubscriptions(Number(process.env.WEB_PUSH_BATCH_SIZE || 300));
    for (const subscription of subscriptions) {
      try {
        await processSubscription(subscription, cycleWatermarkId);
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
  processSubscription,
  cursorFor,
  notificationLimit,
  payloadFor,
  deliveryOptionsFor
};
