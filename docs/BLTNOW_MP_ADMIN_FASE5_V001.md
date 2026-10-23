# BLT NOW — UNITED > Cobranza > Administración > MP — Fase 5 V001

**Base comprobada:** `ziSirrush/GestorMantto`, rama `main`, commit `15c879e6ffa29701006fee74267332d1a29c1b48` (versión 102326.5, 23/oct/2026). El código entregado exige **MP Fases 1–4 aplicadas localmente**; esas fases todavía no aparecen en el commit consultado. Esta entrega no realiza escrituras ni despliegues.

## Objetivo

Consultar `detalle_mp_2026_zona_1` con sus **128 columnas** (4 técnicas, 16 generales y 12 bloques de 9) desde el editor de **`detalle_mp_2026`** de Administración, en modo **solo lectura**. El usuario podrá abrir **«Facturación Zona 1»** desde cada registro MP (cualquiera de los grupos del grid). Se muestra el desglose y un comparativo informativo de los seis valores que en Sheets se obtenían con `BUSCARV`.

## API y seguridad

- **Nuevo endpoint:** `GET /api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros/:id/zona-1`.
- Guard principal: sesión, MAIN `COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`, puerta `UNITED`, agrupación `COBRANZA_UNI`; permiso independiente de tabla **`COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER`**. EDITAR no concede lectura.
- El servicio requiere también `req.informationAccess` de UNITED con puerta abierta, valida `id_dmp` como BIGINT positivo y aplica el alcance oficial `buildCobranzaProjectScopeSql_uni(req,'mp')` junto a `canonicalProjectSql_uni('mp') IS NOT NULL`.
- Se consulta primero el registro principal **dentro de alcance**. La lectura de Zona 1 se hace **solo mediante `z.id_dmp = mp.id_dmp`**, revalidando alcance e identidad en el propio `SELECT` con `INNER JOIN detalle_mp_2026 mp`. No se realiza `BUSCARV` por nombre, cliente o IDNS como autorización ni fallback. **No hay búsqueda global** para encontrar filas de Zona 1 con `id_dmp` NULL.
- Se cotejan `proyecto` de ambas tablas (obligatorio) y, cuando existen en ambos lados, `idns` y `cliente`. Si la identidad difiere, hay más de una fila, faltan columnas de origen o la relación no es confiable, devuelve **409 sin revelar la fila de Zona 1**. El registro principal no accesible o con identidad oficial inválida devuelve **404** indistinguible para el usuario.
- `id_dmp` e `id_mp_zona_1` se devuelven como texto (evita pérdida de precisión de BIGINT); SQL usa identificadores de lista blanca fija y placeholders.

## Contrato de respuesta

- `ok:true`, `readonly:true`, `table:'detalle_mp_2026_zona_1'`, `id_dmp` textual, `relation:'id_dmp'`, `invoice_blocks:12`, `columns` (metadatos de las 128 columnas).
- Si el proyecto MP está autorizado pero **no hay fila vinculada**: `linked:false`, `row:null`, `status:'sin_vinculo_id_dmp'`. No se inventan ni importan datos.
- Si está vinculada y verificada: `linked:true`, `identity_verified:true`, `row` con 128 columnas y `lookup_preview` de seis campos de la hoja actual: `iguala`, `condiciones_pago`, `pendiente_corriente`, `pendiente_vencido`, `pendiente`, `facturas_pendientes`.
- El comparativo distingue **coincide, diferente, sin dato e inválido**. Los importes DECIMAL(18,2) se comparan por centavos con `BigInt` y los enteros por valor exacto; no asume una fórmula para `pendiente`, `dias_vencimiento` ni otros campos Zona 1. El preview **no recalcula ni persiste** importes.

## Interfaz

- Un panel lateral con los 16 datos generales y 12 secciones de facturación. Cada sección presenta los nueve encabezados normalizados de la tabla SQL (la falta de ortografía «FOMA» de Sheets se muestra como «FORMA»).
- Se visualizan también los 12 bloques vacíos: «Sin captura»; esto **no implica 12 facturas obligatorias**.
- Vista responsive, escape HTML de todos los valores de Aiven, botón cerrar, Escape, invalidación de consultas tardías al cambiar página/filtro o cerrar el panel.
- Un registro sin `id_dmp` enlazado en Zona 1 **no mostrará datos** aun cuando exista un nombre de proyecto similar; la importación/vinculación y reglas de captura se reservan para MP Fase 6.

## Archivos incluidos en el ZIP (solo diferencias respecto de F4)

| Tipo | Archivo |
|---|---|
| NUEVO | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-service.js` |
| MODIFICADO | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` |
| MODIFICADO | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` |
| MODIFICADO | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` |
| NUEVO | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase5.test.js` |
| NUEVO | `docs/BLTNOW_MP_ADMIN_FASE5_V001.md` |
| NUEVO | `README_FASE5_MP.txt` |

## Pruebas y límites

- Ejecutadas **81/81 pruebas locales focalizadas** (Administración F1, VA F1 y MP F1–F5): aprobadas. **20/20 F5**: accesos, scope, identidad, PK/FK, tipos, datos faltantes, comparativo, manejo de errores, UI, sanitización y carreras asíncronas.
- `node --check` en los archivos JS nuevos/modificados: aprobado.
- No es CI ni prueba E2E, no se verificó un registro real de Zona 1 contra el esquema vivo de Aiven (solo la comprobación anterior de 128 columnas y FK proporcionada por el usuario), ni se comprobaron cargas reales. No hay `INSERT`, `UPDATE`, `DELETE`, migración SQL ni invocación de GAS en esta entrega.
- **Sin cambios:** GC, VA, contratos MP F1, fórmulas F4, auditoría/sync legacy, tabla SQL, repositorio GitHub, Aiven, Azure, Netlify o GAS. **Escritura MP sigue bloqueada por `MP_RULES_UNI.writesEnabled=false`** y sus flags; GAS sigue activo hasta terminar GC+VA+MP y contar con autorización expresa.

**Siguiente:** MP Fase 6, vinculación/carga inicial segura de Zona 1, edición y validaciones de capturas, conciliación. Sin corte de GAS ni activación automática al terminar F6.
