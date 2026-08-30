# FASE 4 — Ventas Dashboard · Clientes + Ventas + Perdidos — V001

Fecha: 2026-08-30  
Proyecto: Gestor Mantto  
Aplicación: **después de Fase 1 → Fase 2 → Fase 3**.

## 1. Alcance de esta fase

Esta fase implementa únicamente el bloque acordado para:

- **4. Clientes**
- **5. Ventas**
- **6. Perdidos**

La paginación del Dashboard sigue siendo **30 registros por página por tabla**, heredada de Fase 1.

No se modifica todavía Logística, Activos ni las dos tablas de Pendientes.

---

## 2. Clientes

### 2.1 Indicador de cliente sin proyecto/cotización relacionada

En la tabla Clientes del Dashboard:

- si `cotizaciones = 0`, la fila se resalta visualmente;
- se muestra el texto **“Sin proyecto/cotización relacionada”**;
- no se reutilizan 🆕 ni 💬 para esta condición, porque esos indicadores mantienen su significado global de nuevo/no visto y comentario nuevo.

La condición usa el contador comercial que ya entrega el backend del Dashboard. No inventa una relación nueva.

### 2.2 Causa técnica de los duplicados

En el backend vigente de Clientes existe `repository.findByIdentity(...)`, pero el flujo `/api/ventas/clientes/sync` actual inserta cada fila mediante `repository.insert(...)` sin consultar esa identidad antes.

Por ello una resincronización del mismo conjunto puede volver a crear físicamente los mismos clientes.

### 2.3 Corrección de sincronización

Se agrega:

`backend/src/modules/ventas-clientes/ventas-clientes-sync-f4.service.js`

El controlador de Clientes utiliza este servicio únicamente para `/clientes/sync`.

Comportamiento:

- conserva el tamaño de lote de **300**;
- reutiliza `ventas-clientes.repository.findByIdentity`;
- si la identidad no existe → **INSERT**;
- si ya existe → **UPDATE del registro canónico**;
- una segunda carga idéntica no genera un segundo cliente;
- la autoría original (`created_by`) del registro canónico no se reemplaza durante la resincronización.

La identidad reutilizada es exactamente la ya implementada por el repositorio actual:

`nombre_empresa + nombre_contacto + email + telefono`, normalizados.

No se introduce una definición de identidad distinta en esta fase.

### 2.4 Saneamiento de duplicados existentes

Se incluyen dos scripts:

1. `sql/FASE_4_CLIENTES_DUPLICADOS_PREVIEW_V001.sql`  
   **Solo lectura**. Debe ejecutarse primero.

2. `sql/FASE_4_CLIENTES_DUPLICADOS_APPLY_V001.sql`  
   Reasigna referencias y desactiva duplicados.

Regla del saneamiento:

- se conserva el `MIN(id_cliente)` activo de cada identidad exacta como canónico;
- se mueven las referencias de:
  - `ventas_cotizaciones_cor.id_cliente`;
  - `ventas_prospecciones.id_cliente`;
  - `ventas_clientes_contactos.id_cliente`;
- el `id_contacto` no cambia al mover un contacto de cliente, por lo que las referencias existentes a ese contacto permanecen válidas;
- los clientes duplicados se marcan `activo = 0`;
- **NO se hace DELETE físico**.

El PREVIEW consulta `information_schema` para mostrar las FK reales que actualmente apuntan a `ventas_clientes.id_cliente`.

En el dump de referencia `SABANA270826.sql` se verificaron esas tres FK. El dump corresponde al corte disponible del 27/08/2026: **no puedo confirmar que la BD Aiven en vivo no haya cambiado después de ese corte**. Si PREVIEW devuelve una FK adicional, se debe detener el APPLY y revisar esa referencia primero.

No se crea ninguna tabla permanente.

---

## 3. Ventas

La tabla 5 del Dashboard queda con estas columnas:

`Proyecto | Cliente | Asesor* | Fecha de venta | Equipos | Ciudad | Estado`

`* Asesor` solo aparece en modo **Todos**. En consulta individual se oculta mediante la regla global del Dashboard.

Cambios:

- se elimina la fecha redundante de Cotización/Solicitud;
- **Fecha de venta = `fecha_cierre`**;
- el orden continúa siendo más reciente → más antiguo por `fecha_cierre`, con `id_cotizacion DESC` como desempate;
- los KPI siguen el Año comercial seleccionado y usan `fecha_cierre`.

El backend que venía de las fases anteriores ya usa `fecha_cierre` para Ventas, por lo que esta fase no duplica esa lógica; corrige la presentación final de la tabla.

---

## 4. Perdidos

La tabla 6 del Dashboard queda con:

`Proyecto | Cliente | Asesor* | Razón de perdido | Empresa vs. quien se perdió | Equipos | Fecha de pérdida | Ciudad | Estado`

`* Asesor` solo aparece en modo **Todos**.

Cambios:

- **Fecha de pérdida = `fecha_cambio_estatus`**;
- se elimina el uso visual de `fecha_cotizacion || fecha_solicitud` para esta tabla;
- los KPI continúan usando el Año comercial según `fecha_cambio_estatus`;
- únicamente se muestran registros con estatus Perdido, como quedó separado en las fases previas.

---

## 5. Archivos incluidos

### Frontend

- `modules/ventas-dashboard/ventas-dashboard.js`
- `core/module-loader.js`

### Backend

- `backend/src/modules/ventas-clientes/ventas-clientes.controller.js`
- `backend/src/modules/ventas-clientes/ventas-clientes-sync-f4.service.js`

### SQL

- `sql/FASE_4_CLIENTES_DUPLICADOS_PREVIEW_V001.sql`
- `sql/FASE_4_CLIENTES_DUPLICADOS_APPLY_V001.sql`

### Validación

- `tests/fase4_clientes_sync_idempotente.test.js`
- `VALIDACION_FASE_4.txt`
- `SHA256SUMS.txt`

---

## 6. Orden recomendado de aplicación

1. Aplicar Fases 1, 2 y 3 si aún no están aplicadas.
2. Copiar backend de Fase 4.
3. Reiniciar backend de desarrollo.
4. Ejecutar `FASE_4_CLIENTES_DUPLICADOS_PREVIEW_V001.sql`.
5. Revisar las FK devueltas por PREVIEW y realizar respaldo antes de modificar datos.
6. Si las FK coinciden con lo esperado, ejecutar `FASE_4_CLIENTES_DUPLICADOS_APPLY_V001.sql` en desarrollo.
7. Verificar Clientes con usuarios de alcance limitado y con modo Todos.
8. Copiar frontend y `core/module-loader.js`.
9. Probar Dashboard:
   - Todos;
   - usuario individual;
   - Cliente con y sin relación;
   - Ventas por varios años;
   - Perdidos por varios años;
   - paginación 30×30.
10. Solo después de validar desarrollo, promover con el procedimiento normal del proyecto.

---

## 7. Fuera de alcance

Esta fase **no**:

- crea tablas permanentes;
- elimina físicamente clientes;
- modifica estatus comerciales;
- cambia historial de Cotizaciones;
- cambia Proyecto de interés;
- modifica Logística;
- modifica Activos;
- modifica Pendientes;
- hace deploy automático a GitHub, Azure, Netlify ni Aiven.
