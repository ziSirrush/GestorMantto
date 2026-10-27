# BLT NOW — Experimental NS — Fase 2 (backend solo lectura)

**Fecha de preparación:** 26/10/2026.
**Fuente de código:** GitHub `ziSirrush/GestorMantto`, `main`, commit `aaa1f1ed30798716d0885dee1692ce56b1583402`.
**Estado:** entrega local, sin cambios en GitHub, Azure, Aiven ni NetSuite.

## Objetivo

Conservar aislados los módulos de producción y preparar una API exclusiva para el piloto Experimental NS (Fases 3–5):

- `GET /api/experimental-ns/estado` — verificación de columnas necesarias.
- `GET /api/experimental-ns/portafolio?pagina=1&limite=30&buscar=&equipo=&proyecto=` — listado.
- `GET /api/experimental-ns/tickets?pagina=1&limite=30&buscar=&equipo=&proyecto=` — listado.

Las únicas tablas operativas consultadas son `ns_portafolio_pruebas` y `ns_tickets_pruebas`. El catálogo de permisos se consulta por los guards existentes. No hay rutas POST/PUT/PATCH/DELETE, ni procesos de escritura, ni cambios a receptores M2M de NetSuite.

## Contratos y controles

1. Se usa `requireAuth` (JWT de sesión humana), **rol Programador verificado por backend**, permiso funcional del catálogo, puerta de información `EXPERIMENTAL_NS` y alcance UNITED del usuario efectivo.
2. Los códigos de permiso serán:
   - `EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
   - `EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
   - `EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
3. El resolutor territorial **es el central** `buildPortafolioScopeSql_gnral` / `buildTicketScopeSql_gnral`. Los tres `FROM portafolio` de la expresión central de Tickets se sustituyen por `FROM ns_portafolio_pruebas`. Si evoluciona la expresión central, **falla cerrado con 503** antes de ejecutar SQL. De este modo ningún Ticket se autoriza mediante Portafolio productivo.
4. Los parámetros de consulta se parametrizan (placeholders), con máximo 100 registros por página y un límite de página. El orden usa `id_portafolio` / `id` descendente; es independiente de cuándo NetSuite modificó los datos.
5. Se exige la columna adicional `custeventblt_mot_det`, solicitada expresamente para Tickets. Si falta ella u otra columna necesaria, el módulo rechaza la lectura de datos con `503`.
6. Los campos `zona_id` y `estado_registro` de `ns_portafolio_pruebas` son requeridos. Si el cargador NetSuite deja `zona_id` sin correspondencia canónica, los usuarios sin llave maestra **no** verán equipos/tickets de esas zonas. No se amplía acceso por coincidencia de nombres.
7. Los detalles técnicos sólo pueden ser vistos por Programador. Las rutas son de solo lectura también en modo Visor, con usuario efectivo para permisos y alcance.

## SQL planificado (sin aplicación automática)

- `sql/EXPERIMENTAL_NS_F2_PRECHECK_SOLO_LECTURA.sql`: inspección manual de tablas, campos y catálogo existente.
- `sql/EXPERIMENTAL_NS_F2_CATALOGO_PERMISOS_NO_EJECUTADO.sql`: propuesta explícita de **agrupación y catálogo**, sin concesión de permisos ni puertas. Requiere revisión/aprobación previa y verificación contra Aiven actual. No se ejecuta desde comandos PowerShell.
- Una vez aprobado el catálogo, otorgar permisos y puertas individualmente con la administración oficial; **no** otorgar llave maestra ni abrir visibilidad masiva. La API falla cerrado hasta que existan esas autorizaciones.

## Archivos incluidos

Nuevos:
- `backend/src/modules/experimental-ns/experimental-ns.scope.js`
- `backend/src/modules/experimental-ns/experimental-ns.repository.js`
- `backend/src/modules/experimental-ns/experimental-ns.service.js`
- `backend/src/modules/experimental-ns/experimental-ns.controller.js`
- `backend/src/modules/experimental-ns/experimental-ns.routes.js`
- `backend/tests/experimental-ns-fase2.test.js`
- los dos SQL y este documento.

Archivo existente ajustado **localmente** por los comandos de instalación:
- `backend/src/routes/index.js`, con import y montaje localizado en `/experimental-ns` (dentro de `/api`). Ningún módulo productivo se modifica.

## Verificaciones efectuadas / pendientes

- `node --check` en cinco archivos nuevos: validación estática.
- `node --test backend/tests/experimental-ns-fase2.test.js`: 14 pruebas unitarias con BD simulada, validación de permisos, aislamiento SQL y rutas sin escritura.
- El script PowerShell incluye `git diff --check`, copia de seguridad y reversión al fallar, y verifica la ruta central antes de tocar archivos.
- **No hay pruebas de lectura en Aiven real ni Azure E2E, ni SQL aplicado**, por lo que no se confirma la existencia actual de todas las columnas ni permisos vigentes.
- La Fase 2 no altera la maqueta de Fase 1 ni permite que los tres módulos se alimenten aún; su copia/adaptación corresponde a Fases 3 a 5.

## Criterios de aceptación para siguiente fase

1. F1 aplicada localmente y revisada sin errores.
2. DDL real de las dos tablas verificado, especialmente `custeventblt_mot_det` y `zona_id`.
3. Catálogo + puerta + permiso configurados y aprobados sin ampliar acceso general.
4. Pruebas de lectura autorizadas al entorno correspondiente, sin escrituras, y confirmación de que no hay consultas a tablas productivas.
