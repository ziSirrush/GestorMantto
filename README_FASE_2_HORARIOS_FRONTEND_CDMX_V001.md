# FASE 2 — Horarios Frontend CDMX V001

**Proyecto:** Mantto Gestor  
**Fecha:** 14/09/2026  
**Tipo:** Fix incremental  
**Prerrequisito:** `FASE_1_HORARIOS_NUCLEO_TEMPORAL_V001` aplicada previamente.

## Objetivo

Cerrar la parte **frontend** del alcance temporal sin tocar la sincronización de Tickets ni adelantar la Fase 3 de backend.

Contrato aplicado:

- Los datos de fecha/hora provenientes del sistema de **Tickets** continúan respetándose como llegan.
- Una fecha civil `YYYY-MM-DD` se trata como **día literal** y no se convierte por zona horaria.
- Los relojes visibles, `hoy`, mes actual, año actual y fechas de generación de reportes/PDF del Gestor usan **`America/Mexico_City`**.
- Los timestamps absolutos (`Date.now()`, ISO con `Z`, expiraciones, cache, sesión y marcas técnicas) continúan siendo instantes absolutos; no se convierten en fechas civiles artificiales.
- Comentarios/acciones que ya fueron normalizados en Fase 1 conservan el contrato de **instante absoluto + presentación según zona del visor**.

## Qué cambia

### 1. Núcleo temporal frontend

`core/human-time.js` amplía el contrato de Fase 1 con:

- `mexicoCityDateOffset(days, value)`
- `mexicoCityMonthOffset(months, value, separator)`
- `formatMexicoCityDate(value, options)`

Esto permite calcular día/mes/año operativos de CDMX sin usar la zona del navegador ni `toISOString().slice(0,10)` como sustituto de “hoy”.

### 2. Reloj y contexto global

- Home/contexto diario muestra fecha y hora en CDMX.
- La frase del día sigue el día civil de CDMX.
- El motor PDF/CSV usa fecha de generación CDMX para encabezados y nombres de archivo.

### 3. Call Center y Dashboard Operativo

- Período inicial y “mes actual” parten del día CDMX.
- “Actualizado” usa CDMX.
- Meses móviles y año vigente ya no dependen de la zona del dispositivo.
- No se altera la lectura, comparación ni sincronización de las fechas originales de Tickets.

### 4. Equipos Críticos / Detalle / Portafolio operativo

- Año actual, U365, cortes y nombres de PDF toman CDMX.
- Fechas `DATE` se conservan literales.
- La fecha de generación de PDFs usa CDMX.

### 5. Ventas

Se ajustan Dashboard, Vendidos, Perdidos, Proyección, Cotizaciones, Detalle, Prospección, Mapa y Cliente para:

- año actual en CDMX;
- fecha de cierre sugerida (`hoy`) en CDMX;
- fecha de creación/nombre de PDFs en CDMX;
- preservar `YYYY-MM-DD` como día civil literal.

### 6. Instalaciones / Logística / Cobranza

- Proyectos, Reporte, Ajuste, Carpetas y PM&M muestran relojes/fecha de reporte en CDMX.
- Dashboard/Reporte de Logística usan año actual CDMX.
- Cobranza COR y Cobranza UNITED muestran sus marcas de actualización en CDMX.
- Las vistas Experimentales afectadas muestran `generated_at` en CDMX y el Dashboard Call Center experimental inicializa su mes con CDMX.

### 7. Cache bust

`index.html` y `core/module-loader.js` actualizan exclusivamente las referencias JS modificadas por esta fase a:

`20260914-horarios-f2-v001`

## Fuera de alcance — se conserva para Fase 3

Esta entrega **NO** modifica:

- `CURDATE()` / `NOW()` / `YEAR(CURDATE())` del backend;
- consultas SQL de negocio basadas en “hoy”;
- lógica backend U365/cortes que dependa de la sesión MySQL;
- proceso de sincronización de Tickets;
- filtros, comparaciones o escrituras del sync;
- estructura de Aiven;
- tablas, columnas, índices o migraciones.

## Archivos modificados

El ZIP contiene solo los archivos que difieren respecto de Fase 1, conservando la estructura del repositorio.

- `core/app.js`
- `core/daily-phrases.js`
- `core/details.js`
- `core/human-time.js`
- `core/module-loader.js`
- `core/pdf/pdf-engine.js`
- `index.html`
- `modules/callcenter/callcenter.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/dashboard-logistica/dashboard-logistica.js`
- `modules/dashboard-operativo/dashboard-operativo.js`
- `modules/equipos-criticos/equipos-criticos.js`
- `modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.js`
- `modules/experimental-dashboard-call-center/experimental-dashboard-call-center.js`
- `modules/experimental-resumen-dia/experimental-resumen-dia.js`
- `modules/instalaciones-ajuste/instalaciones-ajuste_cor.js`
- `modules/instalaciones-carpetas/instalaciones-carpetas_cor.js`
- `modules/instalaciones-pmm/instalaciones-pmm_cor.js`
- `modules/instalaciones-proyectos/instalaciones-proyectos.js`
- `modules/instalaciones-reporte/instalaciones-reporte_cor.js`
- `modules/proyectos/proyectos.js`
- `modules/reporte-logistica/reporte-logistica.js`
- `modules/ventas-clientes-detalle/ventas-clientes-detalle.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-dashboard/ventas-dashboard-pdf.js`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js`
- `modules/ventas-perdidos/ventas-perdidos.js`
- `modules/ventas-prospeccion/ventas-prospeccion.js`
- `modules/ventas-proyeccion/ventas-proyeccion.js`
- `modules/ventas-vendidos/ventas-vendidos.js`
- `tests/fase2_frontend_cdmx_contract.test.js`
- `tests/fase2_frontend_cdmx_core.test.js`

## Validaciones realizadas

1. `node --check` sobre los **33 archivos JS modificados**: **OK**.
2. `npm run check` en `backend/`: **OK** — estructura base validada.
3. Pruebas temporales acumuladas Fase 1 + Fase 2: **16/16 OK**.
   - Fase 1: 9 pruebas.
   - Fase 2: 7 pruebas nuevas.
4. Suite general `npm test` de Fase 2: **36/38**, exactamente el mismo resultado que la Fase 1 usada como baseline.
   - Fallo preexistente 1: `la campanita muestra la accion y consume la ruta masiva`.
   - Fallo preexistente 2: `cache bust de cierre apunta a los archivos frontend corregidos`.
   - Esta fase no agrega fallos nuevos a la suite general.
5. Verificación estática: no quedan en los módulos objetivo patrones `new Date().getFullYear()` ni `new Date().toISOString().slice(0,10)` usados para representar `hoy`.
6. Comparación Fase 1 → Fase 2: **0 archivos `backend/` modificados**.
7. No se ejecutaron escrituras en Aiven ni despliegues externos.

## Pruebas de borde incluidas

Se valida, entre otros casos:

- `2026-01-01T05:30:00Z` → CDMX = `31/12/2025 23:30`;
- año operativo = `2025`, no `2026`;
- desplazamientos de día/mes cruzando año;
- `2026-09-14` permanece `14/09/2026` aun cuando la zona del visor sea distinta;
- las fechas civiles de Ticket en `core/details.js` continúan sin reinterpretación horaria.

## Instalación

Aplicar **después de Fase 1**, copiando el contenido del ZIP sobre la raíz del repositorio y sobrescribiendo únicamente los archivos incluidos.

Después validar localmente y posteriormente seguir el flujo normal del proyecto:

`Local -> GitHub Pages -> Netlify`

El ZIP **no realiza** ninguno de esos despliegues.

## Sistemas modificados durante esta preparación

- GitHub: **NO**
- Aiven: **NO**
- Azure: **NO**
- GitHub Pages: **NO**
- Netlify: **NO**

La validación realizada es estática/local. **No se afirma validación E2E contra Aiven ni despliegue productivo.**
