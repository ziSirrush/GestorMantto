# FASE 1 — Ventas · Dashboard · Reacomodo V001

Fecha: 2026-08-30  
Proyecto: Mantto Gestor  
Base verificada: `main` de `ziSirrush/GestorMantto` consultado antes de preparar este entregable.

## Objetivo

Crear la base estructural del nuevo Dashboard de Ventas sin implementar todavía la lógica funcional específica reservada para Fases 2–6.

## Orden aplicado

1. Prospección
2. Redes
3. Cotizaciones
4. Clientes
5. Ventas
6. Perdidos
7. Logística
8. Activos
9. Pendientes asignados
10. Pendientes creados

Todas las tablas usan paginación de 30 registros por página.

## Cambios incluidos

### Frontend

- `Todos` queda seleccionado al abrir Dashboard Ventas.
- `Todos` representa exclusivamente los responsables comerciales dentro del Alcance de Información autorizado.
- Se separa `Activos` del filtro `Ventas`.
- Se separan `Pendientes asignados` y `Pendientes creados`.
- Las 10 secciones se renderizan en el orden oficial definido arriba.
- En consulta individual se oculta la columna redundante de propietario (`Asesor` / `Asignado a`) donde aplica; en `Todos` permanece visible.
- Cada tabla mantiene paginación independiente de 30 registros.
- Si un grupo de endpoints no está permitido para el usuario, el frontend puede conservar las secciones autorizadas que sí respondan, en vez de derribar todo el Dashboard.

### Backend

- Los endpoints de KPI, tablas comerciales y operación aceptan `usuario_id=todos`.
- `Todos` NO actúa como llave maestra.
- El backend reutiliza el resolver central `ventas-visibility.service.js` / Alcance CORELLIAN.
- Para alcance limitado se usan exclusivamente IDs visibles resueltos por el motor central.
- La lista de `Todos` se restringe a perfiles comerciales activos: Director de Ventas, Gerentes comerciales y Asesores comerciales de Ventas Corellian.
- Las consultas de Dashboard aceptan conjuntos de IDs autorizados para evitar ejecutar una consulta completa por cada responsable.
- Los resultados de tablas se filtran además por permiso funcional específico de cada tabla; disponer de un permiso de una tabla no habilita silenciosamente las demás.
- No se creó ninguna tabla, columna, índice ni relación nueva.

## Deliberadamente NO incluido en Fase 1

- KPI por año.
- Prospección: resaltado sin estatus, mapa, lightbox, flujo NUEVO → Cotizado → Cotización.
- Redes: lightbox e historial persistente de estatus.
- Cotizaciones: nueva lógica de fechas, alertas sin cliente y Proyecto de interés.
- Clientes: saneamiento de duplicados / sincronización idempotente.
- Ventas y Perdidos: reglas finales de KPI anual y columnas finales.
- Logística: secciones y columnas definitivas del Reporte de Logística.
- Activos: columnas finales `Proyecto | Cantidad de equipos | %OC | %M | %A | %General` y orden por avance general.
- Pruebas E2E contra Aiven/Azure/GitHub Pages/Netlify.

## Archivos modificados

- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-dashboard/ventas-dashboard.html`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`

No fue necesario modificar CSS ni esquema SQL en esta fase.

## Validaciones realizadas

### Validación estática — realizada

- `node --check` correcto para:
  - frontend `ventas-dashboard.js`
  - controller
  - service
  - repository
  - routes
- Verificación estática del orden exacto de las 10 secciones.
- Verificación estática de `TABLE_PAGE_SIZE = 30`.
- Prueba aislada con mocks del service:
  - `Todos` respeta `advisorIds` del alcance limitado.
  - usuario individual fuera de alcance responde de forma cerrada (`403`).
  - filtrado de tablas por permiso funcional conserva únicamente las tablas autorizadas.

### No ejecutado

- No se ejecutó contra Aiven productivo.
- No se ejecutó backend Azure.
- No se hizo prueba E2E con una sesión real.
- No se desplegó GitHub Pages.
- No se desplegó Netlify.

## Sistemas modificados

Ninguno. Este entregable solamente prepara archivos locales.

- GitHub: **sin modificar**
- Aiven: **sin modificar**
- Azure: **sin modificar**
- GitHub Pages: **sin modificar**
- Netlify: **sin modificar**

## Nota de caché para validación

`core/module-loader.js` no se modifica en esta fase para evitar tocar un archivo global únicamente por cache-busting. Al probar el reemplazo local o en GitHub Pages, realizar recarga forzada si el navegador conserva la versión anterior de `ventas-dashboard.js`.
