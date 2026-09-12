# FIX FASE 4 — Cobranza COR · Aditivas · Detalle V001

Fecha: 12/09/2026

## Objetivo

Sustituir la ventana emergente de detalle de Aditivas por una vista interna real de Mantto Gestor, conservando el contrato funcional de `FASE_3_COBRANZA_COR_ADITIVAS_BACKEND_V001`.

## Base verificada

Este FIX fue construido sobre `main` actual después de aplicar el FIX de consumo del backend:

- `modules/cobranza-cor/cobranza-cor-aditivas.js` blob base: `98939f2999b584b727ed8267ee49e34eca20fe12`.
- `modules/cobranza-cor/cobranza-cor-aditivas.css` blob base: `11b1dc5769878357dfef7f9dbef2cecd4352ad43`.
- `core/module-loader.js` blob base: `e9b1c02de7a0244b5d82a0a4a587bc2800423c2f`.

## Archivos modificados

- `core/module-loader.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.css`

No modifica backend, SQL, tablas, permisos, `index.html` ni `core/router.js`.

`core/module-loader.js` registra también la ruta existente `cobranza-estados-cuenta` usando los archivos ya presentes en `main`; no modifica esos archivos. Esto permite que el botón `Ver Estado de Cuenta` pueda cargar el módulo antes de invocar su `init()`.

## Comportamiento

- Clic o Enter/Espacio sobre una Aditiva navega a la misma ruta `cobranza-aditivas` con payload `{ id }`.
- El hash queda en forma `#/cobranza-aditivas/<id>`, usando la navegación existente del Gestor.
- La vista de detalle consulta exclusivamente `GET /api/cobranza-cor/aditivas/:idAditivaCor`.
- No usa modal ni overlay.
- `← Regresar a Aditivas` usa el historial interno del Gestor cuando proviene del listado; en acceso directo vuelve al listado sin crear historial artificial.
- Si existe `vinculo_indice`, se muestra el proyecto relacionado y el botón `Ver Estado de Cuenta`.
- `Ver Estado de Cuenta` navega a `cobranza-estados-cuenta` con el `id_indice_cor`, espera la carga lazy del módulo existente y ejecuta su `init()`; no mezcla importes de Aditivas con Suministro/Instalación.
- Si no existe vínculo estructurado, se muestra `Sin vínculo a INDICE` y no se intenta inferir una relación por texto.
- El detalle es de solo lectura; no agrega acciones de edición que el backend no soporte.

## Campos mostrados

Se usan únicamente campos que ya devuelve el backend de Aditivas: identificación, proyecto/trabajo, OV/OC/factura, importes, utilidad, cobranza, fechas/semana de pago, moneda, gasto ejercido y referencia `indice`.

## Validación

- Validación sintáctica de JS con `node --check`.
- Verificación de ausencia de clases/funciones de modal en el JS final.
- Verificación de navegación por payload `id`.
- Verificación del endpoint de detalle.
- Verificación del vínculo a `cobranza-estados-cuenta`.
- Balance de llaves CSS.

## No ejecutado

- No se hizo deploy.
- No se escribieron cambios en GitHub/Aiven/Azure/Netlify.
- No se realizó prueba E2E contra Azure ni navegador autenticado.

## Rollback

Restaurar los tres archivos anteriores desde Git. No requiere rollback de base de datos.
