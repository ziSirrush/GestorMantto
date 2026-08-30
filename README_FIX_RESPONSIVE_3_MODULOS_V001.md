# FIX_RESPONSIVE_3_MODULOS_V001

## Objetivo
Corregir los tres módulos confirmados que todavía no respetan el contrato responsive del Gestor Mantto:

1. Ventas · Prospección
2. Ventas · Proyección
3. Logística · Dashboard

## Regla de diseño aplicada
La interfaz general debe permanecer dentro del ancho disponible de la `view`.

Pueden reacomodarse:
- encabezados;
- botones y acciones;
- filtros;
- KPI;
- formularios;
- grids/cards;
- modales.

Las tablas NO se comprimen para forzarlas a caber. Pueden conservar un ancho mayor que la pantalla, pero el desplazamiento horizontal ocurre únicamente dentro de su wrapper local (`*-table-wrap`).

No se usa `zoom` ni `transform:scale()` para hacer caber módulos.

## Cambios

### Ventas · Prospección
Archivo: `modules/ventas-prospeccion/ventas-prospeccion.css`

- Mantiene `.vpr-table` con ancho mínimo de 860 px.
- `.vpr-table-wrap` administra `overflow-x:auto`.
- Encabezado y acciones permiten wrap.
- En <=760 px, acciones se reorganizan en dos columnas y después una columna en <=520 px.
- Filtros pasan a una sola columna en pantallas estrechas.
- Inputs/selects no pueden empujar el ancho de la `view`.
- Reglas nuevas están ancladas a `#view-ventas-prospeccion` para protegerlas de Proyección.

### Ventas · Proyección
Archivo: `modules/ventas-proyeccion/ventas-proyeccion.css`

- Elimina de manera efectiva para esta `view` el comportamiento encajonado por `max-width:1550px` mediante una regla específica de mayor prioridad.
- KPI y resumen pasan a grids fluidos.
- Toolbar usa columnas adaptables y cae a una columna en <=760 px.
- Encabezado, stage tools y acciones permiten wrap.
- Historial/modal queda acotado al viewport.
- `.vpr-table` conserva mínimo 720 px y se desplaza dentro de `.vpr-table-wrap`.
- Reglas nuevas están ancladas a `#view-ventas-proyeccion`, evitando que el namespace histórico compartido `.vpr-*` dependa del orden de carga para el layout responsive.

### Logística · Dashboard
Archivo: `modules/dashboard-logistica/dashboard-logistica.css`

- Encabezado y acciones permiten wrap.
- A <=820 px, encabezado pasa a disposición vertical.
- A <=560 px, acciones pasan a una columna.
- `dl-two` pasa de 2 a 1 columna donde corresponde.
- `dl-fields` usa `minmax(0,1fr)`, evitando que `minmax(180px,1fr)` ensanche el viewport.
- Modal y panel se acotan al viewport.
- `.dl-table` conserva mínimo 720 px y se desplaza dentro de `.dl-table-wrap`.

### Cache-bust
Archivo: `core/module-loader.js`

Solo se modificaron las versiones CSS de estos tres módulos a:

`20260830-responsive-v002`

El test normaliza esas tres cadenas y confirma que el blob resultante es exactamente el `module-loader.js` original de `main` (`308dd276...`).

## Archivos modificados completos

- `modules/ventas-prospeccion/ventas-prospeccion.css`
- `modules/ventas-proyeccion/ventas-proyeccion.css`
- `modules/dashboard-logistica/dashboard-logistica.css`
- `core/module-loader.js`

Los CSS preservan byte a byte el contenido original previo al marcador del fix. Los tests recalculan el Git blob SHA de esa parte y lo comparan con `main`.

## Base verificada
`ziSirrush/GestorMantto` · `main`

Commit: `b0d526b10e82eaca6d694eb8fb579ecc5cbda784`

## Base de datos / backend
- SQL: NO
- Aiven: NO
- Backend: NO
- Permisos/alcance: NO
- Datos: NO

## Validación incluida
Ejecutar:

```powershell
node .\tests\fix_responsive_3_modulos.test.js
node --check .\core\module-loader.js
```

La validación incluida es estática/contractual. No sustituye prueba visual real en navegador después de integrar el fix.

## Rollback
Restaurar los cuatro archivos listados desde el commit baseline indicado en `SOURCE_BASELINE.txt`.
