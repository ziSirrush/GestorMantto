# FIX_DASHBOARD_LOGISTICA_ORDEN_PPNS_FINAL_V001

Fecha: 2026-09-23
Módulo: Logística → Dashboard

## Objetivo

Mover **Proyectos sin PP NS** al cierre visual del Dashboard, de modo que sea la última sección visible.

## Orden resultante en la parte inferior

1. Promedio de tránsito según modo.
2. Movimientos semanales, con selector de cortes históricos.
3. **Proyectos sin PP NS** como última sección visible.

El modal de detalle permanece después en el HTML, pero está oculto y no forma parte del recorrido visual normal.

## Cambios

- `modules/dashboard-logistica/dashboard-logistica.js`
  - `Movimientos semanales` pasa a una tarjeta independiente de ancho completo.
  - `Proyectos sin PP NS` pasa a una tarjeta independiente al final.
  - No cambia la lógica de carga, conteo ni detalle de PP NS.
  - No cambia el selector de cortes históricos.
  - No cambia el filtro de periodo de promedios.
  - No cambia el ring ni el desglose mensual de contenedores.

- `core/module-loader.js`
  - Cache-bust del Dashboard Logística actualizado a `20260923-dashboard-ppns-final-v001`.

## No modifica

- Backend.
- SQL / Aiven.
- Endpoints.
- Google Apps Script.
- Ring de contenedores.
- Promedios por año.
- Cortes semanales históricos.

## Validación ejecutada

```text
node --check modules/dashboard-logistica/dashboard-logistica.js  OK
node --check core/module-loader.js                              OK
node --check tests/logistica_dashboard_orden_ppns_final.test.js OK
node tests/logistica_dashboard_orden_ppns_final.test.js         OK
```

El test específico comprueba además que se conservan el selector de cortes, el selector estándar de periodo y las dos tablas mensuales del ring.

## Aplicación

Sobrescribir los archivos del ZIP respetando las rutas del repositorio y publicar siguiendo el flujo normal del proyecto.

No se realizó ningún despliegue remoto durante la generación de este FIX.
