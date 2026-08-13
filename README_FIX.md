# FIX_COTIZACIONES_EDICION_SYNC_FILTROS_V001

Fecha: 12/08/2026
Repositorio base revisado: ziSirrush/GestorMantto (main)

## Alcance

Este paquete atiende únicamente los puntos urgentes acordados:

1. Cotizaciones: recuperar edición reutilizando la plantilla `ventas-cotizaciones-nueva`.
2. Sincronización global: eliminar polling periódico y usar sincronización reactiva, silenciosa y selectiva.
3. Cotizaciones: corregir filtros, especialmente el alias de estatus.

El problema de autoría histórica de comentarios NO se modifica en este paquete.

## Archivos modificados

- `core/data-sync.js`
  - elimina polling de respaldo periódico;
  - no refresca por simple inactividad/visibilidad;
  - detecta mutaciones exitosas POST/PUT/PATCH/DELETE de la API;
  - marca la vista afectada como pendiente de sincronizar;
  - nunca consulta una vista inactiva;
  - al volver/abrir una vista marcada como modificada, ejecuta su `refreshSilent`/background sync;
  - conserva ocultamiento de controles técnicos/manual refresh por rol Programador.

- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
  - corrige `estatus` -> `estatus_proyecto` al construir la query;
  - conserva búsqueda, año, asesor, administrativo y zona;
  - agrega `refreshSilent()` para actualizar listado/KPI sin loader invasivo;
  - conserva filtros, página y scroll al refrescar silenciosamente;
  - el botón Editar del drawer legado apunta también a la plantilla estandarizada.

- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
  - soporta modo alta y modo edición con la misma plantilla;
  - en edición carga `GET /api/ventas/cotizaciones/:id`;
  - precarga cliente, contacto, proyecto, estatus, equipos y datos comerciales;
  - alta usa POST y edición usa PUT;
  - al guardar edición vuelve al detalle anterior;
  - la mutación deja marcado Cotizaciones para refresco inmediato al regresar.

- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html`
  - agrega botón `Editar` en el encabezado.

- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
  - botón Editar abre `ventas-cotizaciones-nueva` en modo edición;
  - estatus/comentarios notifican la mutación global;
  - el detalle se sigue actualizando inmediatamente con la respuesta de backend.

## Flujo esperado

### Estatus
Detalle -> guardar estatus -> detalle cambia inmediatamente -> Cotizaciones queda marcada como modificada -> al regresar a Cotizaciones se consulta Aiven y se actualiza sin F5.

### Edición
Detalle -> Editar -> misma plantilla de Nueva Cotización precargada -> Guardar cambios (PUT) -> regresar al detalle -> listado queda marcado y se refresca al volver a Cotizaciones.

### Sin actividad
Si el usuario no cambia datos, filtros, búsqueda, página o vista, este FIX no genera polling periódico de datos.

## Validaciones realizadas

- `node --check` correcto en los cuatro archivos JavaScript modificados.
- Confirmado en el repositorio base que el backend ya expone `PUT /api/ventas/cotizaciones/:id`.
- Confirmado que backend acepta `estatus_proyecto` y no `estatus` como filtro de lista.
- Confirmado que `core/data-sync.js` ya se carga desde `index.html`, por lo que no se agrega un archivo core nuevo.
- No se modificaron backend, SQL, permisos, comentarios históricos ni otros módulos de Ventas.

## Validación funcional recomendada después de deploy

1. Abrir Cotizaciones y filtrar por Estatus. Confirmar que cambia la lista y KPI.
2. Abrir una cotización -> Editar. Confirmar precarga completa y guardar.
3. Volver al detalle y luego a Cotizaciones. Confirmar que el cambio aparece sin Actualizar/F5.
4. Cambiar estatus desde Detalle, volver a Cotizaciones y verificar actualización inmediata.
5. Dejar la pantalla quieta y revisar Network: no debe existir polling periódico de datos provocado por `core/data-sync.js`.
