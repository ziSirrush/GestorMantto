# BLT NOW | UNITED > Cobranza > Administración > Venta Adicional | Fase 5 V001

**Base comprobada:** `ziSirrush/GestorMantto` rama `main`, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3, 23-oct-2026). Paquete **incremental**: requiere instaladas localmente las fases **1 a 4** de VA. No sustituye sus archivos nuevos que no figuren en este ZIP.

## Alcance entregado

- BUSCARV mixto **solo lectura** `pc` ↔ `detalle_mp_2026`: primero `id_proyecto_cobranza` con identidad verificada; si el FK de la venta es `NULL`, nombre de proyecto inequívoco validado contra `proyectos_mantto`, `cobranza_proyectos` y Portafolio; únicamente `terminos` admite respaldo por cliente, si **todas** las condiciones de MP alcanzables coinciden. **Nunca** resolver identidades contradictorias por similitud de nombres.
- Se consultan `detalle_mp_2026.condiciones_pago` → `pc.terminos`; `z_oper` → `zona_operativa`; `estado` → `estado`; `estatus_cartera` → `estatus_cartera`. Identidad válida pero **sin MP** equivale a `Inactivo` para `estatus_cartera` (como el `SI.ERROR` de Sheets). Identidad inválida no obtiene `Inactivo` inferido.
- Acumulados por proyecto y fecha civil **actual de CDMX**: `facturas_pendientes_pago` cuenta registros `VENCIDO`; `adeudo` suma `venta_total` de `Abierta` + `VENCIDO`, incluyendo facturas del proyecto **fuera de la página** actual. Agrupa por identidad verificada y conserva precisión monetaria con enteros BigInt. `project_summary` deduplica proyectos **de la página mostrada**, no pretende ser un total global de Cobranza.
- Se recalculan virtualmente las ocho fórmulas F4 con los términos resueltos por MP cuando la búsqueda es válida. **`rows` conserva los 31 valores originales de Aiven**. Dos canales distintos: `formula_preview` (8 campos) y `relation_preview` (6 campos) con advertencias; ningún dato calculado se persiste.
- Falta de condiciones válidas para una factura abierta, identidad ambigua, valores MP contradictorios, importe fuera de rango o un lote superior a **20 000 filas relacionadas**: se impide presentar un subtotal parcial y se expone advertencia o falla la consulta; jamás se suple silenciosamente con un total incorrecto.
- Backend aplica el alcance autorizado **independientemente** a `pc` y `detalle_mp_2026`; usa el validador oficial de identidad y filtros SQL parametrizados. La ruta existente conserva los permisos MAIN + `VENTA_ADICIONAL.VER`. Ningún nuevo endpoint de escritura.
- Interfaz amplia, con scroll de 31 columnas, marcas de vista previa y resumen de proyectos únicos; no se alteran las opciones de Gestión de Crédito o Mantenimiento Preventivo.

## GAS y escritura: NO tocar

**Regla definitiva del usuario:** el activador GAS sigue **ACTIVO** hasta completar las **tres tablas GC, VA y MP** y autorizar expresamente el cambio. No se modifica, desconecta ni elimina GAS en esta fase. El `PATCH` de VA existente sigue condicionado a `PC_ADMIN_EDIT_ENABLED`, **apagado por defecto**; no habilitarlo durante la coexistencia. No se alteran registros ni estructuras de Aiven ni despliegues.

## Archivos completos del ZIP

1. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations.js` (nuevo, motor puro)
2. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations-service.js` (nuevo, SQL `SELECT` de MP y hermanos de PC)
3. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js` (actualizado)
4. `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` (actualizado)
5. `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css` (actualizado)
6. `modules/cobranza-uni/administracion/main/main.js` (actualizado; caché F5)
7. `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js` (ajuste de mock para dependencia F5)
8. `tests/cobranza-uni-administracion-venta-adicional-fase4.test.js` (ajuste de mock para dependencia F5)
9. `tests/cobranza-uni-administracion-venta-adicional-fase5.test.js` (nuevo)
10. `docs/BLTNOW_VA_ADMIN_FASE5_V001.md`

## Aplicación y verificación

Extraer el ZIP **en la raíz** del repositorio (no en `backend`) manteniendo la estructura de carpetas. Respaldar o comparar archivos si el árbol local tiene cambios posteriores. PowerShell desde la raíz:

```powershell
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations-service.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js
node --check modules/cobranza-uni/administracion/main/main.js
node --check modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js
node --test tests/cobranza-uni-administracion-venta-adicional-fase1.test.js tests/cobranza-uni-administracion-venta-adicional-fase2.test.js tests/cobranza-uni-administracion-venta-adicional-fase3.test.js tests/cobranza-uni-administracion-venta-adicional-fase4.test.js tests/cobranza-uni-administracion-venta-adicional-fase5.test.js
git status --short
```

**QA local:** **124/124** tests al ejecutar los suites aislados de Administración GC + VA F1-F5; navegador Chromium verificó escritorio 1440 y móvil 390, sin errores JS ni pantallas de escritura. No se ejecutó CI completo del repo ni un ensayo HTTP sobre datos vivos de Aiven; la funcionalidad de lookup y acumulados fue probada con fixtures y mocks de SQL.

**Límites:** las clasificaciones que aparecen en vistas previas no gobiernan todavía filtros/ordenamientos SQL, que usan valores persistidos; el resumen visible cuenta proyectos únicos de la página, mientras cada agregado de proyecto consulta todas sus ventas autorizadas. Si un usuario ve datos desactualizados por sincronización GAS, sigue mostrándose la diferencia hasta el corte autorizado. Alta y validación final corresponden a **Fase 6**.

**Normas BLT NOW:** no `*.sql`, no `.patch`, no instaladores, no forzar `.gitignore`. Ningún commit, push, publicación, despliegue ni cambio en Aiven o GAS.
