# FASE 2 — Instalaciones · Detalle Proyecto · PVO y Producción · Frontend V001

Fecha: 25/09/2026  
Proyecto: Mantto Gestor  
Base GitHub `main`: `2539e83401afa97db9d23c15dfad7448e6edad5d` — `Version 092526.2`

## Objetivo

Integrar el bloque **PVO y Producción** dentro de **Instalaciones > Proyectos > Detalle de Proyecto**, entre Bitácora de Obra y Equipos del proyecto.

## Comportamiento entregado

- Una sola tabla de fechas con todos los registros logísticos relacionados al PPNS.
- Columnas: Fecha PVO, Visita, Cubos, Docs Fábrica y Pago Fábrica.
- Si existe un solo registro logístico, no se muestra selector.
- Si existen dos o más registros, el selector muestra `log_ops.proyecto` y usa `id_log_ops` como valor real.
- El selector modifica únicamente la documentación mostrada; no filtra ni reemplaza la tabla.
- Documentación CPVO / GM en modo de solo lectura.
- Un solo visor/modal reutilizable para todos los documentos.
- Sin cargar, reemplazar, eliminar ni botón de descarga desde este bloque.
- Responsive para escritorio, tablet y PWA/móvil.

## Prerrequisito

Aplicar previamente:

`FASE_1_INSTALACIONES_DETALLE_PVO_PRODUCCION_BACKEND_V001`

La Fase 2 consume:

`GET /api/logistica/produccion/proyecto/:idProyecto/resumen`

## Archivos modificados

- `core/details.js`
- `index.html`

Ambos son archivos completos de reemplazo y conservan los cambios existentes del `main` indicado.

## Validaciones realizadas

- `node --check core/details.js` — OK.
- `node --test tests/instalaciones_detalle_pvo_produccion_frontend_v001.test.js` — 10/10 pruebas OK.
- Base verificada contra GitHub antes de modificar:
  - `core/details.js`: blob `dc4b84b65feb24045c06bb0eb42341bb62efe175`
  - `index.html`: blob `11809ffd089d238982bf06eab91d08c7736385ee`

No se realizó prueba E2E en navegador ni despliegue.

## Sistemas modificados

Ninguno. Este ZIP solo prepara archivos para aplicar manualmente. No se modificó GitHub, Aiven, Azure ni Netlify.
