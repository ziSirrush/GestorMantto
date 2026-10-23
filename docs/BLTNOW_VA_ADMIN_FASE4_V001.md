# BLT NOW | Cobranza UNITED > Administración > Venta Adicional | Fase 4 V001

**Base comprobada:** repositorio `ziSirrush/GestorMantto`, rama `main`, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3, 23/oct/2026). **Requiere** las fases 1, 2 y 3 de Venta Adicional instaladas localmente. Este paquete es **incremental**: contiene archivos completos modificados/nuevos, no copias de todas las fases anteriores.

## Entregado

- Motor puro de **ocho fórmulas locales**, ejecutadas en backend sobre resultados de `SELECT` de la tabla `pc`: `mes_ov`, `pagado_iva`, `no_pagado_iva`, `venta_total`, `mes_factura`, `fecha_vencimiento`, `dias_vencimiento`, `estatus`.
- IVA de 16 % con redondeo exacto a centavos mediante enteros `BigInt`; `RECIBO` sin IVA; `pagado_iva` solo si W es `pagado por completo` y `no_pagado_iva` solo si W es `Abierta`, ambas con ceros según fórmulas originales.
- Fechas civiles `YYYY-MM-DD`, meses abreviados `ene` ... `dic`, plazos enteros de 0 a 3650 días. `terminos=0` significa vencimiento en la misma fecha de factura. Factura `NULL` produce vencimiento `NULL`, nunca `1899-12-30`.
- Días vencidos y `VENCIDO`/`CORRIENTE` calculados con la **fecha actual en `America/Mexico_City`**. Para estados administrativos distintos a `Abierta` los días vencidos son cero. La pantalla reconsulta automáticamente al cambiar de día (comprobación cada 60 s mientras esté visible).
- El endpoint GET administrativo existente mantiene `rows` como **datos originales de Aiven** y añade `formula_preview` con valores calculados para la página. El frontend destaca los ocho valores con la etiqueta **"Vista previa"** y conserva los originales en la descripción accesible. **No hay `UPDATE` de fórmulas**.
- Errores de datos (fechas no válidas, términos no reconocidos, importe ausente o excedido) generan alertas en la vista previa y nunca inventan una fecha ni un importe. No se modifica el contrato de los 31 campos ni el sistema de permisos/alcance.
- Caché de CSS/JS renovada a `20261023-va-f4-v001`; editor de F3, búsquedas, filtros, paginación y scroll de tabla conservados.

## Regla de los tres módulos: GAS NO SE DESACTIVA

**Instrucción expresa del usuario:** el activador automático de GAS permanece **ACTIVO hasta concluir las tres tablas GC, VA y MP** y obtener autorización del corte. Este paquete **no elimina ni deshabilita el activador** ni cambia scripts GAS, Azure, permisos, bases o flags.

El candado `PC_ADMIN_EDIT_ENABLED` sigue **apagado por defecto**. **No habilitarlo ahora**. El motor F4 calcula vistas temporales; no persiste derivados ni modifica el trabajo del activador GAS. Las seis columnas de dependencia externa `facturas_pendientes_pago`, `adeudo`, `terminos`, `zona_operativa`, `estado`, `estatus_cartera` se mantienen con su valor Aiven y serán abordadas en Fase 5 junto a la relación mixta y acumulados. Alta de nuevos registros, Fase 6. Nota: por ahora ordenar/filtrar derivados aplica sobre datos almacenados, no sobre la vista previa.

## Archivos completos incluidos

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas.js` (nuevo)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js` (actualizado)
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` (actualizado)
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css` (actualizado)
- `modules/cobranza-uni/administracion/main/main.js` (actualizado; F4 cache busting)
- `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js` (ajuste necesario al servicio F4)
- `tests/cobranza-uni-administracion-venta-adicional-fase4.test.js` (nuevo)
- `docs/BLTNOW_VA_ADMIN_FASE4_V001.md`

## Aplicación y validación local (PowerShell desde la raíz del repositorio)

1. Extraer este ZIP conservando las rutas del repositorio, **después de instalar F1-F3**. No debe sobreescribir cambios propios más recientes sin revisar previamente.
2. Ejecutar:

```powershell
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js
node --check modules/cobranza-uni/administracion/main/main.js
node --check modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js
node --test tests/cobranza-uni-administracion-*.test.js
git status --short
```

**Pruebas locales:** 98/98 correctas en espejo parcial de F1–F4, incluido nuevo motor y datos simulados. Chromium: vista de escritorio, tabla de 31 columnas en 390 px y controles de solo lectura, sin errores JS. **Limitaciones:** no son un CI completo del repositorio ni una prueba HTTP/Aiven real.

## Normas BLT NOW

Sin `*.sql`, `*.patch` ni instaladores. No se fuerza `.gitignore`. Sin cambios en Aiven, GAS, Azure o GitHub; sin commits, push, publicación ni despliegue. **Siguiente: Fase 5** (relaciones mixtas, BUSCARV Aiven y acumulados por proyecto), con activador GAS todavía activo.
