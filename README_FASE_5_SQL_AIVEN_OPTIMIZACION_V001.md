# Fase 5 — SQL/Aiven · Optimización V001

Fecha: 2026-08-28

## Alcance

Esta fase cubre los pendientes acordados de SQL/Aiven sin ejecutar cambios externos automáticamente:

1. instrumentación de consultas MySQL;
2. `EXPLAIN ANALYZE` reproducible;
3. índices compuestos respaldados por consultas reales del backend;
4. sargabilidad del filtro anual de Prospección;
5. limpieza controlada de índices redundantes confirmados en `tickets`.

**No se modifican los bloques de Críticos/MTBC asignados a Lumbre.** No se crean tablas nuevas y no se modifica lógica de permisos, alcance, Notificaciones ni datos funcionales.

## Archivos de código

### `backend/src/config/db.js`

Se agrega observabilidad central para `pool.query`, `pool.execute` y también para conexiones obtenidas mediante `getConnection()`.

Por defecto:

- observabilidad activa;
- una consulta se considera lenta a partir de `750 ms`;
- no se registran valores de parámetros;
- los literales SQL se anonimizan en el `sql_shape`;
- cada consulta recibe un `fingerprint` SHA-256 corto;
- errores SQL registran código/errno/sqlState sin exponer parámetros.

Variables opcionales:

- `DB_QUERY_OBSERVABILITY_ENABLED` — default `true`;
- `DB_SLOW_QUERY_MS` — default `750`;
- `DB_QUERY_TRACE_ALL` — default `false`;
- `DB_QUERY_SHAPE_MAX_LENGTH` — default `1200`.

No se aumenta `DB_CONNECTION_LIMIT`.

### `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`

Antes:

```sql
YEAR(p.fecha_visita) = ?
```

Ahora:

```sql
p.fecha_visita >= ? AND p.fecha_visita < ?
```

Esto conserva el filtro anual pero permite aprovechar un índice por fecha. El KPI `este_anio` también deja de aplicar `YEAR()` sobre la columna `fecha_visita`.

## SQL incluidos

### 1. `20260828_FASE_5_SQL_AIVEN_PRECHECK_V001.sql`

Solo lectura. Debe ejecutarse primero contra la instancia que se vaya a intervenir. Muestra:

- versión MySQL;
- tamaño/filas estimadas de tablas objetivo;
- inventario de índices;
- índices con firma duplicada;
- confirmación de `ultimo_id_notificacion`;
- cobertura de los índices propuestos.

### 2. `20260828_FASE_5_EXPLAIN_ANALYZE_V001.sql`

Solo contiene `SELECT`, pero `EXPLAIN ANALYZE` **ejecuta las consultas** para medirlas. Cubre:

- estado de Notificaciones de polling;
- cursor Push;
- `usuario_zop`;
- comparación Prospección `YEAR()` vs rango sargable;
- Prospección por usuario/año;
- Tickets por equipo/fecha.

Guardar el resultado antes y después de aplicar índices.

### 3. `20260828_FASE_5_INDICES_APLICAR_V001.sql`

Este archivo **sí ejecuta DDL**. Cada alta/baja está protegida por validación en `information_schema`.

Índices propuestos:

- `sup_notificaciones(id_usuario, activo, leido, id_notificacion)`;
- `usuario_zop(usuario_id, estado, zona_id)`;
- `ventas_prospecciones(activo, fecha_visita, id_pros)`;
- `tickets(codigo_equipo, fecha_reporte)`.

Limpieza controlada en `tickets`:

- elimina `idx_equipo` únicamente si confirma que `idx_codigo_equipo` cubre exactamente `codigo_equipo`;
- elimina `idx_ticket` únicamente si confirma que `uq_tickets_ticket` cubre exactamente `ticket` como índice único.

La referencia de estructura usada para preparar esta fase (`SABANA270826.sql`) sí muestra esas redundancias, pero **Aiven es la autoridad operativa**; por eso el SQL vuelve a comprobarlas en tiempo de aplicación.

### 4. `20260828_FASE_5_INDICES_ROLLBACK_V001.sql`

Revierte exclusivamente los índices gestionados por esta fase y restaura los dos índices redundantes retirados de `tickets`.

## Orden de aplicación recomendado

1. Integrar los dos archivos JS y desplegar backend.
2. Observar `[DB_SLOW_QUERY]` sin modificar el pool.
3. Ejecutar `PRECHECK` en Aiven.
4. Ejecutar `EXPLAIN ANALYZE` y guardar resultados **ANTES**.
5. Revisar que las firmas/tablas coincidan con el precheck.
6. Ejecutar `INDICES_APLICAR`.
7. Ejecutar nuevamente `EXPLAIN ANALYZE` y comparar `actual time`, filas examinadas y estrategia de acceso.
8. Si un índice no aporta o aparece una regresión, usar el rollback y revisar ese índice de forma individual.

## Validaciones realizadas al generar el ZIP

- `node --check` en los JS modificados: OK.
- `npm run check` del backend efectivo: OK.
- validador estático de Fase 5: OK.
- comparación de archivos: no se modificaron archivos de Críticos/MTBC.
- no se realizó conexión ni escritura en Aiven.

## Importante

Los números exactos de mejora (`ms`, filas examinadas, costo del plan) **no se pueden confirmar sin ejecutar `EXPLAIN ANALYZE` contra Aiven**. Esta fase entrega el mecanismo para medirlos antes y después en la fuente oficial.
