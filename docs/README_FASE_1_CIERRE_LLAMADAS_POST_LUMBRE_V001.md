# FASE 1 - Cierre de llamadas post Lumbre V001

## Base
Construido sobre `Auditoria Lumbre.zip` y conserva las optimizaciones de carga inicial realizadas por Lumbre.
Este paquete incluye el ajuste de Notificaciones a 30 s, por lo que sustituye al FIX aislado `FIX_POST_LUMBRE_NOTIFICACIONES_30S_V001` para `core/app.js`.

## Alcance
Fase 1 del plan de optimizacion de llamadas. No modifica Call Center, KPI comerciales, SQL de Críticos/MTBC ni estructura de tablas.

## Cambios

### 1. Notificaciones
- Se mantiene el intervalo oficial de 30 segundos.
- El polling periodico consulta solamente `/api/notificaciones/estado`; no descarga la lista completa.
- La lista de notificaciones nuevas sigue cargandose bajo demanda al abrir la campana.
- Cuando llega un Web Push, el Service Worker avisa a las ventanas abiertas y el header actualiza inmediatamente el estado, sin esperar al siguiente ciclo de 30 s.
- El timer se mantiene pausado cuando la pestaña esta oculta, conforme al comportamiento existente.

### 2. Chat de Ticket incremental
- El polling deja de descargar todo el historial de comentarios.
- Se reutiliza la ruta existente `/api/tickets/:ticket/interacciones` con:
  - `mode=comments`
  - `after_comment_id=<ultimo_id>`
- Backend devuelve solo comentarios posteriores al ultimo ID conocido, con limite de 200 por lote.
- Se conserva el esquema adaptativo de Lumbre: 15 s con actividad, 30 s sin cambios y hasta 60 s en inactividad.
- El chat ahora tambien puede detectar el primer comentario aunque el ticket se abriera inicialmente sin comentarios.
- No cambia el Guard ni el alcance del Ticket.

### 3. Cliente HTTP / mutaciones
- `core/http.js` queda como unico puente general de transporte para contexto de ruta y emision de mutaciones de `fetch` directos.
- Se eliminan los monkey-patches duplicados de `window.fetch` en `core/data-sync.js` y `core/interactions.js`.
- Las llamadas administradas por `ManttoAuth.api` siguen emitiendo una sola `mantto:data-mutated`.
- Las llamadas directas via `fetch` siguen notificando mutaciones mediante el puente central.
- Se conserva `viewer-readonly.js` como capa de seguridad independiente; no se modifica ni se debilita el Visor.
- Se conserva la deduplicacion/debounce de refrescos por ruta introducida por Lumbre.

### 4. Carga inicial
- Se conservan los cambios de Lumbre: Home solo carga datos cuando Home es la ruta visible; Soporte no precarga; Nori carga bajo demanda; Interacciones de Home no refrescan fuera de Home.

## Archivos modificados
- `core/app.js`
- `core/http.js`
- `core/data-sync.js`
- `core/interactions.js`
- `core/details.js`
- `core/push-notifications.js`
- `service-worker.js`
- `index.html`
- `backend/src/controllers/data.controller.legacy.js`
- `backend/src/services/information-record-scope-gnral.service.js`

## No modificado
- Call Center.
- Críticos/MTBC.
- Aiven / tablas / índices.
- Azure / Netlify / GitHub.
- Reglas de alcance General, United o Corellian.
- Permisos funcionales.

## Validaciones realizadas
- `node --check` en todos los JavaScript modificados: OK.
- `npm run check` del backend: OK (`Estructura base validada correctamente`).
- Verificado `NOTIFICACIONES_REFRESH_MS = 30000`.
- Verificado cursor `after_comment_id` frontend/backend.
- Verificado que `core/data-sync.js` y `core/interactions.js` ya no reasignan `window.fetch`.
- Verificado que no se incluyeron archivos de Call Center en este paquete.

## Validacion manual recomendada despues de aplicar
1. Abrir directamente Tickets/Cobranza/Portafolio y comprobar en Network que Home/Soporte no precargan datos innecesarios.
2. Confirmar una sola llamada ligera `/api/notificaciones/estado` cada 30 s con la pestaña visible y ninguna con pestaña oculta.
3. En dos sesiones, abrir el mismo Ticket y agregar comentarios; comprobar que el polling usa `after_comment_id` y recibe solo comentarios nuevos.
4. Ejecutar una mutacion normal y comprobar que el modulo visible se refresca una sola vez.
5. Probar Visor de Usuarios en solo lectura para confirmar que sigue bloqueando mutaciones.
