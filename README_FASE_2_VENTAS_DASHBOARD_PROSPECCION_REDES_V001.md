# FASE 2 — Ventas Dashboard · Prospección + Redes

**Proyecto:** Gestor Mantto  
**Fecha:** 2026-08-30  
**Paquete:** `FASE_2_VENTAS_DASHBOARD_PROSPECCION_REDES_V001`  
**Dependencia:** aplicar después de `FASE_1_VENTAS_DASHBOARD_REACOMODO_V001`.

## Objetivo

Implementar la segunda fase del reacomodo de **Ventas → Dashboard**, concentrada en las dos primeras secciones:

1. Prospección
2. Redes

Se conserva la base de Fase 1: orden general, modo **Todos** con alcance autorizado y tablas de 30 registros por página.

---

## Cambios de Prospección

### Tabla del Dashboard

- Mantiene el orden **más reciente → más antiguo** recibido desde backend.
- Los registros sin estatus se resaltan visualmente.
- En modo **Todos** se conserva Asesor; en vista individual se oculta la columna redundante, según Fase 1.

### Detalle de Prospección

- El mapa se muestra **dentro del detalle** cuando existen coordenadas válidas.
- Se reutiliza Leaflet 1.9.4 + OpenStreetMap, tecnología que ya utiliza `ventas-mapa-prospeccion`.
- Las fotografías se abren en **lightbox dentro de la aplicación**; las imágenes ya no redireccionan a otra pestaña.
- Los archivos que no son imagen conservan su flujo normal de apertura.
- La cotización relacionada puede abrirse desde el detalle.

### NUEVO → Cotizado → Cotización

Se agrega el flujo solicitado:

- Si la prospección nació con `nuevo = 1`.
- No tiene `id_cotizacion`.
- Y se intenta cambiar el estatus a **Cotizado**.

El backend devuelve `409 PROSPECCION_COTIZACION_REQUIRED` y **no cambia el estatus**.

El frontend muestra:

> Relacionar esta prospección con una cotización

Opciones:

1. **Crear nueva cotización**
   - Abre el formulario real de Cotizaciones.
   - Precarga proyecto, tipo de proyecto, ciudad, estado, cliente/contacto formal cuando existen, teléfono, correo y comentario disponibles.
   - No crea silenciosamente clientes/contactos.
   - El POST real de Cotizaciones sigue pasando por el permiso nativo `VENTAS_COTIZACIONES_TABLA_COTIZACIONES_NUEVA_COTIZACION.CREAR`.
   - Después de crear la cotización, se llama al endpoint de relación.

2. **Relacionar cotización existente**
   - Usa la búsqueda existente de fuentes `tipo=COTIZADO` dentro del alcance comercial.
   - Solo habilita resultados con cliente/contacto válidos.

### Atomicidad de la relación

El endpoint nuevo:

`PATCH /api/ventas/prospeccion/:id/cotizacion`

realiza dentro de **una sola transacción**:

1. Bloqueo de la prospección.
2. Validación de alcance.
3. Validación de la cotización.
4. Validación de cliente/contacto.
5. Relación `id_cotizacion`.
6. Registro histórico `RELACION_COTIZACION`.
7. Cambio a `Cotizado` cuando corresponde.
8. Registro histórico `CAMBIO_ESTATUS`.
9. Commit.

No se modifica `nuevo` ni `proyecto_cotizado`: se preservan como clasificación/origen histórico.

El historial existente de Prospección se reutiliza; **no se crea tabla nueva**.

---

## Cambios de Redes

### Tabla del Dashboard

- Mantiene **más reciente → más antiguo**.
- Registros sin estatus resaltados visualmente.
- `Asignado a` aparece en modo **Todos** y se oculta en vista individual mediante la base de Fase 1.
- Se conserva la relación existente con Cotizaciones.

### Fotografías

- Imagen 1 e Imagen 2 se visualizan en lightbox dentro de la aplicación.
- Los adjuntos de comentario que sean imágenes también se abren dentro del lightbox.
- Los documentos no-imagen mantienen su apertura habitual.

### Historial de cambios de estatus

El dump `SABANA270826.sql` del 2026-08-27 confirma que:

- existe `ventas_redes_comentarios`;
- no existe `ventas_redes_historial`;
- `ventas_redes` ya tiene `id_estatus`, `fecha_cambio_estatus` y `updated_by`.

Para respetar la regla del proyecto de **reutilizar tablas existentes**, esta fase **NO crea una tabla nueva**.

Se amplía `ventas_redes_comentarios` con:

- `tipo_evento`
- `campo`
- `valor_anterior`
- `valor_nuevo`

Los comentarios existentes quedan con `tipo_evento = COMENTARIO`.

Un trigger `AFTER UPDATE` de `ventas_redes` registra automáticamente un evento `CAMBIO_ESTATUS` cuando cambia `id_estatus`. El movimiento se crea dentro de la misma transacción que el UPDATE de Redes.

El detalle de Redes presenta estos movimientos dentro de la línea de interacciones como:

`Estatus: anterior → nuevo`

Los eventos de historial son inmutables mediante trigger; los comentarios humanos conservan su edición normal.

---

## SQL de esta fase

Archivo:

`sql/FASE_2_VENTAS_REDES_HISTORIAL_ESTATUS_V001.sql`

Tipo de cambio: **🟡 modificación de tabla existente**.

No contiene:

- `CREATE TABLE`
- `DELETE`
- limpieza de datos
- ejecución automática

### Orden recomendado de aplicación

1. Aplicar Fase 1.
2. Hacer respaldo de desarrollo.
3. Ejecutar el SQL de Fase 2 en **Aiven desarrollo**.
4. Validar columnas y triggers con los SELECT incluidos al final del script.
5. Sustituir los archivos backend/frontend de este ZIP.
6. Reiniciar/redeploy del backend.
7. Publicar frontend.
8. Hacer recarga forzada del navegador para evitar usar JS anterior en caché.

> Este paquete **no ejecuta el SQL, no modifica Aiven y no despliega GitHub/Azure/Netlify**.

---

## Archivos incluidos

### Frontend

- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`

### Backend

- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion-cotizacion.repository.js` **nuevo archivo de código, no tabla**
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion-cotizacion.service.js` **nuevo archivo de código, no tabla**

### SQL

- `sql/FASE_2_VENTAS_REDES_HISTORIAL_ESTATUS_V001.sql`

---

## Validaciones realizadas al generar el paquete

- `node --check`: correcto en todos los `.js` incluidos.
- Prueba aislada con mocks del flujo Prospección:
  - bloquea `NUEVO → Cotizado` sin cotización;
  - relación de cotización ejecuta commit;
  - registra `RELACION_COTIZACION`;
  - registra `CAMBIO_ESTATUS`.
- Verificación estática:
  - Dashboard conserva paginación de 30 registros.
  - Prospección/Redes sin estatus se resaltan.
  - Prospección contiene mapa embebido.
  - Imágenes de Prospección y Redes usan lightbox.
  - SQL no contiene `CREATE TABLE` ni `DELETE`.

### Limitación de validación

**No puedo confirmar la ejecución real del trigger contra la base viva**, porque este paquete no ejecuta cambios en Aiven. Esa validación debe hacerse al aplicar el SQL en desarrollo.

---

## Prueba funcional mínima recomendada

1. Abrir Ventas → Dashboard en modo Todos.
2. Confirmar Prospección primero y Redes segundo.
3. Confirmar 30 registros por página.
4. Identificar un registro sin estatus y verificar resaltado.
5. Abrir una Prospección con coordenadas y confirmar mapa embebido.
6. Abrir una fotografía y confirmar lightbox.
7. En Prospección NUEVA sin cotización, seleccionar Cotizado:
   - cancelar modal → el estatus no cambia;
   - relacionar cotización existente → relación + Cotizado;
   - crear nueva → guardar cotización → regresar a Prospección relacionada.
8. Cambiar el estatus de un registro de Redes.
9. Volver a abrirlo y confirmar evento histórico antes → después.
10. Abrir Imagen 1/2 y confirmar que no se abre una pestaña nueva.
