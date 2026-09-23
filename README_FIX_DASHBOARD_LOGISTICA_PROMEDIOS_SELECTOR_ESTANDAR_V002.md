# FIX_DASHBOARD_LOGISTICA_PROMEDIOS_SELECTOR_ESTANDAR_V002

## Objetivo

Corrección exclusivamente visual/UX del selector de periodo de los promedios del Dashboard de Logística.

El FIX anterior usaba `input type="search" + datalist`. Ese control deja el desplegable bajo el renderizado nativo del navegador y en el entorno probado aparecía como un menú oscuro ajeno al patrón visual del Gestor.

Este FIX reemplaza únicamente ese control por un `select` estándar, siguiendo el patrón de filtros ya usado en el proyecto (por ejemplo, `Ventas.Proyección`).

## Resultado

El bloque de periodo conserva:

- `Todos los años`.
- Los años realmente registrados, en orden descendente.
- El año actual seleccionado por defecto al entrar.
- El botón `Buscar`.
- El parámetro `anio_promedios` del backend.
- El texto inferior que identifica el periodo aplicado y el número de años registrados.

El control visible pasa de:

```text
[input + datalist del navegador] [Buscar]
```

a:

```text
[select estándar del Gestor ▼] [Buscar]
```

## Opciones

Ejemplo con los años actualmente disponibles:

```text
Todos los años
2026
2025
2024
```

No se codifican esos años de forma fija. Se siguen tomando de `promedios.anios_disponibles` entregado por `/api/logistica/dashboard`.

## Archivos modificados

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

## Cambios técnicos

### Frontend JS

- Elimina `#dl-average-year-search`.
- Elimina `#dl-average-year-options` / `datalist`.
- Agrega `#dl-average-year-select`.
- Mantiene el botón `#dl-average-year-apply`.
- La validación trabaja sobre el valor real del `select` (`all` o un año registrado).
- No cambia la consulta ni el contrato del backend.

### CSS

El selector usa el mismo patrón visual que los filtros del Gestor:

```text
height: 40px
border: 1px solid #cfdbea
border-radius: 9px
background: #fff
focus: #3f7ce0 + halo
```

También se fija `color-scheme: light` y fondo claro en las opciones para evitar el aspecto oscuro del `datalist` anterior cuando el navegador lo soporte.

### Cache bust

```text
20260923-dashboard-promedios-selector-v002
```

## Lo que NO cambia

- No modifica backend.
- No modifica Aiven.
- No modifica SQL.
- No modifica cálculo de promedios.
- No modifica el criterio `fecha_salida_real` para los promedios.
- No modifica el ring de contenedores ni sus 12 meses.
- No modifica los cortes semanales históricos.

## Base verificada

Se verificó `main` del repositorio `ziSirrush/GestorMantto` antes de generar este FIX.

Blob SHA base:

```text
modules/dashboard-logistica/dashboard-logistica.js  42b3b404d868d633a1c28d761ce70f21dab30592
modules/dashboard-logistica/dashboard-logistica.css a66b5007b3157cae8654dce6078fba2e0b4d49a7
core/module-loader.js                              8887a97024e27993efe713338cb373acd72d767c
```

El patrón visual fue contrastado con los filtros `select` existentes en `modules/ventas-proyeccion/ventas-proyeccion.html` y `ventas-proyeccion.css`.

## Prerrequisito

Este FIX es incremental sobre `FIX_DASHBOARD_LOGISTICA_PROMEDIOS_POR_ANIO_V001` (que ya está presente en la base verificada).

## Validación realizada

```text
node --check modules/dashboard-logistica/dashboard-logistica.js   OK
node --check core/module-loader.js                                OK
node --check tests/logistica_dashboard_promedios_selector_v002.test.js OK
node tests/logistica_dashboard_promedios_selector_v002.test.js   OK
```

El test confirma que:

- ya no existe `datalist`;
- existe el nuevo `select` estándar;
- se conserva `Todos los años`;
- los años se generan dinámicamente;
- se conserva el botón Buscar;
- se conserva `anio_promedios`;
- se conservan cortes históricos y tablas del ring;
- el cache-bust cambió a V002.

No se realizó despliegue en GitHub, Azure, Aiven ni Netlify.
