# BLT NOW - Venta Adicional (pc) - Fase 3 V001

**Base:** `ziSirrush/GestorMantto` main, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3, 23/oct/2026). **Prerequisitos:** Fase 1 y Fase 2 de Administracion/Venta Adicional instaladas y acceso desde panel lateral funcionando.

## Alcance funcional

- PATCH individual `.../administracion/tablas/pc/registros/:id` y PATCH multiple `.../administracion/tablas/pc/registros/edicion-multiple` (2 a 20 registros), exclusivamente para **8 campos seguros de origen**: `zona_adm`, `ov`, `concepto`, `no_factura`, `estatus_operativo`, `fecha_pago`, `refacturacion_sustitucion` y `comentarios_cobranza`.
- Otros 7 campos declarados editables en Fase 1 permanecen **temporalmente bloqueados**: `proyecto`, `cliente`, `fecha_ov`, `precio_venta`, `tipo_pago`, `fecha_factura`, `estatus_administrativo`. Modificarlos antes de F4/F5 dejaría formulas o relaciones inconsistentes. Los 14 derivados y los 2 campos protegidos siguen sin edicion humana.
- Cada cambio exige los permisos MAIN + `COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.VER` + `.EDITAR`, sesion efectiva, puerta UNITED, sin modo visor, alcance territorial validado por fila, bloqueo SQL `FOR UPDATE`, comparacion optimista `expected`, y auditoria en `usuario_interacciones` dentro de la **misma transaccion**. Si cualquier fila o auditoria falla, todo el lote hace ROLLBACK.
- La interfaz conserva tabla ancha, scroll y grupos, y usa una ventana lateral de edicion, no comprime la tabla. Los valores calculados siguen mostrandose desde la BD; F4/F5 implementaran recalc y relaciones.
- **Sin altas**, sin nueva tabla ni migracion, sin cambios en GAS, sin despliegue.

## Corte seguro del GAS / activacion

**Importante:** La escritura nueva esta DESACTIVADA por defecto: `PC_ADMIN_EDIT_ENABLED` ausente o diferente de `true/1/yes/on`. El backend tambien devuelve `can_edit:false` en ese estado. Esta proteccion evita que el activador GAS actual sobrescriba ediciones humanas. Solo tras **retirar y comprobar** el activador correspondiente a `pc` y con autorizacion explicita, establecer `PC_ADMIN_EDIT_ENABLED=true` en el entorno del backend. La Fase 3 NO elimina ni deshabilita activadores GAS ni activa la variable en Azure. No habilitar ediciones en produccion antes del corte.

## Archivos completos para superponer en la raiz del repositorio

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-validation.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-audit.js`
- `modules/cobranza-uni/administracion/main/main.js`
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js`
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css`
- `tests/cobranza-uni-administracion-venta-adicional-fase1.test.js` (ajusta afirmaciones historicas F1 al nuevo estado F3)
- `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js` (ajusta afirmaciones historicas F2 al nuevo estado F3)
- `tests/cobranza-uni-administracion-venta-adicional-fase3.test.js` (nuevo)
- `docs/BLTNOW_VA_ADMIN_FASE3_V001.md`

## Validacion local (PowerShell desde la raiz, no backend)

```powershell
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-validation.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-audit.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js
node --check modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js
node --test tests/cobranza-uni-administracion-*.test.js
git status --short
```

**QA local:** 81/81 pruebas de Administracion en copia parcial del repositorio + navegador Chromium con datos simulados (vista ancha, edicion individual/multiple, auditoria mock, 31 columnas, scroll movil, cierre y escape XSS). **No** equivale a una ejecucion de la CI completa ni a una escritura real en Aiven.

## Normas BLT NOW

Sin archivos `.sql`, `.patch`, instaladores ni forzado de `.gitignore`. No se ejecutaron cambios en Aiven, GAS, GitHub ni Azure. El ZIP solo contiene archivos completos. No se hicieron commits, push ni despliegues. Se conserva la logica original de GC y consultas legacy.
