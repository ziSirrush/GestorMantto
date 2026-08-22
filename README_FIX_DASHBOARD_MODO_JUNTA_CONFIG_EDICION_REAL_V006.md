# FIX_DASHBOARD_MODO_JUNTA_CONFIG_EDICION_REAL_V006

## Base
Este FIX parte de **V004**. **NO es necesario aplicar V005** por separado.

Integra en un solo paquete:
1. La persistencia por usuario que iba en V005.
2. La edición real de las celdas aprobadas de Modo Junta.

## Persistencia por usuario
En el mismo navegador/dispositivo se conserva por `id_SB`:
- Modo Normal / Modo Junta.
- Supervisores seleccionados.
- Filtro AFL.
- Sección del reporte seleccionada.

No crea tablas para esta preferencia; usa `localStorage` separado por usuario.

## Edición real - Modo Junta
La edición continúa siendo contextual sobre la propia celda, sin columna ni botón `Editar`.

Campos habilitados:
- `01-SUS`: Estatus.
- `02-OC`: Estatus, Posible recepción de cubo, Comentario.
- `03-PM`: Estatus, Posible recepción de cubo, Comentario.
- `04-M`: Estatus, Comentario.
- `05-PA`: Estatus, Ajustador, Posible inicio de Ajuste, Comentario.
- `06-A`: Estatus, Fecha Inicio Ajuste, Fecha Fin Ajuste, Ajustador, Comentario.
- `07-PE`: Estatus, Comentario.
- `08-T`: Estatus, Comentario.

Mapeo real `ins_fl`:
- Estatus -> `estatus`
- Posible recepción de cubo -> `fecha_posible_recepcion_cubo`
- Comentario -> `comentarios_fl`
- Ajustador -> `ajustador`
- Posible inicio de Ajuste -> `fecha_posible_inicio_ajuste`
- Fecha Inicio Ajuste -> `fecha_inicio_ajuste`
- Fecha Fin Ajuste -> `fecha_fin_ajuste_planeado`

`Estatus` sigue siendo columna exclusiva de **Modo Junta** en este Dashboard. No se modifica Reporte de Instalaciones ni ningún PDF.

## Seguridad / permisos
Se agrega un único permiso atómico reutilizando la acción `EDITAR` existente:

`INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.EDITAR`

El SQL incluido **no asigna** ese permiso a roles ni usuarios. Después de ejecutarlo debe habilitarse desde Panel de Control a quien corresponda.

La backend valida de nuevo el campo permitido según el estatus actual del equipo. El frontend no puede ampliar la lista de campos editables por sí solo.

El Visor de Usuarios permanece de solo lectura: la ruta PATCH rechaza edición si existe `viewerContext` activo.

## Endpoint nuevo
`PATCH /api/instalaciones/dashboard/reporte/:id_ins_fl/celda`

Payload:
```json
{
  "campo": "comentarios_fl",
  "valor": "Nuevo comentario",
  "modo_junta": true,
  "seccion": "02-OC"
}
```

## Interacciones
Cada cambio real se registra en `usuario_interacciones` desde backend.
- Cambio de estatus -> `CAMBIAR_ESTATUS`.
- Resto de campos -> `EDITAR`.

La actualización de `ins_fl` y el registro de interacción usan **la misma transacción MySQL**. Si no se puede registrar la interacción, se hace rollback del cambio.

Para permitir esa transacción compartida se hizo una ampliación compatible en el servicio general de Interacciones: `record_gnral` / `recordFromRequest_gnral` aceptan opcionalmente un executor/connection. Los consumidores actuales continúan usando el pool por defecto.

## Refresco posterior
Después de una mutación confirmada:
- se recarga únicamente la tabla del reporte afectada;
- si cambió `estatus`, también se refresca el bootstrap del Dashboard para actualizar el conteo AFL;
- no se recarga toda la aplicación.

## Archivos modificados
- `index.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.controller.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.routes.js`
- `backend/src/services/interactions/interactions.repository.js`
- `backend/src/services/interactions/interactions.service.js`

Archivo SQL nuevo:
- `database/FIX_PERMISO_EDICION_RAPIDA_DASHBOARD_INSTALACIONES_V006.sql`

## No modificado
- Reporte de Instalaciones congelado.
- PDFs.
- Instalaciones > Ajuste congelado.
- Cobranza United.
- Cobranza Corellian pendiente.
- Estructura de `ins_fl`.
- Rutas globales del backend: la ruta de Dashboard ya está montada bajo `/api/instalaciones`.

## Validaciones realizadas
- `node --check` en todos los JS modificados.
- Mock de servicio: edición permitida en `02-OC` -> OK.
- Mock de servicio: campo no permitido por sección -> bloqueado.
- Mock de servicio: cambio de Estatus -> interacción `CAMBIAR_ESTATUS`.
- Mock de servicio: Visor de Usuarios -> bloqueado como solo lectura.
- Verificado que la lista SQL de campos actualizables está cerrada a los 7 campos aprobados.
- Verificado que el Dashboard no reintroduce consultas a `pc` / Cobranza United.

## Orden recomendado de aplicación
1. Ejecutar el SQL de permiso.
2. Sustituir archivos backend y desplegar/reiniciar backend.
3. Activar `Editar` para los roles/usuarios autorizados en Panel de Control.
4. Sustituir frontend (`index.html` + JS) y desplegar.
5. Probar una edición de Comentario y una de Estatus.

No se realizó una mutación contra Aiven productivo desde este entorno, por lo que el funcionamiento live debe confirmarse tras el deploy.
