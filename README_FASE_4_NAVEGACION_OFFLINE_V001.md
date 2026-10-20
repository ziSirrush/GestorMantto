# BLT NOW | Navegacion nativa sin conexion | Fase 4 V001

**Linea base verificada:** `ziSirrush/GestorMantto`, `main`, version `102026.8`, commit `857f52b8f38062f3171c3198568466b83e7805ac`, 20-oct-2026.
**Dependencias obligatorias:** implementacion Offline previa de respaldos (Fases 1-5), mas Fases 1, 2 y 3 de **Navegacion Offline** ya aplicadas. Esta entrega modifica solo el puente visual: no duplica el motor de sincronizacion anterior.

## Proposito

La pantalla normal de BLT NOW sigue siendo la unica interfaz operativa. El modulo `Modo Offline` se usa exclusivamente para seleccionar, configurar, generar y verificar respaldos. Esta Fase 4 permite guardar comentarios y movimientos descriptivos, sin conexion, **dentro del detalle de Ticket y del expediente de Proyectos de Instalaciones**, reutilizando IndexedDB/outbox existente. El envio efectivo ya lo realiza el sincronizador oficial previo al recuperar una conexion validada y revalidar los permisos.

## Archivos completos que se deben copiar sobre el repositorio, respetando las rutas

- `core/offline-native-actions.js` (NUEVO): captura en el formulario nativo de comentarios de Ticket, e integra comentarios/movimientos descriptivos en el expediente CORELLIAN. Intercepta `submit` solo estando offline y solo para la ruta certificada; valida permisos, firma, generacion, identidad actor/efectivo y el ID numerico del registro desde la copia completa antes de llamar a `enqueueOfflineAction`. No usa POST/PATCH offline. Los avisos indican claramente `pendiente` / `no confirmado en Aiven`.
- `core/offline-navigation.js` (MODIFICADO): inicializa el puente F4 junto a los lectores F2/F3.
- `service-worker.js` (MODIFICADO): nueva version del shell y precache del puente F4; nunca almacena API, comentarios autenticados ni fotografias en Cache Storage.
- `tests/offline-navegacion-fase4-acciones.test.js` (NUEVO): pruebas de captura nativa, filtros de identidad/alcance, rechazo de Vo.Bo., preservacion del texto, formularios online, anclas de Ticket/Proyecto, presentacion y precache.
- `tests/pwa-app-update.test.js` (MODIFICADO): actualizacion de identificador del service worker; no cambia la logica de actualizaciones.
- `docs/ADR_20261020_NAVEGACION_OFFLINE_FASE_4_V001.md` (NUEVO): contrato de datos, restricciones y seguridad.
- `SHA256SUMS_FASE_4_NAVEGACION_OFFLINE_V001.txt`: sumas de los archivos del FIX.

## Alcance especifico

**UNITED — Resumen del Dia / Ticket (pantalla normal):**
- `TICKET_COMMENT`: el mismo formulario de chat/comentarios almacena texto en outbox. Tras ACK de Aiven, el sincronizador previo registra el comentario real en `ticket_comentarios`.
- `TICKET_MOVEMENT`: campo nuevo de seguimiento descriptivo en la propia ficha. Tras ACK se registra como interaccion auditada, **no** como cambio real de estado/Vo.Bo.

**CORELLIAN — Instalaciones > Proyectos / expediente normal:**
- `PROJECT_COMMENT`: comentario de seguimiento descriptivo, guardado en outbox y luego en `usuario_interacciones` por el sincronizador previo. **NO** escribe `instalaciones_comentarios_junta` ni el chat nativo de comentarios de junta.
- `PROJECT_MOVEMENT`: seguimiento descriptivo auditado. **NO** cambia estado del proyecto, equipo, fechas, inventario ni asignaciones.

El respaldo se comprueba por `actor_user_id`, `effective_user_id`, permiso Offline, dominio, modulo, `scope_signature`, `run_id`, `read_only`, version de esquema e identificador real: `tickets.id` o `ins_fl.id_ins_fl`. La persistencia la realiza `core/offline-storage.js` instalado previamente, que revalida la fila exacta en el respaldo antes de aceptar la accion. Se rechazan registros sin ancla, firmas invalidadas, copias sustituidas, usuarios diferentes y Modo Visor.

**Online:** se conserva íntegramente el formulario y comportamiento originales. **Offline:** el chat no muestra el pendiente como comentario confirmado; lo informa como accion local pendiente. Al reconectar, el motor de la Fase 5 de respaldos (`core/offline-scheduler.js`, backend protegido `/api/offline/actions/sync/*`) revalida y procesa la cola con idempotencia, reintentos y conflictos. El servidor Aiven sigue siendo la autoridad. No hay sincronizacion si la PWA esta completamente cerrada.

**Fuera de alcance:** `EQUIPMENT_MOVEMENT` desde detalle de Equipo sin adaptador de navegacion offline certificado, comentarios de junta reales, Vo.Bo., estatus, contratos, inventario, adjuntos, fotos, firmas y otros modulos sin copia certificada. Requieren integraciones especificas; no se simulan.

## Validacion ejecutada

- `node --check` de los 5 archivos JS incluidos: PASS.
- **134/134 pruebas de regresion simulada ejecutables:** PASS en fixture integrado con los fuentes locales de las Fases anteriores; incluye 14 pruebas nuevas de F4.
- **1/1 prueba del worker puente PWA:** PASS. La suite de actualizador completa requiere el arbol integro del repositorio.
- Otras 10 pruebas de permisos del proyecto completo no se incluyeron en el conteo: algunas requieren archivos adicionales (por ejemplo `index.html`, rutas generales y SQL) no presentes en el fixture aislado.
- **No puedo confirmar** pruebas E2E sobre PWA instalada, permisos productivos, servicio Azure o Aiven; no hubo despliegue ni conexion de prueba a produccion.

## Entrega

Solo archivos completos de codigo fuente modificados/nuevos, pruebas, README, ADR y SHA256; sin instaladores, ZIP autoaplicable, scripts de aplicacion, `.patch`, migraciones SQL, commit, push ni publicaciones. Aplicar localmente sobre los arreglos F1-F3 ya integrados, validar en entorno Local y luego en GitHub Pages antes de cualquier despliegue manual a Netlify.

**Sistemas modificados:** ninguno del usuario. **Intactos:** GitHub, Azure, Aiven, Netlify, repositorio local ajeno y datos de produccion.
