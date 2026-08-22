# FIX Reporte de Instalaciones - PDF Logica Desarrollo V009

## Base
- ZIP fuente: `Revisar logica del PDF.zip`.
- Referencia funcional: `module_proyectos_Desarrollo.html`, seccion Proyectos > Reporte de Instalaciones > Generar PDF.

## Cambio
Se reemplaza la reimplementacion PDF previa del Gestor por la logica de impresion de Desarrollo, adaptada a los datos actuales del modulo.

Se trasladan al PDF del Gestor:
- cabecera `BLT BRILLIANT / REPORTE GENERAL DE INSTALACIONES / fecha`;
- grafica `Resumen de equipos por seccion` con el mismo calculo de ancho y posicion del valor;
- una seccion/tablas por estatus 01-SUS a 08-T;
- orden alfabetico A-Z por Proyecto;
- columnas especificas de cada estatus;
- columna NOTIF solo en 02-OC a 08-T, usando los Estados Visuales ya calculados por el backend/catalogo actual;
- leyendas de alertas del Desarrollo;
- `colgroup` y anchos del Desarrollo: fecha 88 px, comentario 2.5x fecha, icono 82 px, porcentaje 56 px, Proyecto 90-220 px, Referencia 70-160 px, texto 95 px;
- salto de pagina por bloque/seccion;
- flujo de `window.print()` con espera de 50 ms;
- aislamiento de impresion para impedir que CSS de otros modulos deje el PDF invisible.

## Adaptaciones obligatorias al Gestor actual
- Los datos siguen viniendo del backend/Aiven actual; no se reintroducen arrays legacy.
- Se recuperan todos los registros filtrados antes de imprimir, aunque la vista tenga paginacion.
- El selector de ano actual se conserva: solo 08-T se limita a `anio_termino` seleccionado.
- 01-SUS a 07-PE conservan la poblacion operativa actual del reporte.
- Los Estados Visuales no se recalculan en el frontend; el PDF consume los codigos/emoji del catalogo central actual.

## Archivos modificados
- `index.html` - solo cache-busting de JS/CSS del modulo.
- `modules/instalaciones-reporte/instalaciones-reporte_cor.js`
- `modules/instalaciones-reporte/instalaciones-reporte_cor.css`

## No se modifica
- Backend.
- SQL / esquema.
- Permisos.
- Logica de datos 08-T.
- Vista normal, filtros, tablas y paginacion del reporte fuera del flujo PDF.

## Validaciones
- `node --check instalaciones-reporte_cor.js`: OK.
- Llaves CSS balanceadas: OK.
- 8 secciones presentes: OK.
- Grafica, orden por proyecto y colgroup heredados: OK.
- `window.print()` con espera 50 ms: OK.
- Reglas de salto de pagina heredadas: OK.
- Eliminada la implementacion PDF previa (KPI/meta/print-stage propios): OK.
- CSS de impresion hace visible explicitamente `#ir-cor-print-host`: OK.
