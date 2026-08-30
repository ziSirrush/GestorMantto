# FASE 1 — Responsive Global Gestor V001

Fecha: 2026-08-31

## Objetivo

Establecer el contrato responsive global del Gestor sin corregir todavía cada módulo de manera individual.

Regla funcional acordada:

- Las **tablas sí pueden exceder el ancho visible** y desplazarse horizontalmente dentro de su propio contenedor.
- La **aplicación, la view y el contenido general no pueden ensancharse** ni obligar a pellizcar/alejar la pantalla.
- Botones, filtros, KPIs, formularios y encabezados deben permanecer dentro del viewport. Su reacomodo específico se realizará en Fase 2 cuando el CSS local de cada módulo lo requiera.
- No se usa `zoom` ni `transform: scale()` para hacer caber módulos.

## Cambios incluidos

### 1. Contrato global nuevo

Archivo nuevo:

`styles/responsive-contract.css`

Protege `html`, `body`, shell, `main-content` y `.view` para que permanezcan dentro del viewport. La `.view` no genera scroll horizontal global.

No contiene reglas que reduzcan o compriman las tablas.

### 2. Dashboard Ventas — PDF

Archivos completos:

- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.css`

El PDF vuelve a la barra de título, a la derecha. Los filtros vuelven a ser únicamente:

`Responsable comercial | Año comercial | Información visible`

En pantalla angosta las acciones del encabezado se acomodan sin salir del viewport.

Las tablas continúan usando `.vd-table-wrap { overflow-x:auto; }`.

### 3. Integración/cache

`APLICAR_FASE_1_RESPONSIVE_GLOBAL.ps1` realiza de forma idempotente y validada:

- copia de los archivos completos de esta fase;
- inserción de `styles/responsive-contract.css` en `index.html` después de `base.css`;
- cambio de `TEMPLATE_VERSION` en `modules/ventas-dashboard/ventas-dashboard.js`;
- cache-bust de Dashboard Ventas en `core/module-loader.js`.

El script se detiene si las anclas esperadas del `main` revisado ya no coinciden, para evitar un reemplazo silencioso sobre código divergente.

Ejemplo desde PowerShell, con el ZIP extraído fuera del repo:

```powershell
.\APLICAR_FASE_1_RESPONSIVE_GLOBAL.ps1 -RepoPath "C:\ruta\GestorMantto"
```

## Base revisada en GitHub main

- `index.html` SHA de blob: `47f12c4c736c643b3560fda91902b186b1d88499`
- `core/module-loader.js` SHA de blob: `308dd276695572b1a57f878e4b2cedbf01525f9c`
- `modules/ventas-dashboard/ventas-dashboard.html` SHA: `d1c0880d359b7f64949c65d418f5585ea47241ea`
- `modules/ventas-dashboard/ventas-dashboard.css` SHA: `622eebb44c53a555529398640526ebc57c958032`
- `modules/ventas-dashboard/ventas-dashboard.js` SHA: `da057f7c31f5656e11614172813e2300ef067726`

## Fuera de alcance de esta fase

No se modifican todavía los CSS locales de Prospección, Proyección, Proyectos u otros módulos que no se adapten correctamente. Esa auditoría/corrección módulo por módulo corresponde a **Fase 2**.

Tampoco se modifica:

- backend;
- Aiven;
- tablas o datos;
- permisos;
- lógica comercial;
- paginación;
- consultas;
- despliegues.

## SQL

**No hay SQL para esta fase.**

## Validación incluida

Ejecutar:

```powershell
node .\tests\fase1_responsive_contract.test.js
```

La validación comprueba el contrato global, ausencia de `zoom/scale`, posición del PDF en el encabezado, IDs HTML únicos, scroll horizontal local de las tablas y cache-bust de integración.
