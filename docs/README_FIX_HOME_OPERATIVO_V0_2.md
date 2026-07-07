# README_FIX_HOME_OPERATIVO_V0_2

Fecha: 2026-07-07
Proyecto: Mantto Gestor
Estado: Fix incremental sobre FIX.zip

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `pruebas/modules/home/home.js`
- `pruebas/modules/dashboard-operativo/dashboard-operativo.js`

## Fix Home

Se refuerza la regla de visibilidad por usuario autenticado:

- Tareas personales: solo visibles para su creador.
- Tareas colaborativas: visibles para el creador o responsable asignado.
- Notificaciones tipo tarea: solo visibles si apuntan a una tarea visible para el usuario.
- Interacciones/actividad reciente de tareas: solo muestran tareas visibles para el usuario.

El filtro queda aplicado en backend y reforzado de forma defensiva en frontend.

## Fix Dashboard Operativo

Se ajusta la confirmación mensual de servicio preventivo:

- Solo puede confirmar el Supervisor designado del equipo.
- Un Director solo podrá confirmar si trae un permiso activo desde Panel de Control.
- Se preparan llaves compatibles de permiso:
  - `dashboard_operativo_confirmar`
  - `confirmar_servicio_operativo`
  - `operativo_confirmar_servicio`
  - `director_confirmar_servicio`
  - `puede_confirmar_operativo`
- La confirmación sigue siendo mensual mediante llave `equipo__YYYY_MM`.
- El registro local guarda mes, usuario, fecha y rol lógico de confirmación.

## Nota técnica

La persistencia del Dashboard Operativo sigue usando el mecanismo local existente del módulo. Cuando Panel de Control y la tabla definitiva de cumplimiento mensual estén listos, esta lógica debe migrarse al backend para auditoría completa.
