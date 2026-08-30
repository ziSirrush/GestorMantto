# FASE 6 — Ventas · Proyectos de interés + cierre de reorganización

Versión: `V001`  
Fecha: `2026-08-30`

## Alcance

Esta fase cierra el bloque funcional que quedó pendiente después de Fases 1–5: **Proyectos de interés**.

No modifica el orden 1–10 del Dashboard. `Proyectos de interés` queda como módulo propio de Ventas, inmediatamente después de **Proyección** en el panel lateral.

## Fuente de la marca personal

Se reutiliza la implementación de Fase 3 sobre la tabla existente `usuario_interacciones`:

- `modulo = ventas-cotizaciones`
- `entidad = cotizacion`
- eventos `PROYECTO_INTERES_ACTIVADO` / `PROYECTO_INTERES_DESACTIVADO`
- `id_usuario` = usuario autenticado
- `id_referencia` = ID de cotización

No se crea tabla, columna, trigger ni permiso nuevo.

La lista toma **el último evento por cotización** del usuario autenticado. Una activación antigua no reaparece si existe una desactivación posterior.

## Seguridad y alcance

Para aparecer en la lista deben cumplirse simultáneamente:

1. El último evento del usuario autenticado es `PROYECTO_INTERES_ACTIVADO`.
2. La cotización conserva `activo = 1`.
3. La cotización permanece dentro del alcance comercial resuelto por `ventas-visibility.service`.

Por lo tanto la pantalla no permite consultar proyectos marcados por otros usuarios ni utiliza el frontend como barrera de seguridad.

El acceso visual reutiliza `ventas_cotizaciones`; no se introduce una nueva llave de permisos porque la vista solo consulta cotizaciones ya autorizadas.

## Pantalla

Ruta frontend: `ventas-proyectos-interes`

Incluye:

- total de proyectos marcados;
- búsqueda por proyecto, cliente, estatus, asesor, ciudad, estado o ID;
- tabla de 30 registros por página;
- orden de marcado más reciente a más antiguo;
- columnas: Proyecto, Cliente, Estatus, Equipos, Fecha cotización, Marcado, Ciudad/Estado y Acción;
- apertura del detalle existente de Cotización;
- estado vacío explicando dónde se activa el check;
- recarga selectiva cuando cambia `proyecto_interes` en el detalle.

El módulo no muestra indicadores técnicos de Aiven al usuario.

## Backend

Nuevo endpoint:

`GET /api/ventas/cotizaciones/proyectos-interes`

Parámetros:

- `pagina` — mínimo 1;
- `tamano_pagina` — máximo 30;
- `buscar` — búsqueda opcional.

Se preservan:

- `GET /api/ventas/cotizaciones/:id/interes`
- `PUT /api/ventas/cotizaciones/:id/interes`

## Archivos

### Completos

- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.repository.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `core/module-loader.js`
- `modules/ventas-proyectos-interes/ventas-proyectos-interes.html`
- `modules/ventas-proyectos-interes/ventas-proyectos-interes.css`
- `modules/ventas-proyectos-interes/ventas-proyectos-interes.js`

### Integración Core

`core/router.js` e `index.html` no se incluyen como copias completas porque Fases 1–5 no los modificaron y deben conservar la versión vigente del repo. El archivo:

`APLICAR_FASE_6.ps1`

valida anclas exactas y agrega únicamente:

- nombre/ruta de `ventas-proyectos-interes` al router;
- función `showVentasProyectosInteres`;
- caso de navegación;
- botón lateral después de Proyección;
- contenedor `view-ventas-proyectos-interes`.

Los cambios están documentados también en `patches/CAMBIOS_CORE_FASE_6.md`.

## Aplicación recomendada

Aplicar después de **F1 → F2 → F3 → F4 → F5**.

Desde PowerShell, ubicado en la carpeta extraída de esta Fase 6:

```powershell
.\APLICAR_FASE_6.ps1 -RepoRoot "C:\RUTA\A\GestorMantto"
```

El script solo modifica los archivos locales del repo. **No ejecuta commit, push, deploy ni SQL.**

## Validaciones incluidas

- `node --check` para JS modificados/nuevos;
- contrato backend de usuario personal + último evento + alcance + cotización activa;
- ruta estática declarada antes de `/:id`;
- máximo 30 registros por página;
- registro del módulo en `module-loader`;
- navegación a detalle y recarga selectiva;
- contrato de integración Core;
- prueba de integridad del ZIP.

## Dependencias

Esta fase presupone que **Fase 3 ya fue aplicada**, porque utiliza la marca `Proyecto de interés` y los eventos personales introducidos en esa fase.
