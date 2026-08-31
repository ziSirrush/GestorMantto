# FASE 3 — Ventas Dashboard · Cotizaciones

**Versión:** V001  
**Fecha:** 2026-08-30  
**Repositorio base verificado:** `ziSirrush/GestorMantto` · `main`  
**Dependencias funcionales:** aplicar después de Fase 1 y Fase 2.

## Objetivo

Completar la reorganización de la sección **Cotizaciones** del Dashboard de Ventas sin alterar la lógica comercial cerrada de Vendidos/Perdidos, conservando el alcance de información CORELLIAN y el historial existente de cambios de estatus.

## Alcance implementado

### 1. Año comercial en Dashboard

Se agrega un selector **Año comercial** al Dashboard.

- Al abrir, usa el año actual.
- Cotizaciones activas se asignan al año de `fecha_solicitud`; si no existe, usa `fecha_cotizacion`.
- Ventas se asignan al año de `fecha_cierre`.
- Perdidos se asignan al año de `fecha_cambio_estatus`.
- El selector conserva la regla de alcance del usuario autenticado.

### 2. Cotizaciones activas separadas de cierres

La tabla **Cotizaciones** del Dashboard excluye de forma explícita:

- `Vendido`
- `Perdido`

Los KPI de Cotizaciones activas usan la misma separación.

### 3. Orden y fecha mostrada

Cotizaciones activas quedan ordenadas:

1. `fecha_solicitud` descendente;
2. fallback `fecha_cotizacion`;
3. `id_cotizacion DESC` como desempate.

La columna **Fecha** muestra la misma `fecha_efectiva` usada por el ordenamiento para evitar el problema anterior de ordenar por una fecha y mostrar otra.

### 4. Cotización sin cliente formal relacionado

Se considera que falta la relación formal cuando:

`ventas_cotizaciones_cor.id_cliente IS NULL`

El texto histórico de `cliente` no elimina la alerta. La fila/celda se resalta con advertencia visual **“Sin cliente relacionado”**.

No se modifica ni corrige automáticamente `id_cliente` en esta fase.

### 5. Proyecto de interés — personal por usuario

En **Detalle de Cotización** se agrega el control **Proyecto de interés**.

- El estado es personal al usuario autenticado.
- Marcar o desmarcar no modifica el estatus comercial de la cotización.
- No altera cliente, asesor, administrativo, fechas ni equipos.
- La selección puede desactivarse.
- La escritura es idempotente: repetir el mismo estado no genera otro evento.
- La futura sección **Proyectos de interés** NO se genera en esta fase.

#### Persistencia

No se crea una tabla nueva.

Se reutiliza `usuario_interacciones` como bitácora personal basada en eventos:

- `PROYECTO_INTERES_ACTIVADO`
- `PROYECTO_INTERES_DESACTIVADO`

La consulta toma el último evento del usuario + cotización. Esto permite mantener el estado personal sin agregar estructura nueva a Aiven.

### 6. Historial de estatus

**No se crea ni duplica historial.**

El flujo existente de Cotizaciones ya utiliza `ventas-cotizaciones-historial` / `historialService.registrarMovimiento` para registrar cambios de estatus, cierre vendido, cierre perdido y reactivación. Esta fase lo conserva sin reconstruirlo.

### 7. Cache busting

Se actualizan únicamente las versiones de carga de:

- `ventas-dashboard.js`
- `ventas-cotizaciones-detalle.js`

en `core/module-loader.js`.

## Archivos incluidos

### Frontend

- `core/module-loader.js`
- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`

### Backend

- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.repository.js`

### Control

- `README_FASE_3_VENTAS_DASHBOARD_COTIZACIONES_V001.md`
- `VALIDACION_FASE_3.txt`
- `SHA256SUMS.txt`

## Base de datos

**Esta fase NO requiere ALTER, CREATE TABLE ni script SQL.**

Se apoya en estructuras ya existentes:

- `ventas_cotizaciones_cor`
- `usuario_interacciones`
- historial actual de Cotizaciones

La estructura de `usuario_interacciones` se verificó contra el dump disponible `SABANA270826.sql` con corte 2026-08-27. Ese dump no representa necesariamente el estado live posterior a esa fecha.

## Qué NO hace Fase 3

- No sanea duplicados de Clientes — Fase 4.
- No modifica la lógica final/columnas de Ventas — Fase 4.
- No modifica la lógica final/columnas de Perdidos — Fase 4.
- No crea todavía la sección `Proyectos de interés`.
- No modifica Aiven directamente.
- No hace deploy en Azure, Netlify o GitHub.
- No cambia permisos ni Alcance de Información.

## Orden de aplicación

1. Aplicar Fase 1.
2. Aplicar Fase 2.
3. Copiar los archivos de esta Fase 3 conservando sus rutas relativas.
4. Reiniciar backend si corresponde al método de despliegue usado.
5. Publicar frontend.
6. Probar con al menos un usuario individual y un usuario con modo Todos.

## Pruebas mínimas recomendadas tras despliegue

1. Abrir Dashboard Ventas y confirmar año actual seleccionado.
2. Cambiar a un año anterior y confirmar que KPI + Cotizaciones cambian.
3. Confirmar que `Vendido` y `Perdido` no aparecen en Cotizaciones activas.
4. Confirmar que la fecha mostrada coincide con `fecha_solicitud` o fallback `fecha_cotizacion`.
5. Localizar una cotización con `id_cliente IS NULL` y comprobar la advertencia.
6. Abrir una cotización y marcar Proyecto de interés.
7. Recargar y confirmar que sigue marcado para el mismo usuario.
8. Desmarcar, recargar y confirmar que queda desmarcado.
9. Confirmar que otro usuario no comparte el estado personal.
10. Cambiar estatus de una cotización y verificar que el historial existente continúa registrándolo.
