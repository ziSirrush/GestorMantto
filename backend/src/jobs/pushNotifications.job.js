const repository = require('../modules/push-notifications/push-notifications.repository');
const { getVapidConfig, validateVapidConfig, sendEmptyPush } = require('../modules/push-notifications/push-notifications.sender');
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

async function processSubscription(subscription, cycleCutoff) {
  const pending = await repository.countPendingNotifications({
    userId: subscription.id_usuario,
    cursor: cursorFor(subscription),
    cycleCutoff
  });

  if (pending <= 0) {
    await repository.advanceSubscriptionCursor({
      subscriptionId: subscription.id_suscripcion,
      cycleCutoff
    });
    return { sent: false, pending: 0 };
  }

  try {
    await sendEmptyPush(subscription.endpoint, { ttl: 120, urgency: 'high' });
    await repository.advanceSubscriptionCursor({
      subscriptionId: subscription.id_suscripcion,
      cycleCutoff
    });
    return { sent: true, pending };
  } catch (error) {
    if ([404, 410].includes(Number(error.statusCode))) {
      await repository.deactivateById(subscription.id_suscripcion);
      logger.info(`Suscripcion push ${subscription.id_suscripcion} desactivada por respuesta ${error.statusCode}.`);
      return { sent: false, expired: true, pending };
    }
    throw error;
  }
}

async function runCycle() {
  if (running) return;
  running = true;
  try {
    const config = getVapidConfig();
    const validation = validateVapidConfig(config);
    if (!validation.ok) {
      if (!warnedConfiguration) {
        logger.warn(`Push global inactivo: ${validation.reason}`);
        warnedConfiguration = true;
      }
      return;
    }

    warnedConfiguration = false;
    const cycleCutoff = mysqlDate(new Date());
    const subscriptions = await repository.listActiveSubscriptions(
      Number(process.env.WEB_PUSH_BATCH_SIZE || 300)
    );

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
  timer = setInterval(() => {
    runCycle().catch(error => logger.error('No fue posible ejecutar el ciclo push.', error));
  }, intervalMs);
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
