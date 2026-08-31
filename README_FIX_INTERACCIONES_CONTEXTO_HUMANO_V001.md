# FIX_INTERACCIONES_CONTEXTO_HUMANO_V001

## Objetivo
Eliminar de Home / Ver todo cualquier texto tecnico de transporte como:

- `Accion POST completada correctamente.`
- verbos HTTP (POST/PUT/PATCH/DELETE)
- endpoint
- IP / user-agent

La bitacora tecnica se conserva en Aiven para diagnostico interno, pero no se expone al navegador.

## Archivos modificados

- `backend/src/middleware/interaction-tracking.middleware.js`
- `backend/src/services/interactions/interactions.service.js`

No requiere ALTER, INSERT ni UPDATE en Aiven.

## Comportamiento nuevo

La interaccion se presenta como accion humana + objeto/contexto real disponible.

Ejemplos esperados:

- `Comentaste en Ticket #TK-100`
  - `Ticket #TK-100 · Proyecto PROY-77 · Equipo EQ-9`
- `Cargaste imagen en Ticket #TK-100`
  - `Ticket #TK-100 · Proyecto PROY-77 · Equipo EQ-9`
- `Adjuntaste archivo en Proyecto PR-200`
  - `Proyecto PR-200`
- `Creaste Equipo 13729-JAL-ELE-BLT`
  - `Proyecto PR-200 · Equipo 13729-JAL-ELE-BLT`

Para acciones hechas dentro del detalle de un Ticket/Proyecto/Equipo, el middleware prioriza el objeto padre de la pantalla actual. Por ello el id de un archivo o comentario nuevo ya no sustituye al Ticket/Proyecto/Equipo en la interaccion.

Para Ticket, cuando existe una referencia valida, el backend consulta la tabla `tickets` para completar `proyecto` y `codigo_equipo`. Si no logra resolver ese contexto, la accion se registra de todas formas con los datos verificables disponibles; no inventa valores.

## Compatibilidad con registros anteriores

`listForUser_gnral()` transforma al leer las interacciones existentes. Si encuentra una descripcion tecnica antigua (`Accion POST...`), deja de devolverla y genera una descripcion humana con los datos que ya existan en `payload_json`, `detalle_json`, entidad o referencia.

Si un registro historico nunca guardo Proyecto/Equipo/Ticket, esos datos no se inventan ni se reconstruyen sin evidencia.

## Privacidad de transporte

El cliente ya no recibe desde `listForUser_gnral()`:

- `metodo_http`
- `endpoint`
- `ip_address`
- `user_agent`
- `detalle_json.source`
- `detalle_json.status`

Estos valores permanecen en `usuario_interacciones` para auditoria tecnica interna.

## Validacion realizada

- `node --check` en ambos archivos: OK.
- Prueba de compatibilidad de registro historico: elimina `Accion POST completada correctamente.` y no expone POST/endpoint/IP.
- Prueba de comentario en Ticket: genera Ticket + Proyecto + Equipo.
- Prueba de carga de imagen desde detalle de Ticket: conserva como referencia el Ticket padre y genera `Cargaste imagen en ...`.

## Aplicacion

Reemplazar ambos archivos respetando sus rutas y reiniciar/redeployar exclusivamente el backend.

No se requiere cambio en `modules/home/home.js`: Home ya consume `actividad_reciente` desde `interactionsService.listForUser_gnral()`.
