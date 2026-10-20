# BLT NOW | Navegación normal sin conexión | Fase 3 V001

**Base validada:** GitHub `ziSirrush/GestorMantto`, `main`, versión `102026.8`, commit `857f52b8f38062f3171c3198568466b83e7805ac` (20-oct-2026). **Requiere las Fases 1 y 2 de Navegación Offline aplicadas previamente.** Es una entrega de código preparada, no una instalación.

## Objetivo

Cuando la API de BLT NOW esté desconectada, **Instalaciones > Proyectos** conserva la barra lateral y su pantalla normal (proyectos activos, filtros, paginación y navegación al expediente unificado); utiliza el respaldo certificado `instalaciones-proyectos` de CORELLIAN en IndexedDB. La configuración de Modo Offline sigue dedicada únicamente a respaldos.

## Archivos completos incluidos

- `core/offline-instalaciones-proyectos.js` (nuevo): puente exclusivamente local de lectura de `GET /api/ins-fl`, con firma de alcance, identidad actor/efectivo, generación completa y protección de escrituras; responde 503 para información no respaldada. Permite el expediente unificado CORELLIAN por el motor original. Identifica la fuente local y oculta controles no operables.
- `core/offline-navigation.js` (modificado): instala el nuevo lector sin sustituir Resumen del Día (F2) y actualiza el mensaje de estado para los dos módulos operativos.
- `service-worker.js` (modificado): versión nueva y precaché **obligatorio** de puente, JS, CSS y plantilla HTML original de Proyectos de Instalaciones; limita el caché de HTML a esa plantilla. No almacena respuestas API ni datos de usuario en Cache Storage.
- `tests/offline-navegacion-fase3-instalaciones.test.js` (nuevo): 20 pruebas unitarias y de integración simulada del puente, permisos, integridad, 5,001 registros, fuente online, expedientes, bloqueo de cambios, vencimiento de acceso y caché.
- `tests/pwa-app-update.test.js` (modificado): adapta exclusivamente el identificador esperado de service worker.
- `docs/ADR_20261020_NAVEGACION_OFFLINE_FASE_3_V001.md` (nuevo): alcance, incompatibilidades y reglas de seguridad.
- `SHA256SUMS_FASE_3_NAVEGACION_OFFLINE_V001.txt`: hashes de todos los archivos fuente/documentación de esta entrega.

## Comportamiento validado por código

1. **Online:** `GET /api/ins-fl?limit=5000` y los demás GET siguen yendo a Azure/Aiven sin intervención; la lógica visual existente continúa intacta.
2. **Offline:** solo si hay módulo autorizado, copia CORELLIAN completa, misma identidad, firma y generación vigente, se devuelve el historial íntegro de `ins_fl` al módulo original. El `limit=5000` original no trunca la copia local.
3. **Detalle normal de proyecto:** el expediente unificado que consume `GET /api/ins-fl` sigue disponible con el alcance CORELLIAN respaldado. No se fabrican paneles UNITED ni otros datos ajenos a la copia.
4. **No respaldado:** fotografías, adjuntos, carpetas/Drive, bitácora, comentarios de junta, logística o datos de Mantenimiento no se presentan como información guardada; se muestran avisos de limitación y se deshabilitan sus acciones, sin generar falsos resultados desde Aiven.
5. **Escrituras:** no se realizan POST/PATCH/PUT/DELETE desde el contexto CORELLIAN desconectado ni se confirman comentarios ficticios. La captura offline mediante la cola existente desde pantallas normales corresponde a Fase 4 de esta implementación.
6. **Reconexión:** se revalida el estado online, se recuperan la consulta y los permisos oficiales sin reemplazar las pantallas nativas.

## Seguridad y dependencias

- No se cambia esquema SQL ni se crea una fuente operativa alternativa. Aiven permanece como autoridad online. No se toca `modules/instalaciones-proyectos/instalaciones-proyectos.js` ni su `.html`/`.css`: el ZIP trae solo archivos nuevos/modificados.
- Nunca se cruza un respaldo CORELLIAN hacia UNITED. No se permite acceso local con token, firma, actor, usuario, permiso o generación inválidos o vencidos. Se borran las vistas precargadas al cambiar de identidad.
- El permiso cacheado no permite detectar revocaciones *recién hechas* mientras el equipo no tiene conexión. Se vuelve a verificar cuando Azure está disponible.
- El JS y CSS del módulo y la plantilla original deben existir en el repositorio del dispositivo. Actualizar la PWA **estando conectado** para completar el precaché antes de probar sin red. Un fallo en esos archivos esenciales impide activar la nueva versión del worker.
- El historial completo se reagrupa en memoria para utilizar la interfaz normal: en dispositivos con poco RAM puede requerir optimizaciones adicionales. No se ha medido rendimiento con 100,000+ registros reales.
- El expediente nativo puede iniciar solicitudes accesorias; el puente responde con no disponible para endpoints no incluidos en la copia. No se introducen sustituciones artificiales de información sensible de otras áreas.

## Validación realizada

- Sintaxis: `node --check` de **5 archivos JS** de entrega: PASS.
- **102/102 pruebas simuladas** de Fases previas, lector F3, almacenamiento, programación, lector, cola, UI y barra de progreso: PASS.
- **1/1 prueba adicional** de actualización del service worker en el entorno de pruebas: PASS. La suite completa del actualizador requiere el árbol íntegro del repositorio y no se ejecutó aquí.
- **No puedo confirmar** validación E2E con Azure/Aiven, PWA instalada, o datos reales de producción; no se ejecutaron.

## Entrega y sistemas intactos

ZIP con archivos completos y rutas de repositorio, documentación, pruebas y sumas SHA-256. **Sin instaladores, `.patch`, scripts de aplicación, SQL, commit, push o publicación.** No se han modificado GitHub, Azure, Aiven, Netlify ni el repositorio local del usuario.
