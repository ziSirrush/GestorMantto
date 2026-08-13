# FIX URGENTE COTIZACIONES / EDITAR — BOOTSTRAP LIGERO V008

Fecha: 13/08/2026
Base requerida: V007 ya aplicado.

## Problema confirmado

La ruta `GET /api/ventas/cotizaciones/:id/editar-bootstrap` existía y era llamada por el frontend, pero el V007 utilizaba `clientesService.list(page_size=5000)` para formar el bootstrap.

Esa función no devuelve únicamente clientes: calcula métricas comerciales por cada cliente mediante subconsultas a cotizaciones. Para abrir una sola edición era una carga innecesariamente pesada y podía terminar en error 500/timeout.

Además, el bootstrap invocaba `cotizacionesService.getCatalogos()`, que construye catálogos adicionales que Editar Cotización no necesita.

## Cambio aplicado

Se modifica únicamente:

`backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-editar-bootstrap.service.js`

El nuevo bootstrap conserva una sola llamada HTTP desde el frontend y devuelve:

- cotización existente + equipos;
- lista ligera de clientes autorizados;
- contactos del cliente actual;
- catálogo general de Ventas requerido por el formulario;
- estados;
- estatus disponibles;
- visibilidad vigente.

### Optimización

La lista de clientes ahora selecciona solo:

- id_cliente;
- nombre_empresa;
- razon_social;
- ciudad;
- estado;
- iniciales;
- id_asesor.

No calcula KPIs, cotizaciones, vendidas, perdidas ni en proceso.

También se elimina del bootstrap la llamada pesada a `getCatalogos()` y se consulta únicamente el estatus que la pantalla consume.

## Reglas conservadas

- Aiven sigue siendo la fuente oficial.
- Se conserva la validación de visibilidad/permisos de Ventas.
- Nueva Cotización sigue separada de Editar Cotización.
- Editar continúa guardando mediante PUT; este fix no altera el guardado.
- El filtro Año = Todos introducido por V007 no se modifica.
- No se agregan timers, polling, listeners ni interceptores.
- No se toca Notificaciones/Home/Data Sync.

## Relación con PENDIENTE_OPTIMIZACION_NOTIFICACIONES_Y_SINCRONIZACION_V001

Este fix adopta el criterio aplicable al módulo intervenido:

- no usar listas completas/pesadas cuando la vista solo necesita datos de selección;
- evitar llamadas redundantes;
- no hacer fetch dentro de bucles;
- no crear timers/listeners propios;
- conservar permisos y filtros de usuario en backend;
- mantener Aiven como fuente oficial.

No implementa los pendientes globales de Notificaciones/Home porque no corresponden a este fix.

## Validación técnica realizada

- `node --check ventas-cotizaciones-editar-bootstrap.service.js`: OK.
- No se modifican rutas ni controlador: la ruta V007 existente permanece igual.
- No se modifica esquema SQL.
- No se modifica frontend.

## Validación después del deploy

1. Reiniciar backend.
2. Confirmar `/api/health`.
3. Abrir una cotización y pulsar Editar.
4. Network debe mostrar una única llamada inicial `editar-bootstrap` con HTTP 200.
5. Los campos deben llegar precargados.
6. Abrir Contacto no debe generar una consulta extra solo por desplegarlo.
7. Cambiar realmente de cliente sí puede solicitar los contactos del nuevo cliente.
8. Guardar debe mantener el mismo `id_cotizacion` y ejecutar PUT, no crear una nueva cotización.
