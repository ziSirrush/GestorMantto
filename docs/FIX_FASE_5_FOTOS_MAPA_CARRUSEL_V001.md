# FIX FASE 5 — FOTOS MAPA / CARRUSEL GLOBAL V001

Fecha: 17/08/2026
Repositorio: `ziSirrush/GestorMantto`
Alcance: Ventas / Fotos Mapa + componente global de fotografías de Proyecto.

## Objetivo

Corregir el comportamiento de **Ventas > Fotos Mapa** para que seleccionar un proyecto abra primero su carrete de fotografías y no navegue directamente al Detalle Proyecto.

Se reutiliza el carrusel global existente en `core/details.js`; no se crea un segundo carrusel.

## Comportamiento implementado

### Desde Fotos Mapa

Al seleccionar una tarjeta de proyecto se abre el carrusel global con estos cuatro controles/contextos:

1. **Foto Principal Actual** — indica cuál fotografía está configurada como principal.
2. **Seleccionar Foto Principal** — permite seleccionar la fotografía mostrada como principal cuando el usuario tiene el permiso existente.
3. **Agregar Foto** — conserva la carga existente y el máximo de 7 fotografías.
4. **Ir a Proyecto** — cierra el carrusel y abre el Detalle Proyecto correspondiente.

El clic principal de la tarjeta ya no abre directamente el proyecto.

### Desde Detalle Proyecto

El Proyecto continúa utilizando exactamente el mismo carrusel global.

- Muestra Foto Principal Actual.
- Permite Seleccionar Foto Principal según el permiso vigente.
- Permite Agregar Foto según el permiso vigente.
- **No muestra Ir a Proyecto**, porque el usuario ya se encuentra dentro del proyecto.

## Permisos conservados

No se ampliaron permisos:

- Seleccionar Foto Principal conserva la validación existente de **Programador**.
- Agregar Foto conserva la validación existente de **Programador o Director General**.
- Los controles permanecen visibles como referencia del carrusel, pero las acciones quedan deshabilitadas cuando el usuario no está autorizado.

## Sincronización local

Cuando desde Fotos Mapa se agrega una fotografía o se cambia la principal:

- la tarjeta del proyecto se actualiza en memoria;
- no se vuelve a descargar todo el catálogo de proyectos/fotografías;
- no se agregan `fetch` dentro de loops;
- no se agregan timers.

## Archivos modificados

- `core/details.js`
- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`
- `FIX_FASE_5_FOTOS_MAPA_CARRUSEL_V001.md`

## Archivos NO modificados

- Backend
- SQL / Aiven
- `index.html`
- Router
- Módulos `_uni`
- Lógica operativa de Detalle Proyecto fuera del componente de fotografías

## Base verificada

Antes de modificar se reconstruyeron y validaron contra los blobs actuales de `main`:

- `core/details.js`: `0d1ef09d5bc8a905695226808e2744fea983b31e`
- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`: `f9a7d25726e884d411484199a9820b854897329d`

## Validaciones realizadas

- `node --check core/details.js`: PASS
- `node --check modules/ventas-fotos-mapa/ventas-fotos-mapa.js`: PASS
- Pruebas estáticas Fase 5: **20/20 PASS**
- Fotos Mapa abre `ManttoDetails.openProjectPhotos`: PASS
- Tarjeta ya no llama directamente a `openProyecto`: PASS
- Carrusel global exportado y reutilizado: PASS
- Foto Principal Actual: PASS
- Seleccionar Foto Principal: PASS
- Agregar Foto: PASS
- Ir a Proyecto contextual: PASS
- Ir a Proyecto oculto en contexto Detalle Proyecto: PASS
- Permiso Programador para principal conservado: PASS
- Permiso Programador/Director General para agregar conservado: PASS
- Máximo de 7 fotografías conservado: PASS
- Endpoints existentes de fotografías conservados: PASS
- Sin timers adicionales: PASS
- Sin nuevas consultas por fotografía: PASS
- Sincronización local de cambios de foto en Fotos Mapa: PASS

## Nota de validación

Las validaciones anteriores son de código, sintaxis, integración y flujo estático. No se realizó deploy ni prueba E2E en navegador contra producción desde este entorno.
