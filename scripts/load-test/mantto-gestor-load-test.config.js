// Configuracion versionada del runner V001.
// El origen es publico pero NO puede sustituirse por una URL arbitraria en tiempo de ejecucion.
// Si el backend productivo cambia de origen, este archivo y LOAD_TEST_ALLOWED_ORIGIN deben actualizarse juntos.
export const TRUSTED_ORIGIN = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
export const CATALOG_VERSION = '20260928-v001';

export const SCENARIOS = Object.freeze({
  SALUD: Object.freeze({
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/health', think_seconds: 1 })
    ])
  }),
  HOME: Object.freeze({
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/home/bootstrap', think_seconds: 2 })
    ])
  }),
  CALL_CENTER: Object.freeze({
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/operacion/dashboard-call-center/inicial', think_seconds: 2 })
    ])
  }),
  MIXTO_LECTURA: Object.freeze({
    requests: Object.freeze([
      Object.freeze({ method: 'GET', path: '/api/home/bootstrap', think_seconds: 2 }),
      Object.freeze({ method: 'GET', path: '/api/home/snapshot', think_seconds: 2 }),
      Object.freeze({ method: 'GET', path: '/api/operacion/dashboard-call-center/inicial', think_seconds: 3 }),
      Object.freeze({ method: 'GET', path: '/api/health', think_seconds: 1 })
    ])
  })
});
