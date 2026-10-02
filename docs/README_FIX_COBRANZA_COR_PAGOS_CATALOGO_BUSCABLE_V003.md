# FIX COBRANZA COR · PAGOS · CATALOGO BUSCABLE V003

**Fecha:** 2026-10-02  
**Proyecto:** Mantto Gestor  
**Modulo:** Cobranza CORELLIAN > Pagos  
**Base GitHub verificada:** `8addea56c10a85f417e9aab2f941e6412c1077af`

## Objetivo

Permitir escribir dentro del selector de proyecto para acotar un catalogo grande.

El cambio aplica en:

- asignacion individual desde cada fila;
- asignacion masiva.

El usuario puede escribir parte del **PPNS, Proyecto o Cliente** y el navegador acota las opciones del mismo catalogo agrupado de Fuente.

## Regla conservada

El catalogo sigue viniendo de la agrupacion ya aprobada de `cobranza_fuente_cor`, agrupada por `id_proyecto_origen / PPNS`.

Este FIX no vuelve a introducir `limit` y no modifica backend, tablas, permisos ni relaciones existentes.

## Validacion al guardar

Solo puede guardarse un proyecto que exista en el catalogo. Si el texto escrito no corresponde a una opcion valida, la asignacion se detiene y se muestra un mensaje.

## Archivos modificados

```text
core/module-loader.js
modules/cobranza-cor/cobranza-cor-pagos.js
modules/cobranza-cor/cobranza-cor-pagos.css
```

El `module-loader.js` solo cambia el identificador de cache del JS/CSS de Pagos para garantizar que el navegador cargue esta version.

## Sin cambios de datos

No contiene:

- SQL;
- ALTER TABLE;
- tablas nuevas;
- migraciones;
- cambios backend;
- archivos `.patch`.
