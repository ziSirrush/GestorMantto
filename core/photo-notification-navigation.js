/* [Mantto Gestor | 2026-10-14 | FIX_FOTOS_NOTIFICACIONES_RUTA_V001]
 * Integrador limitado a la navegacion de notificaciones fotograficas.
 * No concede permisos ni sustituye los guards de CORELLIAN / UNITED.
 */
(function installPhotoNotificationNavigation_gnral(window, document){
  'use strict';

  const INSTANCE_KEY = '__MG_PHOTO_NOTIFICATION_NAV_V001__';
  const EVENT_PHOTO = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA';
  const PREFIX_COR = 'detalle:proyecto-corellian:';
  const PREFIX_LEGACY = 'detalle:proyecto:';
  const CORE_SOURCE = 'instalaciones-concentrado-cliente';
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = true;

  function projectIdFromRoute_gnral(route, prefix){
    const value = String(route || '').trim();
    if (value.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
    const id = value.slice(prefix.length).trim();
    return id && id.length <= 255 ? id : null;
  }

  function isHistoricalCorePhoto_gnral(target){
    const eventType = String(target?.type || target?.tipo_notificacion || '').trim().toUpperCase();
    if (eventType !== EVENT_PHOTO) return false;
    // Solo compatibilidad para un texto emitido por nuestro propio servicio
    // historico. Nunca se usa para conceder acceso al registro.
    const message = String(target?.body || target?.mensaje_notificacion || '').trim();
    return /\(Corellian\)\.$/i.test(message);
  }

  function resolvePhotoDestination_gnral(target){
    if (!target || typeof target !== 'object') return null;
    const route = String(target.module || target.route || target.ruta_destino || '').trim();
    let projectId = projectIdFromRoute_gnral(route, PREFIX_COR);
    if (!projectId && isHistoricalCorePhoto_gnral(target)) {
      projectId = projectIdFromRoute_gnral(route, PREFIX_LEGACY);
    }
    if (!projectId) return null;

    return {
      type: 'proyecto',
      id: projectId,
      // Reutiliza el detalle unificado que YA carga ins_fl con su propio alcance.
      template: 'cliente-unificado',
      source: CORE_SOURCE,
      focus: 'fotografias',
      notificationId: target.notificationId || target.id_notificacion || null
    };
  }

  function attachRouter_gnral(){
    const router = window.ManttoRouter;
    if (!router || typeof router.openTarget !== 'function' || typeof router.go !== 'function') return false;
    if (router.__mgPhotoNotificationWrapped) return true;
    const original = router.openTarget;
    router.openTarget = function openTargetWithPhotoDomain_gnral(target){
      const payload = resolvePhotoDestination_gnral(target);
      if (payload) return router.go('detalle', payload);
      return original.call(this, target);
    };
    Object.defineProperty(router, '__mgPhotoNotificationWrapped', {
      value: true,
      configurable: false,
      enumerable: false
    });
    return true;
  }

  function initRouter_gnral(){
    if (attachRouter_gnral()) return;
    // El integrador se carga desde config.js antes de que exista el Router.
    // Intentos acotados: nunca crea un timer permanente en la PWA.
    let attempts = 0;
    const retry = () => {
      if (attachRouter_gnral() || ++attempts >= 80) return;
      window.setTimeout(retry, 50);
    };
    window.setTimeout(retry, 0);
  }

  // La pantalla independiente de Notificaciones utiliza su propio listener y
  // hace go('home') para las rutas desconocidas. Interceptar SOLO la tarjeta
  // Corellian evita tocar la maquina de estados general del Router.
  document.addEventListener('click', async function handlePhotoInboxClick_gnral(event){
    const row = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('#notif-new-list .notif-item[data-ruta][data-id]')
      : null;
    if (!row) return;
    const payload = resolvePhotoDestination_gnral({
      route: row.dataset.ruta,
      type: row.dataset.tipo,
      body: row.dataset.message,
      notificationId: row.dataset.id
    });
    if (!payload || !window.ManttoRouter || typeof window.ManttoRouter.go !== 'function') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = String(row.dataset.id || '').trim();
    if (id) {
      try {
        if (window.ManttoHttp && typeof window.ManttoHttp.request === 'function') {
          await window.ManttoHttp.request('/api/notificaciones/' + encodeURIComponent(id) + '/abrir', {method:'PATCH'});
        } else if (window.ManttoAuth && typeof window.ManttoAuth.api === 'function') {
          await window.ManttoAuth.api('/api/notificaciones/' + encodeURIComponent(id) + '/abrir', {method:'PATCH'});
        }
      } catch (error) {
        // Misma politica que el Router: el fallo al marcar no bloquea la ruta.
        if (window.console && typeof window.console.warn === 'function') {
          window.console.warn('[PHOTO_NOTIFICATION_MARK_READ_FAILED]', error?.message || error);
        }
      }
    }
    if (window.ManttoHome && typeof window.ManttoHome.refreshHeaderNotifications === 'function') {
      window.ManttoHome.refreshHeaderNotifications().catch(() => null);
    }
    window.ManttoRouter.go('detalle', payload);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter_gnral, {once:true});
  } else {
    initRouter_gnral();
  }

})(window, document);
