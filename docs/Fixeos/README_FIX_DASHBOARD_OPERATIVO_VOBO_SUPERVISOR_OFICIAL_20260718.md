# Fix Dashboard Operativo - Vo.Bo. validados por supervisor

Fecha: 2026-07-18

## Alcance

Este paquete sustituye la gráfica incorrecta `% Servicio por tipo de equipo` por:

`👤 % Vo.Bo. validados por supervisor`

## Regla aplicada

- La lista de supervisores se obtiene exclusivamente desde `GET /api/usuarios/supervisores-mantenimiento`.
- El endpoint consulta Aiven y solo devuelve usuarios activos de United Elevadores con un rol activo cuyo nombre comienza con `Supervisor Mantenimiento`.
- Cada supervisor se muestra junto con sus zonas activas de `usuario_zop` y `z_op`.
- Los tickets se atribuyen al supervisor responsable mediante coincidencia normalizada entre `tickets.supervisor` y `usuarios.nombre`.
- Numerador: tickets cuyo `vobo_estado` normalizado sea exactamente `VALIDADO`.
- Denominador: total de tickets del supervisor dentro del mes seleccionado.
- El usuario que ejecutó la validación (`vobo_por_id`) no cambia a quién se atribuye la métrica.
- Se incluyen supervisores oficiales aunque tengan 0 tickets en el periodo.
- Al pulsar una barra se abre el listado de tickets correspondiente al supervisor.

## Archivos modificados

- `index.html`
- `modules/dashboard-operativo/dashboard-operativo.html`
- `modules/dashboard-operativo/dashboard-operativo.js`

## Dependencia existente verificada

No se modificó backend. La versión base ya contiene y registra:

- `GET /api/usuarios/supervisores-mantenimiento`
- `backend/src/controllers/usuarios.controller.js`
- `backend/src/routes/usuarios.routes.js`
- Montaje en `backend/server.js` bajo `/api/usuarios`

## Validaciones realizadas

- `node --check modules/dashboard-operativo/dashboard-operativo.js`
- `node --check backend/src/controllers/usuarios.controller.js`
- `node --check backend/src/routes/usuarios.routes.js`
- `node --check backend/server.js`
- Verificación de IDs HTML y actualización de versiones de caché.

## Instalación

Copiar los archivos respetando exactamente sus rutas. Después realizar recarga forzada del navegador.
