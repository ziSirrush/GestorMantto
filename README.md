# FASE 3 - COBRANZA COR - ADITIVAS BACKEND V001

Base verificada: `ziSirrush/GestorMantto` / `main` / commit `ffb0a2db7822bb7e25eacb654c5a358f78e1744d` (`Version 091126.22 - Edo Cta`).

## Objetivo

Activar el backend funcional de `Cobranza > Aditivas` usando exclusivamente las estructuras COR existentes en Aiven.

Esta entrega cubre el backend de lectura necesario para construir el MAIN de Aditivas y abrir el detalle de una aditiva. No agrega frontend ni modifica la carga GAS.

## Fuente oficial

Tabla funcional:

- `cobranza_aditivas_cor`

Relacion de alcance:

- `cobranza_aditivas_cor.id_indice_cor -> cobranza_indice_cor.id_indice_cor`

No se crean tablas, columnas ni relaciones nuevas.

## Endpoints

### MAIN

`GET /api/cobranza-cor/aditivas`

Filtros soportados:

- `q` / `buscar`: proyecto, PP NS, COT, OV, factura, equipo o descripcion.
- `anio`
- `departamento`
- `categoria`
- `firma_cot`
- `estatus_trabajos`
- `estatus_cobranza`
- `sup`
- `moneda`
- `solo_pendientes=1|0`
- `page` / `pagina`
- `page_size` / `pageSize` / `tamano` (maximo 100; default 50)

Respuesta funcional:

- paginacion;
- resumen de registros;
- vinculadas / sin vinculo INDICE;
- cantidad con pendiente;
- importes separados por moneda;
- conteo por estatus de cobranza;
- conteo por estatus de trabajos;
- conteo por estatus de firma;
- catalogos para filtros;
- renglones de Aditivas.

Los importes NO se mezclan entre monedas. Cada moneda conserva su propio subtotal, IVA, total, gasto, diferencia, pagado y pendiente.

### DETALLE

`GET /api/cobranza-cor/aditivas/:idAditivaCor`

Devuelve todos los campos funcionales disponibles en `cobranza_aditivas_cor`, junto con la referencia al registro de INDICE cuando `id_indice_cor` existe.

## Alcance / Guard

Se usa el permiso existente:

`COBRANZA_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

Dominio:

`CORELLIAN`

Agrupacion:

`COBRANZA`

Regla fail-closed:

- llave maestra / dominio completo: puede consultar todas las aditivas activas;
- alcance limitado: una aditiva solo es visible si tiene `id_indice_cor` y el INDICE relacionado esta dentro de los `usuarios_visibles` resueltos por el Guard mediante ADM / SUP / VEND;
- una aditiva sin `id_indice_cor` NO intenta adivinar relacion por `sup`, PP, nombre, iniciales ni similitud para conceder visibilidad.

Esto es intencional: las relaciones incorrectas deben corregirse en el dato de origen/Aiven, no compensarse con heuristicas de seguridad.

## Campos de origen

La lectura conserva los campos existentes, entre ellos:

`anio_cot`, `departamento`, `categoria`, `fecha_cot`, `firma_cot`, `no_cot`, `ov`, `factura`, `estatus_trabajos`, `estatus_cobranza`, `sup`, `pp_ns`, `proyecto`, `equipo`, `descripcion`, `comentario_fuente`, `monto_subtotal`, `iva_pct`, `monto_iva`, `monto_total`, `gasto_subtotal`, `oc`, `diferencia`, `utilidad_real_pct`, `monto_pagado`, `pagado_sin_iva`, `pendiente_pago`, `fecha_pago`, `semana_pago`, `moneda`, `gasto_ejercido`.

`gasto_ejercido` se conserva como texto porque asi esta definido actualmente en la tabla COR; esta fase no intenta reinterpretarlo ni convertirlo.

## Lo que NO hace esta fase

- No crea ni edita aditivas manualmente.
- No corrige automaticamente relaciones `id_indice_cor` faltantes.
- No usa `sup` como permiso o relacion de usuario.
- No implementa frontend.
- No implementa escritura de comentarios/archivos.
- No toca Estados de Cuenta ni su match FUENTE por PP/nombre.
- No cambia la carga de INDICE/FUENTE/ADITIVAS.
- No requiere SQL adicional.

## Archivos modificados completos

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`

## Validaciones ejecutadas

- `node --check` repository -> OK
- `node --check` service -> OK
- `node --check` controller -> OK
- `node --check` routes -> OK
- prueba local con conexion mock: listado + resumen + detalle -> OK
- ruta Aditivas deja de usar `requireAuth` simple y usa el Guard General de CORELLIAN/COBRANZA -> OK
- no se agregan tablas, columnas, FK ni scripts SQL -> OK

## Diagnostico de referencia del dump proporcionado

Snapshot usado solo para validar forma de datos, no como fuente operacional:

- 675 aditivas;
- 665 MXN;
- 10 USD;
- 343 registros con `pendiente_pago > 0`;
- 39 registros con `id_indice_cor` en ese snapshot.

Estos numeros NO se codifican en el backend. El endpoint calcula sus resultados desde Aiven en ejecucion.

## Prueba recomendada despues del deploy

1. Probar usuario con dominio completo:
   `GET /api/cobranza-cor/aditivas?page=1&page_size=50`
2. Confirmar `resumen.por_moneda` separado por MXN/USD/otras monedas existentes.
3. Probar filtros `estatus_cobranza`, `departamento`, `categoria` y `solo_pendientes=1`.
4. Abrir un registro:
   `GET /api/cobranza-cor/aditivas/{id_aditiva_cor}`
5. Probar usuario con alcance limitado y confirmar que solo recibe aditivas vinculadas a INDICE dentro de su alcance.
6. Si una aditiva esperada no aparece para alcance limitado, revisar/corregir `id_indice_cor`; el backend no intentara inferirla.
