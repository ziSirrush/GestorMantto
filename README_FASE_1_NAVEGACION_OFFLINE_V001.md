# BLT NOW · Nueva implementación Modo Offline · Fase 1 V001

**Base comprobada:** `ziSirrush/GestorMantto`, rama `main`, commit `857f52b8f38062f3171c3198568466b83e7805ac` (versión `102026.8`, 20-oct-2026). Esta implementación reinicia la numeración en **Fase 1**.

## Objetivo y alcance

Preparar la navegación normal de BLT NOW para un estado sin conexión al backend, sin crear otro visor:

- Comprobar la conectividad **real con la API y Aiven** mediante `GET /api/health`. El indicador `navigator.onLine` sirve para anticipar la desconexión, no como prueba definitiva de servidor disponible.
- Mostrar un aviso discreto **Sin conexión con BLT NOW** y un botón **Reconectar**. Ese botón reintenta una solicitud a la API; **no** activa Wi-Fi ni cambia configuración de red.
- Mostrar en sus grupos habituales de la barra lateral solo los módulos con exportador certificado, catálogo local autorizado y respaldo íntegro, firmado para el actor, usuario efectivo, empresa y alcance correspondiente.
- Solo hay dos rutas certificadas verificadas: **Operación → Resumen del Día** (UNITED) e **Instalaciones → Proyectos** (CORELLIAN). No mostrar otros módulos aunque aparezcan seleccionados en la configuración de respaldos.
- Al recuperar el servicio, volver a pedir los permisos normales, revalidar copias y ofrecer la sincronización existente; mantener la ruta/vista abierta sin ejecutar una redirección forzada.
- Actualizar la copia de capacidades en el almacenamiento local cuando el programador de respaldos obtenga autorización fresca, reutilizando el contrato de caducidad de la implementación anterior.

**Límite expreso de esta Fase 1:** las rutas aparecen en el menú y se abren desde la navegación **original**. La alimentación de datos de las vistas normales desde IndexedDB queda pendiente de **Fases 2 y 3**. Por tanto, esta fase no debe declararse como consulta de datos offline plenamente funcional. Tampoco habilita nuevas mutaciones ni descargas.

## Archivos completos incluidos

- `core/offline-navigation.js` (nuevo): monitor de conectividad, barra lateral y botón Reconectar.
- `core/offline-scheduler.js` (modificado): inicialización desacoplada y conservación de autorizaciones frescas.
- `service-worker.js` (modificado): nuevo recurso de shell offline y versión de caché.
- `tests/offline-navegacion-fase1.test.js` (nuevo): pruebas de identidad/alcance, menús, reconexión y worker.
- `tests/offline-f2-scheduler.test.js` (modificado): prueba del caché autorizado al completar un respaldo.
- `tests/pwa-app-update.test.js` (modificado): referencia a la nueva versión de worker.

No se incluyeron instaladores, archivos `.patch`, ejecutores de integración, comandos autocommit ni modificaciones SQL.

## Verificaciones realizadas

- `node --check` en los archivos JavaScript modificados y nuevos: correcto.
- **59/59 pruebas simuladas correctas** en selección de navegación, programador, sincronización existente, almacenamiento, visual de avance y regresión de lector local. No se ha ejecutado E2E con Azure/Aiven ni pruebas físicas de desconexión en una PWA desplegada.
- El nuevo recurso de navegación entra en el shell de Service Worker; las respuestas autenticadas de `/api/` continúan excluidas de Cache Storage.

## Precauciones

- Una sesión, permiso o catálogo local caducado **no** otorga acceso offline. La aplicación solo puede reconocer revocaciones que ocurren en el servidor cuando vuelve a comunicarse con él; no debe prometer detección inmediata de revocaciones estando sin red.
- Los dos módulos pueden seguir mostrando errores de consulta sin internet hasta integrar sus adaptadores visuales normales en Fase 2 y Fase 3.
- Si la API vuelve, pero no pueden verificarse los permisos, la barra lateral permanece restringida.
- No se alteró el comportamiento online de los módulos, sus rutas, reglas, endpoints de negocio ni estructuras de Aiven.

**Estado de entrega:** archivos preparados **sin aplicar**. GitHub, Azure, Aiven y Netlify permanecen intactos.
