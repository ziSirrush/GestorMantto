# BLT NOW | Plan de liberacion por capas - optimizaciones de informacion
Fecha: 2026-11-20. Trabajo exclusivo en rama request. El repositorio main, Aiven, NetSuite, Azure, GitHub Pages y Netlify NO se modifican por preparar este plan.

## Principio
Se implementaron optimizaciones por modulo con banderas de entorno apagadas (0). Los tests CI usan datos simulados y nunca representan una prueba de rendimiento o integridad contra Aiven vivo. No promover sin QA comparativo autorizado. United sigue en Nevera.

## Alcance de las doce fases originales

| Fase | Cambios reales en request | Limites antes de liberar |
|---|---|---|
| 01. Baseline | Merge de main preservando request; workflow CI solo request | Falta benchmark real y observabilidad de Aiven |
| 02. Indices y SQL | Diagnostico EXPLAIN/SHOW INDEX solo lectura, con doble opt-in | DDL propuesto NO ejecutado; EXPLAIN vivo pendiente |
| 03. Resumen del Dia | Snapshot de hoy y fechas historicas bajo demanda | Necesita QA de zonas, dias y excepcion a Nevera |
| 04. Operativo | Snapshot inicial seis meses, mes historico bajo demanda y preventivos en rangos | Verificar totales por mes y acceso |
| 05. Call Center | U365D paginacion de servidor cuando API anuncia SERVER_PAGED, sort validado y conteo por ventana | Validar MTBC, zona, orden, pagina fuera de rango y vuelta a Dashboard |
| 06. Almacen | Conteo reutilizado, ROLLUP y consultas por ubicacion sin catalogo innecesario | Contrastar valores, decimales, cobertura y subsidiarias |
| 07. Cobranza COR | Precarga por lote de fuentes/facturas, index de relaciones de pagos y resumen sin aditivas | Revalidacion de proyecto conservada; conciliacion financiera real pendiente |
| 08. Cobranza UNI | Paginacion SELECT mas COUNT OVER con respaldo si pagina vacia | La busqueda global LIKE con comodines permanece; no cambiar semantica sin pruebas |
| 09. Instalaciones / Logistica / Ventas | Join redundante evitado sin supervisor; periodo ETD reutilizado; KPI clientes en una agregacion | Comparar PPNS, asignaciones, cantidades, periodos y asesor |
| 10. Experimental NS | Revision en un viaje SQL y proyeccion ligera de Resumen NS | Los snapshots de Criticos/Proyectos siguen acotados a hasta 50.000 registros |
| 11. Integracion NetSuite | Cache solo de las plantillas SQL UPSERT | Transacciones, HMAC, ACK y COALESCE preservados; semantica de NULL/borrado no modificada |
| 12. QA y entrega | GitHub Actions request-only y pruebas especificas | Falta QA E2E, medicion en Aiven y comparacion en Pages/Netlify |

La integracion de la fase 02 (DDL), la busqueda 08, snapshots grandes 10, contrato de NULL 11 y QA vivo 12 NO deben presentarse como resueltos. El codigo parcial de esas fases se deja listo pero desactivado.

## Switches: todos en 0
Definidos en backend/.env.example. Cualquier cambio de bandera se administra en backend Azure solamente despues de promover y aprobar la version de codigo.
- BLT_OPT_ALMACEN_INVENTORY_COUNT_V1 y BLT_OPT_ALMACEN_FILTERS_V1
- BLT_OPT_PREVENTIVOS_RANGE_V1 y BLT_OPT_OPERATIVO_TICKETS_WINDOW_V1
- BLT_OPT_RESUMEN_DAY_V1
- BLT_OPT_CC_U365_WINDOW_COUNT y BLT_OPT_CC_U365_SERVER_PAGING
- BLT_OPT_COBRANZA_COR_SUMMARY_V1, BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1 y BLT_OPT_COBRANZA_COR_BATCH_V1
- BLT_OPT_UNI_PC_WINDOW_COUNT_V1
- BLT_OPT_VENTAS_CLIENT_KPIS_V1, BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1 y BLT_OPT_LOGISTICA_PERIOD_AGG_V1
- BLT_OPT_NS_REVISION_COMBINED_V1 y BLT_OPT_NS_RESUMEN_PROJECTION_V1
- BLT_OPT_NS_UPSERT_SQL_CACHE_V1

## Plan de liberacion gradual

| Capa | Cambios | Puerta de entrada | Reversion |
|---|---|---|---|
| C0 | CI en request, sin publicar | npm ci, npm run check, npm test, todas pruebas especificas en verde | Correccion solo request |
| C1 | EXPLAIN, SHOW INDEX, benchmark solo lectura | Credenciales read-only, autorizacion explicita | Detener diagnostico; sin DDL |
| C2 | Promover codigo a main con flags 0 | Aprobar PR, revisar diff, pruebas, SHA main actual | Revert de commit. Un push a main dispara despliegues Azure y Pages |
| C3 | Almacen, un flag cada vez | Inventario, stock, filtros y valor monetario identicos | Cambiar flag a 0 y verificar |
| C4 | Preventivos, Operativo, luego Resumen Dia | Excepcion Nevera autorizada; 0 fugas entre zonas | Flags a 0 |
| C5 | Call Center COUNT y despues SERVER_PAGED | Paridad U365D y navegacion en Pages y Netlify | Ambas flags a 0 |
| C6 | Logistica, Ventas e Instalaciones | Reconciliar KPIs, ETD, asesor, proyecto y equipos | Flag por modulo a 0 |
| C7 | Cobranza UNI, COR summary, indice pagos y finalmente batch | Aprobacion Cobranza: pagos parciales, CFDI, MXN/USD/EUR, saldos y permisos | Una bandera a 0 por vez |
| C8 | Experimental NS revision y proyeccion | Mismo SHA, misma pantalla visible, mismo scope y refresco | Flags a 0 |
| C9 | Cache SQL M2M NS | Emisor, recuperador, identidades, UPSERT, ACK y rollback transaccional | Flag a 0 |
| C10 | Migraciones/indices | Propuesta separada, backup, EXPLAIN, autorizacion explicita Aiven | Plan de rollback DDL independiente |

No liberar 2 capas en una misma ventana. La promocion del codigo debe quedar inactiva y validada antes de activar flags. No activar Netlify automaticamente: se requiere Combo Diario autorizado.

## Criterios GO / NO GO
1. Comparar bandera 0 vs 1 en MISMA fuente, zona, cuenta, fecha y permisos. Cero diferencias no aprobadas en IDs, filas, fechas, totales, monedas, pagos o permisos.
2. Para Cobranza, comprobar pagos diferidos y parciales con varias facturas, cargos sin relacion, saldos positivos y cero, calculo por moneda y estatus historico.
3. Medir numero de SQL por solicitud, volumen de filas, bytes, p50/p95, queries lentas (umbral 750 ms), errores 4xx/5xx, saturacion del pool, CPU y memoria.
4. Rechazar una capa con aumento sostenido del p95, error 5xx o fuga de permisos aunque reduzca consultas SQL. Metas historicas de QA: CPU sostenida <=25 % y memoria <=83 %, no son datos medidos en esta rama.
5. El plan es comparar por lo menos 30 lecturas por escenario y varios accesos (un usuario/una zona, varias zonas, sin acceso, llaves maestras autorizadas).
6. Ante fallo, volver solo la bandera afectada a 0, repetir muestra y registrar evidencia; cuando se modifique codigo sin flag, revertir commit.
7. El workflow request nunca utiliza credenciales de producción ni ejecuta DDL. Diagnostico opcional: BLT_QA_OPT_READONLY=1 node backend/scripts/qa-optimization-indexes-readonly.js --allow-live-readonly, solo tras autorizacion.

## Bloqueos conocidos
- No hay benchmark de Aiven, Azure o Netlify vivo en esta sesion.
- No se aplicaron alteraciones de indices, estructuras, datos, ni sincronizaciones manuales.
- No cambiar COALESCE en UPSERT NS sin contrato firmado de emisor y recuperador.
- Cualquier comparacion de rendimiento informada sin muestreo real sera etiquetada como hipotetica.
- Mantener controles individuales de permiso, zona, dominio, temporalidad, regreso de navegacion y vistas limpias.
