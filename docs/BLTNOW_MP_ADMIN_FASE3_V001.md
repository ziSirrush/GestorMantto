# BLT NOW — Cobranza UNITED — Administración — Mantenimiento Preventivo — Fase 3 V001

Fecha de referencia: 23/oct/2026. Código oficial consultado: `ziSirrush/GestorMantto`, rama `main`, commit `15c879e6ffa29701006fee74267332d1a29c1b48` (102326.5). **Esta entrega es incremental sobre MP F1 + MP F2 locales**, que aún no están en ese commit público consultado.

## Objetivo

Dejar preparados PATCH individual y masivo (2–20 registros) de `detalle_mp_2026`, sin habilitar aún escrituras humanas mientras siga el activador GAS para **GC, VA y MP**.

La edición real **queda cerrada** porque el contrato de MP F1 conserva `MP_RULES_UNI.writesEnabled=false`. Además, el backend requiere, de forma acumulativa, tres confirmaciones de configuración, actualmente **no activadas por este ZIP**:

- `MP_ADMIN_EDIT_ENABLED=true`
- `MP_ADMIN_GAS_CUTOVER_CONFIRMED=true`
- `MP_ADMIN_GC_VA_MP_RECONCILED=true`

**No configurar estos valores todavía.** La habilitación contractual y la coordinación de corte son responsabilidad de una fase posterior y exigen autorización del usuario. Los flags por sí solos NO habilitan la escritura.

## Edición y seguridad

- F3 habilita la estructura para editar exclusivamente **cuatro campos** de texto cuyo cambio no depende de las fórmulas conocidas de Sheets: `zona_adm`, `periodicidad`, `momento_facturacion`, `forma_pago`. Esta es una lista **conservadora provisional**. El contrato F1 identifica 11 candidatos, pero los siete restantes requieren análisis de identidades, factores, estado y dependencias cruzadas en F4/F5.
- Quedan protegidos `id_dmp`, `id_proyecto_cobranza`, `proyecto`, `cliente`, `idns`, `factor_monto_anual`, los siete derivados/BUSCARV (`iguala`, `condiciones_pago`, `monto_anual`, `pendiente_corriente`, `pendiente_vencido`, `pendiente`, `facturas_pendientes`) y `estado`, `z_oper`, `estatus_cartera` hasta resolver las dependencias VA y control de cartera. No se escribe a Zona 1.
- API: `PATCH /api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros/:id` y `PATCH /api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros/edicion-multiple`.
- La ruta mantiene el guard MAIN / empresa UNITED / agrupación COBRANZA_UNI. El servicio **revalida** permisos efectivos MAIN+VER+EDITAR, actor y modo vista delegada, con el resolver oficial de alcance.
- La autorización no depende del texto `proyecto`, `zona_adm` ni del FK de la UI. Cada fila se bloquea mediante `SELECT ... FOR UPDATE` con `buildCobranzaProjectScopeSql_uni(req,'mp')` **y** `canonicalProjectSql_uni('mp') IS NOT NULL`. Una identidad inconsistente no se edita.
- `expected` es obligatorio en cada celda; se compara dentro de la transacción, después de tomar el lock. SQL usa listas blancas de campos y placeholders; BIGINT se transmite como cadena. Lotes ordenados por ID para reducir riesgo de deadlock.
- Auditoría obligatoria: `AUDITAR_CAMBIO` en `usuario_interacciones` por `recordFromRequest_gnral(...,{executor:conn})`, **dentro de la misma transacción**. Fallar por permisos, concurrencia, alcance o auditoría revierte el lote completo.
- API no implementa POST, PUT, DELETE ni cambios de estructura. No se crean marcadores GAS sin mecanismo validado del sync MP. Por ello el editor se mantiene **cerrado**, en vez de arriesgar sobrescrituras.

## Interfaz

- Main permanece con las mismas tres opciones GC, VA y MP.
- MP conserva consulta F2 (20 columnas, filtros, grupos, paginación, scroll adaptable), y **prepara** el editor individual y selección masiva para mostrarlos únicamente si `/tablas/detalle_mp_2026/acceso` devuelve `can_edit=true` y `editable_fields` autorizados.
- Actualmente dicho endpoint retorna `can_edit=false` por el bloqueo contractual. No hay botones de edición visibles. Las celdas calculadas/relaciones se mantienen de solo lectura.
- Los datos de facturación de `detalle_mp_2026_zona_1` permanecen reservados a F5; no se cruza información por nombre de proyecto.

## Archivos de esta fase (diferencias sobre F2)

1. Nuevo `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation.js` — whitelist, valores, IDs y expected.
2. Nuevo `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-audit.js` — auditoría dentro de la conexión transaccional.
3. Nuevo `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-service.js` — gate fail-closed, permisos, locks, scope, PATCH atómico y rollback.
4. Modificado `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` — rutas PATCH y metadatos `can_edit` / whitelist.
5. Modificado `modules/cobranza-uni/administracion/main/main.js` — editor MP preparado por `can_edit` real, cache-bust F3.
6. Modificado `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` — formulario individual/lote condicionado a autorización del servidor.
7. Modificado `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` — herramientas de edición aisladas y adaptables.
8. Actualizado `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase2.test.js` — la regla anterior «no existe PATCH» se sustituye por «PATCH cerrado mientras no haya permiso».
9. Nuevo `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase3.test.js` — 17 pruebas nuevas, sin SQL vivo.
10. `docs/BLTNOW_MP_ADMIN_FASE3_V001.md` y `README_FASE3_MP.txt` — documentación/instrucciones.

## Verificación ejecutada

- `node --test` sobre cinco pruebas específicas del contexto disponible de F1+F2+F3: **45/45 aprobadas** en copia local aislada.
- De ellas, F3: **17/17** pruebas de validación, bloqueo, autorización, ámbito, conflicto, transacciones, rollback, auditoría y cliente simulado.
- `node --check` en scripts nuevos y modificados: sin errores.
- Las funciones de auditoría y MySQL se probaron con mocks. No equivale a ejecución E2E ni a MySQL/Aiven productivo.
- No se ejecutaron pruebas masivas de CI, despliegues ni acciones remotas.
- `GC`, `VA`, M2M legacy, `detalle_mp_2026_zona_1`, esquema SQL, GAS y configuraciones de Azure/Netlify/GitHub **sin cambios por esta fase**.

## Instalación

**Requiere MP F1 y F2 locales aplicadas**, no combinarlas con una rama que haya cambiado los mismos archivos. El README incluye verificación previa del hash de los cinco archivos F2 que esta entrega sustituye. Los archivos del ZIP son **completos**, no `.patch`. No contiene scripts `.sql` ni instaladores.

## Siguiente

F4 — cálculo/previsualización de `monto_anual = iguala * factor_monto_anual` respetando `NULL`, sin sobrescribir los valores existentes ni abrir escrituras GAS. Revisión de las dependencias con Zona 1.
