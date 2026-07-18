# Fix Dashboard Operativo — Servicio preventivo por supervisor

## Alcance

- Corrige exclusivamente la gráfica `👤 % Servicio preventivo por supervisor`.
- La fuente oficial pasa a ser `servicios_preventivos.servicio_realizado` en Aiven.
- Solo aparecen usuarios activos con rol activo `Supervisor Mantenimiento Zona...` y zonas activas asignadas.
- El servicio se atribuye al supervisor responsable de la zona, no al usuario que confirmó.
- Numerador: servicios preventivos con `servicio_realizado = 1`.
- Denominador: servicios preventivos programados del mes (`tipo_servicio = PREVENTIVO`).
- Los nombres de supervisores se muestran en MAYÚSCULAS y sin zonas anexadas.
- Se conserva el ajuste visual de la gráfica de Vo.Bo.: nombre en MAYÚSCULAS y sin zona en la etiqueta.

## Archivos modificados

- `modules/dashboard-operativo/dashboard-operativo.js`
- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

## Endpoint agregado

`GET /api/servicios-preventivos/resumen-supervisor?mes=YYYY-MM`

Requiere autenticación y devuelve el resumen mensual desde Aiven.
