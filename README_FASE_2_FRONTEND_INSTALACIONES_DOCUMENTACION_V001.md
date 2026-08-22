# Fase 2 - Frontend Instalaciones > Documentación Pendiente V001

## Alcance
Frontend del módulo `instalaciones-documentacion`, consumiendo el backend de Fase 1 V002 ya aplicado.

## Archivos modificados
- `index.html`
- `core/router.js`

## Archivos nuevos
- `modules/instalaciones-documentacion/instalaciones-documentacion_cor.html`
- `modules/instalaciones-documentacion/instalaciones-documentacion_cor.css`
- `modules/instalaciones-documentacion/instalaciones-documentacion_cor.js`

## Funcionalidad
- Vista individual por supervisor.
- Supervisor sin permiso especial: nombre fijo y datos exclusivamente del supervisor resuelto por backend.
- Usuario con permiso `INSTALACIONES_DOCUMENTACION_FILTROS_SUPERVISOR.FILTRAR`: selector de supervisor.
- KPIs: equipos, documentos requeridos, generados, pendientes y porcentaje de cumplimiento.
- Gráfica de distribución de equipos por estatus.
- Barras de cumplimiento por estatus (`04-M`, `05-PA`, `06-A`, `07-PE`).
- Filtros server-side: búsqueda, EDO, estatus y documentación completa/pendiente.
- Tabla documental basada en la consulta compartida: SUP, EDO, ESTATUS, PROYECTO, REFERENCIA EN SITIO, CPVP, CCNR, CCR, CONDICIONES DE OBRA, CTI, REVISIÓN SUPERVISOR, EVALUACIÓN MONTAJE, MINUTA INTERFON y CERTIFICADO REGULADOR.
- Agrega REQ., GEN., PEND. y % para el seguimiento de progreso.
- Paginación server-side fija de 30 registros y controles mínimos de 30x30 px.
- Proyecto y Referencia en Sitio abren los detalles Corellian estandarizados cuando el permiso de detalle está activo.
- No se agregó una gráfica histórica mensual porque Fase 1 no expone una fuente histórica validada.

## Backend
No incluye cambios backend ni SQL. Requiere Fase 1 V002 ya aplicada:
- `GET /api/instalaciones/documentacion/bootstrap`

## Validaciones realizadas
- `node --check` correcto en `core/router.js`.
- `node --check` correcto en `instalaciones-documentacion_cor.js`.
- 40/40 IDs utilizados por JS están presentes en el HTML del módulo.
- Una sola referencia CSS, vista y script del módulo en `index.html`.
- Una sola función y una sola resolución de ruta para `instalaciones-documentacion` en `core/router.js`.
- Endpoint frontend coincide con la ruta backend de Fase 1 V002.
- No se incluyeron archivos backend, SQL ni módulos en Nevera.
