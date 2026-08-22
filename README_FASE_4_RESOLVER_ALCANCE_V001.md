# FASE 4 - RESOLVER CENTRAL DE ALCANCE V001

## Prerrequisitos

Aplicar previamente:

1. `FASE_1_ALCANCE_GNRAL_V001`;
2. `FASE_2_ALCANCE_COR_V001`;
3. `FASE_3_ALCANCE_UNI_V001`.

Esta fase solo contiene archivos nuevos/modificados de Fase 4.

## Base verificada

Repositorio: `ziSirrush/GestorMantto`  
Rama: `main`  
Commit base revisado: `f03066618a6c329eab8669f2d61a0d5b546e9c4e`

Tambien se verifico la estructura SQL compartida de `perm_agrupaciones` y sus valores legacy para no inventar una migracion.

## Archivo nuevo

- `backend/src/services/alcance/alcance-resolver.service.js`
- `backend/scripts/test-alcance-resolver.js`

Documentacion:

- `ADR_RESOLVER_ALCANCE_V001.md`
- `README_FASE_4_RESOLVER_ALCANCE_V001.md`

## Contrato principal

`resolveAlcanceByGrouping_gnral(executor, source, groupingRef, options)`

`groupingRef` acepta:

- `id_agrupacion`;
- `codigo`;
- una fila previamente leida de `perm_agrupaciones` que contenga `empresa`.

El resolver devuelve el contexto del motor correspondiente y agrega el descriptor de agrupacion y el origen de la llave maestra.

## Seleccion de motor

- `GENERAL` o `BLT` -> `alcance_gnral`;
- `UNITED` / `United Elevadores` -> `alcance_uni`;
- `CORELLIAN` / `Corellian SA de CV` -> `alcance_cor`.

No existe fallback silencioso. Empresa desconocida = fail closed.

## Llave maestra

CORELLIAN/UNITED:

- reutiliza `DOMINIO_COMPLETO` activo del usuario efectivo;
- si existe, pasa `masterAccess: true` al motor correspondiente.

GENERAL:

- no crea ni presupone `DOMINIO_COMPLETO`;
- acepta `masterAccess: true` solo cuando una capa superior ya valido una llave administrativa existente.

## Lo que NO cambia todavia

- Guard actual;
- rutas/controladores;
- frontend;
- Panel de Control;
- SQL/Aiven;
- modulos en Nevera;
- M2M/Sync/Webhook;
- capa de informacion cruzada.

Por lo tanto esta Fase 4, por si sola, no cambia el comportamiento productivo de los modulos.

## Validaciones

Ejecutar desde `backend/` una vez aplicadas Fases 1-4:

```text
node --check src/services/alcance/alcance-resolver.service.js
node --check scripts/test-alcance-resolver.js
node scripts/test-alcance-resolver.js
```

Resultado esperado:

`ALCANCE_RESOLVER_V001: OK`
