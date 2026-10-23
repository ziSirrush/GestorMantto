# BLT NOW — Cobranza UNITED — Administración — MP Fase 7 V001

**Fecha:** 23/oct/2026. **Base GitHub consultada:** `ziSirrush/GestorMantto`, rama `main`, SHA `15c879e6ffa29701006fee74267332d1a29c1b48` (Version 102326.5). El código MP F1–F6 empleado para esta entrega procede de los ZIP incrementales anteriores; **NO está publicado en ese `main`** a la fecha comprobada. F7 **requiere F1–F6 aplicadas localmente**.

## Objetivo y alcance exacto

Incorporar una **conciliación técnica de solo lectura** a Administración > Mantenimiento Preventivo, sin alterar contratos, reglas de edición, importaciones, sincronización ni permisos existentes. La evidencia de Aiven, Sheets y pruebas E2E es distinta de las pruebas con mocks.

### Archivos de este FIX (delta respecto a F6)

| Archivo | Cambio |
|---|---|
| `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-reconciliation.js` | **Nuevo:** verifica esquema 20+128, FK, índice UNIQUE y PK; entrega agregados protegidos y solo lectura. |
| `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` | **Modificado:** GET `/tablas/detalle_mp_2026/conciliacion` sujeto al guard oficial MAIN, UNITED y permiso MP.VER efectivo. |
| `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` | **Modificado:** botón de conciliación, muestra resumen y conserva advertencia de corte no autorizado. |
| `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` | **Modificado:** estilos aislados y responsive del resumen. |
| `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase7.test.js` | **Nuevo:** 11 tests de scope, esquema, conteos, bloqueo de corte, rutas, UI y retrocompatibilidad. |
| `docs/BLTNOW_MP_ADMIN_FASE7_V001.md`, `README_FASE7_MP.txt` | Documentación y aplicación local. |

**Sin cambios:** `gestion_credito`, `pc`, los contratos MP, los servicios de escritura F3/F6, la estructura Aiven, GAS, permisos, Azure, GitHub y Netlify.

## GET de diagnóstico

`GET /api/cobranza-uni/administracion/tablas/detalle_mp_2026/conciliacion`

- Exige `MAIN.ACCESO_VISUAL`, `MP.VER`, sesión efectiva, empresa UNITED y puerta `COBRANZA_UNI` por el guard existente.
- Consulta con **filtro territorial oficial e identidad verificada** (`buildCobranzaProjectScopeSql_uni`, `canonicalProjectSql_uni`). La relación con Zona 1 es **exclusivamente `z.id_dmp = mp.id_dmp`**, nunca el nombre del proyecto.
- **No devuelve filas, facturas individuales ni datos globales sin alcance**; expone agregados de los registros MP visibles y oficialmente verificables.
- Metadatos: compara 20 columnas MP, 128 Zona 1, tipos/nullability, FK `fk_mp_zona1_detalle_mp`, UNIQUE `uq_mp_zona1_id_dmp` y PK `id_mp_zona_1`.
- Datos por alcance: MP visibles, con/sin Zona 1 vinculada, identidad con conflicto, FK MP NULL, estado desconocido, factor NULL/cero, discrepancia orientativa de `monto_anual` / `pendiente`, diferencias/faltantes de los seis campos `BUSCARV` y espacios de factura con algún campo informado.
- El resumen **NO cuantifica las filas Zona 1 con `id_dmp NULL`, ni los registros MP sin identidad oficial**, pues sus recuentos globales podrían revelar información de proyectos ajenos. La conciliación global debe ejecutarse por un administrador de BD autorizado en Aiven.
- `mode: diagnostic_only`, `readonly:true`, `cutover_ready:false`, `cutover_authorized:false`, `gas_must_remain_active:true` se mantienen incluso sin discrepancias.
- Una ausencia de factor **es esperada** si aún no fue capturado; una diferencia de pendiente/monto es un indicador a estudiar, no motivo para sobrescribir valores automáticamente.

## Pruebas ejecutadas

- **114/114 pruebas focalizadas correctas** en un proyecto parcial compuesto por F1–F6 más F7: 103 heredadas + 11 nuevas.
- `node --check` en los JS modificados/nuevos: sin errores de sintaxis.
- Los tests usan **mocks**: verifican contrato, SQL generado, permisos denegados, ámbitos, metas, UI y garantías de no escritura.
- **No son pruebas E2E ni contra MySQL de Aiven en vivo**. No se dispone de consultas MySQL remotas directas mediante la conexión actual; el valor de los contadores y la comparación con Sheets **no se han medido**. `main` oficial aún no contiene MP F1–F7.

## Verificación pendiente en Aiven MySQL `mydb`

Los siguientes SELECT son **solo lectura**; deben realizarse exclusivamente desde una consola Aiven autenticada por un administrador autorizado, y sus resultados no deben exponerse en el GET territorial. Los números se deben cotejar con Sheets **en una fecha/hora de corte común**, manteniendo el activador GAS activo durante la fase diagnóstica.

**1) Conteos globales y registros de la nueva tabla no vinculados**

```sql
SELECT COUNT(*) AS total_mp,
       SUM(id_proyecto_cobranza IS NULL) AS mp_sin_fk
FROM mydb.detalle_mp_2026;

SELECT COUNT(*) AS total_zona1,
       SUM(id_dmp IS NULL) AS zona1_sin_vincular
FROM mydb.detalle_mp_2026_zona_1;

SELECT SUM(z.id_dmp IS NOT NULL AND mp.id_dmp IS NULL) AS zona1_fk_huerfana
FROM mydb.detalle_mp_2026_zona_1 z
LEFT JOIN mydb.detalle_mp_2026 mp ON mp.id_dmp = z.id_dmp;
```

**2) Conflictos de identidad y nombres repetidos (no modificar datos)**

```sql
SELECT proyecto, COUNT(*) AS filas,
       COUNT(DISTINCT id_proyecto_cobranza) AS fk_distintas
FROM mydb.detalle_mp_2026
WHERE proyecto IS NOT NULL AND TRIM(proyecto) <> ''
GROUP BY proyecto
HAVING COUNT(DISTINCT id_proyecto_cobranza) > 1
ORDER BY fk_distintas DESC, filas DESC
LIMIT 50;

SELECT z.id_mp_zona_1, z.id_dmp,
       z.proyecto AS proyecto_zona1,
       mp.proyecto AS proyecto_mp,
       z.idns AS id_zona1, mp.idns AS id_mp
FROM mydb.detalle_mp_2026_zona_1 z
LEFT JOIN mydb.detalle_mp_2026 mp ON mp.id_dmp = z.id_dmp
WHERE z.id_dmp IS NOT NULL AND
      (mp.id_dmp IS NULL OR
       UPPER(TRIM(z.proyecto)) COLLATE utf8mb4_0900_bin <>
       UPPER(TRIM(mp.proyecto)) COLLATE utf8mb4_0900_bin OR
       (z.idns IS NOT NULL AND mp.idns IS NOT NULL AND
        UPPER(TRIM(z.idns)) COLLATE utf8mb4_0900_bin <>
        UPPER(TRIM(mp.idns)) COLLATE utf8mb4_0900_bin))
LIMIT 50;
```

**3) Factores y diferencias orientativas**

```sql
SELECT COUNT(*) AS mp_total,
       SUM(factor_monto_anual IS NULL) AS factor_pendiente,
       SUM(factor_monto_anual = 0) AS factor_cero,
       SUM(factor_monto_anual > 0 AND iguala IS NOT NULL AND
           monto_anual IS NOT NULL AND
           monto_anual <> ROUND(iguala * factor_monto_anual, 2))
           AS monto_anual_por_revisar,
       SUM(pendiente_corriente IS NOT NULL AND pendiente_vencido IS NOT NULL
           AND pendiente IS NOT NULL AND
           pendiente <> pendiente_corriente + pendiente_vencido)
           AS pendiente_por_revisar
FROM mydb.detalle_mp_2026;
```

**4) Comparación manual con Sheets:** confrontar total de filas, `id_dmp`, IDNS, proyecto, cliente, seis columnas fuente `BUSCARV` (`iguala`, `condiciones_pago`, `pendiente_corriente`, `pendiente_vencido`, `pendiente`, `facturas_pendientes`), importes y 12 bloques de facturas. La hoja origen **no lleva el `id_dmp`**: el vínculo requiere identidad verificada, y las filas no vinculadas no se deben autoasignar por nombre. Registrar discrepancias y su resolución, sin atribuirlas a fallos sin investigación.

## Criterios para decisión posterior de corte (NO autorizada en F7)

1. Contrato y claves en `mydb` verificados contra fuente viva.
2. Importación de Zona 1 completada y reconciliada: filas con `id_dmp NULL` catalogadas; sin identidades contradictorias. Determinar si se admite histórico incompleto.
3. Totales y detalle Sheets/Aiven por proyecto y fecha de corte coinciden o cuentan con excepciones aprobadas; demostrar cómo y cuándo GAS deja de escribir.
4. GC y VA permanecen funcionales y auditados; revisión completa de sincronización, reintentos y protección ante sobrescritura GAS. Incluir validación de riesgo sobre `gestion_credito` y `pc`.
5. Pruebas E2E con usuarios autorizados/denegados, cuartos UNITED, concurrencia, errores, auditoría en `usuario_interacciones`, `ROLLBACK` y sin mezcla de proyectos.
6. Aprobación explícita del usuario para la **transición conjunta de GC+VA+MP**, plan de reversión y ventana. Solo después corresponde otra entrega de activación (no incluida).

**Estado al cierre F7: PREPARADO PARA CONCILIAR, NO PARA CORTAR GAS.** Ninguna estadística de consulta activa ediciones automáticamente. La app en `main` sigue sin F1–F7 hasta que el usuario aplique y confirme su integración.
