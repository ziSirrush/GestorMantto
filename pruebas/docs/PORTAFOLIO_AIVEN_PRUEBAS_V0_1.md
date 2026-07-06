# Portafolio Aiven — Pruebas V0.1

## Objetivo
Integrar el modulo Portafolio en la misma estructura modular usada por Resumen del Dia y Equipos Criticos, sin modificar Home, estilos globales, Nori ni autenticacion.

## Archivos modificados/agregados

Frontend:
- `index.html`
- `core/router.js`
- `modules/portafolio/portafolio.html`
- `modules/portafolio/portafolio.css`
- `modules/portafolio/portafolio.js`

Backend:
- `backend/src/routes/data.routes.js`
- `backend/src/controllers/data.controller.js`

Documentacion:
- `docs/PORTAFOLIO_AIVEN_PRUEBAS_V0_1.md`

## Endpoints agregados
- `GET /api/portafolio/filtros`
- `GET /api/portafolio/dashboard`
- `GET /api/portafolio/equipos`
- `GET /api/portafolio/equipos/:codigo`

## Reglas aplicadas
- Aiven MySQL es la fuente oficial.
- El backend calcula KPIs, filtros y consultas pesadas.
- El frontend solo presenta informacion.
- El modulo usa prefijo `pf-` y namespace `ManttoPortafolio` para evitar conflicto con modulos existentes.
- Se conserva la estructura modular: HTML, CSS y JS separados.

## Validaciones hechas
- `node -c backend/src/controllers/data.controller.js`
- `node -c backend/src/routes/data.routes.js`
- `node -c pruebas/core/router.js`
- `node -c pruebas/modules/portafolio/portafolio.js`
- Comparacion de archivos no tocados: `styles/base.css`, `styles/home.css`, `modules/home/home.js`, `modules/resumen-dia/resumen-dia.js`, `modules/equipos-criticos/equipos-criticos.js` quedaron sin cambios.

## Pendientes de prueba manual
1. Levantar backend en puerto 3001.
2. Abrir frontend de pruebas.
3. Entrar a Portafolio desde el panel lateral.
4. Confirmar carga de filtros, KPIs, parados y detalle de equipos.
5. Validar rendimiento con datos reales.
