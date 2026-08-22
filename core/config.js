(function(){
  const directApiBase = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  // Las consultas operativas continúan yendo directo a Azure.
  window.MANTTO_API_BASE = window.MANTTO_API_BASE || directApiBase;

  // GitHub Pages no soporta rewrites/proxy tipo Netlify _redirects.
  // Web y PWA publicadas en GitHub Pages deben autenticar directamente
  // contra Azure. En desarrollo local se conserva el backend :3001.
  window.MANTTO_SESSION_API_BASE = window.MANTTO_SESSION_API_BASE || (
    isLocal
      ? `http://${hostname === '::1' ? 'localhost' : hostname}:3001`
      : directApiBase
  );
})();
