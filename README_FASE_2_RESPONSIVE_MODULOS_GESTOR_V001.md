# FASE 2 — Responsive por módulos · Gestor Mantto · V001

Fecha: 2026-08-31

## Objetivo

Aplicar el contrato responsive de Fase 1 a los módulos que todavía podían deformar la aplicación. La regla funcional es:

- La interfaz general NO debe requerir pellizco/zoom para acomodarse.
- Encabezados, botones, filtros, KPIs, formularios y demás contenido no tabular deben permanecer dentro del viewport y reacomodarse.
- Las tablas SÍ pueden exceder el ancho visible, conservando su tamaño legible, pero el desplazamiento horizontal debe ocurrir dentro de su wrapper local.

## Hallazgo estructural importante

`modules/ventas-prospeccion/ventas-prospeccion.css` y `modules/ventas-proyeccion/ventas-proyeccion.css` utilizan históricamente el mismo namespace de clases `.vpr-*`.

El `core/module-loader.js` vigente carga CSS por ruta y lo conserva en el documento. Al navegar entre ambos módulos, las reglas de una ruta podían permanecer activas y modificar la otra.

Fase 2 añade aislamiento de CSS lazy: únicamente permanecen habilitadas las hojas lazy declaradas para la ruta actual. Los estilos globales cargados desde `index.html` no se deshabilitan.

## Cambios

### 1. Contrato responsive acumulativo

`styles/responsive-contract.css` contiene Fase 1 + Fase 2.

Se refuerza:

- wrappers raíz `*-page` a 100% del ancho disponible;
- `min-width:0` para evitar que hijos flex/grid empujen el shell;
- encabezados principales y grupos de acciones reacomodables;
- toolbars/filtros contenidos;
- wrappers de tablas dentro del ancho de la vista;
- no se modifica el `min-width` propio de las tablas;
- no se usa `zoom` ni `transform:scale()`.

### 2. Prospección

Se corrige de forma explícita el caso reportado:

- página a ancho completo;
- acciones del encabezado pueden envolver;
- en móvil las acciones pasan a una columna;
- filtros pasan a una columna en móvil;
- búsqueda/inputs/selects no pueden forzar el viewport;
- la tabla conserva scroll horizontal propio.

### 3. Proyección

Se protege de la colisión `.vpr-*` mediante aislamiento de estilos y reglas scoped a `#view-ventas-proyeccion`.

### 4. Wrappers con max-width confirmados

El contrato neutraliza los `max-width` de wrapper de escritorio confirmados en:

- `modules/proyectos/proyectos.css` (`.proy-page`);
- `modules/ventas-cotizaciones/ventas-cotizaciones.css` (`.vc-page`);
- `modules/ventas-vendidos/ventas-vendidos.css` (`.vv-page`);
- `modules/ventas-perdidos/ventas-perdidos.css` (`.vp-page`);
- `modules/ventas-proyeccion/ventas-proyeccion.css` (`.vpr-page`);
- `modules/ventas-proyectos-interes/ventas-proyectos-interes.css` (`.vpi-page`).

Las tablas internas NO se encogen ni pierden sus `min-width` originales.

### 5. Module loader

`APLICAR_FASE_2_RESPONSIVE_MODULOS.ps1` inserta el bloque de `patches/module-loader-style-isolation.js` dentro de `core/module-loader.js`.

El aislamiento solo administra `link[data-mantto-lazy="1"]`, por lo que no toca:

- `styles/base.css`;
- `styles/home.css`;
- `styles/responsive-contract.css`;
- estilos estáticos del shell.

## Aplicación

Prerequisito recomendado: Fase 1 Responsive Global integrada.

Desde la raíz local del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\APLICAR_FASE_2_RESPONSIVE_MODULOS.ps1 -RepoPath .
```

El script:

1. reemplaza `styles/responsive-contract.css` por la versión acumulativa F1+F2;
2. actualiza su cache-bust en `index.html`;
3. inserta el aislamiento CSS en `core/module-loader.js`;
4. actualiza el cache-bust de `core/module-loader.js`.

## No incluido

- No SQL.
- No backend.
- No Aiven.
- No cambios de permisos/alcance.
- No deploy.
- No commit/push.

## Validación

Se valida estáticamente el contrato responsive y la sintaxis del snippet del loader. La Fase 3 debe realizar la auditoría visual/E2E por resoluciones y módulo.

No puedo confirmar el comportamiento visual real en producción hasta integrar esta fase y probarla en navegador/PWA.
