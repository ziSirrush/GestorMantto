(function(){
  const directApiBase =
    'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';

  const hostname = String(window.location.hostname || '')
    .trim()
    .toLowerCase();

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';

  const isNetlify =
    hostname === 'bltnow.netlify.app' ||
    hostname.endsWith('.netlify.app');

  // ============================================================
  // API OPERATIVA
  // ============================================================
  // Local, GitHub Pages y Netlify continúan consultando
  // directamente el backend Azure para módulos operativos.
  // ============================================================

  window.MANTTO_API_BASE =
    window.MANTTO_API_BASE || directApiBase;

  // ============================================================
  // API DE SESIÓN / AUTH
  // ============================================================
  //
  // LOCAL
  //   http://localhost:3001
  //
  // GITHUB PAGES
  //   Azure directo
  //
  // NETLIFY
  //   mismo origen Netlify
  //   /api/auth/* será enviado a Azure mediante _redirects
  //
  // ============================================================

  window.MANTTO_SESSION_API_BASE =
    window.MANTTO_SESSION_API_BASE || (
      isLocal
        ? `http://${hostname === '::1' ? 'localhost' : hostname}:3001`
        : isNetlify
          ? window.location.origin
          : directApiBase
    );

  // Integrador aislado de rutas para avisos fotograficos (sin tocar Main).
  // La inicializacion espera al router y no modifica las rutas restantes.
  if (typeof document !== 'undefined' && !document.getElementById('mg-photo-notification-routes')) {
    const script = document.createElement('script');
    script.id = 'mg-photo-notification-routes';
    script.src = './core/photo-notification-navigation.js?v=20261014-v001';
    script.async = false;
    document.head.appendChild(script);
  }

})();