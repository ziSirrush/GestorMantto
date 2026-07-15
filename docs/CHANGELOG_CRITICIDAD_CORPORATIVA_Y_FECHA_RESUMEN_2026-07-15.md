# Fix: criticidad corporativa y fecha de Resumen del Día

## Reglas aplicadas
- `💥` representa criticidad corporativa del año en curso: 3 o más tickets con `RESPONSABILIDAD = BLT` desde el 1 de enero hasta hoy.
- La regla es única para todos los usuarios y no depende del filtro dinámico del módulo.
- Se agregó la tabla `Equipos críticos · últimos 365 días`, con criterio de 3 o más RESP BLT en una ventana móvil diaria.
- El filtro dinámico existente permanece como herramienta operativa.

## Corrección Resumen del Día
- Se corrigió la normalización de fechas recibidas como objetos `Date` desde MySQL.
- Ya no se convierte una fecha local a UTC con `toISOString()`, evitando el desfase de un día.

## Archivos modificados
- `backend/src/controllers/criticos.controller.js`
- `backend/src/routes/data.routes.js`
- `core/estados-visuales.js`
- `core/details.js`
- `modules/equipos-criticos/equipos-criticos.html`
- `modules/equipos-criticos/equipos-criticos.js`
- `modules/resumen-dia/resumen-dia.js`
- `modules/callcenter/callcenter.js`
- `modules/dashboard-operativo/dashboard-operativo.js`
- `modules/portafolio/portafolio.js`
- `modules/proyectos/proyectos.js`
