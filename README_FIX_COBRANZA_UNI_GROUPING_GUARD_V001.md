# FIX_COBRANZA_UNI_GROUPING_GUARD_V001

Fecha: 2026-08-26
Repositorio base: `ziSirrush/GestorMantto`
Rama revisada: `main`
Commit base verificado: `b423f5fca412817a6db16c574fed0439e60ee578`

## Causa confirmada

La BD actual tiene dos agrupaciones distintas:

- `COBRANZA` -> `Corellian SA de CV`
- `COBRANZA_UNI` -> `UNITED`

Las rutas humanas de Cobranza UNITED estaban configuradas con:

```js
domain: 'UNITED',
groupingCode: 'COBRANZA'
```

El Guard General detecta correctamente que la agrupacion `COBRANZA` pertenece a CORELLIAN y falla con `INFORMATION_GUARD_CONFIGURATION_ERROR`.

## Cambio aplicado

Se reemplazo exclusivamente:

```diff
- groupingCode: 'COBRANZA'
+ groupingCode: 'COBRANZA_UNI'
```

No se modificaron permisos, SQL, tablas, zonas, sincronizadores M2M ni el motor de alcance UNITED.

## Archivos modificados

- `backend/src/routes/cobranza-uni.routes.js`
  - Gestion de Credito.
  - Venta Adicional.
- `backend/src/routes/detalle-mp-2026.routes.js`
  - Mantenimiento Preventivo.

## Validaciones realizadas

- Comparacion contra los archivos vigentes de `main`.
- `node --check` en ambos archivos: OK.
- Verificacion de que ambos Guards humanos conservan `domain: 'UNITED'` y ahora usan `groupingCode: 'COBRANZA_UNI'`.
- Los endpoints `/sync` permanecen M2M y sin cambios.

## Validacion runtime pendiente

Despues de desplegar backend, probar con un usuario UNITED que tenga permiso funcional y puerta `COBRANZA_UNI`:

1. Gestion de Credito debe cargar sin `INFORMATION_GUARD_CONFIGURATION_ERROR`.
2. Venta Adicional debe cargar sin el mismo error.
3. Mantenimiento Preventivo debe cargar sin el mismo error.
4. El alcance territorial debe seguir limitado por `usuario_zop`.

No se realizaron cambios directos en GitHub ni en la BD desde este paquete.
