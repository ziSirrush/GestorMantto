# BLT NOW - Cobranza UNITED - Administracion - MP Fase 1 V001

Fecha de referencia: 23/oct/2026.
Codigo fuente oficial revisado: `ziSirrush/GestorMantto`, `main`, SHA `15c879e6ffa29701006fee74267332d1a29c1b48` (version 102326.5).

## Contrato implementado (solo declarativo)

- `detalle_mp_2026`: **20 campos** = 19 del DDL historico + `factor_monto_anual` (SMALLINT UNSIGNED NULL, despues de `iguala`). `id_dmp` BIGINT AUTO_INCREMENT, `id_proyecto_cobranza` FK nullable a `cobranza_proyectos`.
- `detalle_mp_2026_zona_1`: **128 campos** = 4 tecnicos (`id_mp_zona_1`, `id_dmp`, `created_at`, `updated_at`) + 16 generales + 12 bloques de 9. FK unica `id_dmp` nullable hacia tabla MP principal; relacion 0..1 por registro principal. Zona 1 **no** crea una cuarta opcion en Main.
- Comprobacion de metadatos de MySQL proporcionada por el usuario: `alter_factor_mp=1`, `tabla_nueva_mp=1`, `columnas_tabla_nueva=128`, `relacion_mp=1`. Esta evidencia confirma existencia y cantidad, **no** equivale a un `SHOW CREATE TABLE` actual para verificar todos los tipos e indices.
- El contrato MP se incorpora en `constants.js`, marcando `schemaReady:true`: significa **esquema declarado**, NO que el CRUD administrativo exista. La vista MP sigue pendiente de F2/F3.

## Fuentes Sheets y trazabilidad

**Hoja principal `Detalle MP 2026`**: 18 columnas A:R.

| Columna | Campo MySQL | Origen |
|---|---|---|
| A | `id_dmp` | Consecutivo, llave principal |
| K | `iguala` | `BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,9,0)` |
| L | `condiciones_pago` | BUSCARV indice 10 |
| M | `monto_anual` | `=K5*6` historica; nueva formula `iguala * factor_monto_anual` |
| N | `pendiente_corriente` | BUSCARV indice 12 |
| O | `pendiente_vencido` | BUSCARV indice 13 |
| P | `pendiente` | BUSCARV indice 14 |
| Q | `facturas_pendientes` | BUSCARV indice 15 |
| R | `estatus_cartera` | `Activo`; valores `Activo` / `Inactivo` aprobados |

Las posiciones B:P de Zona 1 corresponden exactamente a indices 9=IGUALA, 10=CONDICIONES DE PAGO, 12=PENDIENTE CORRIENTE, 13=PENDIENTE VENCIDO, 14=PENDIENTE, 15=FACTURAS PENDIENTES. El BUSCARV historico busca por texto PROYECTO; el runtime de BLT NOW **no** debe replicar ese criterio para relacionar datos sensibles. Vincular mediante `id_dmp` **verificado** y resolver identidad/territorio con los servicios centrales.

**Campo configurable**: `factor_monto_anual` es opcional y NO procede de Sheets. Si esta en `NULL`, preservar el `monto_anual` existente; prohibido multiplicar automaticamente por 6 o 12. F1 no ejecuta calculo alguno.

**Zona 1**: las 124 cabeceras recibidas se mapean por posicion a nombres SQL; se conservaron variantes de origen como `FOMA DE PAGO`, `ESTATUS DE FACTURA` y `FECHA DE FACTURA`, siempre normalizadas a `forma_pago_NN`, `estatus_factura_NN` y `fecha_factura_NN`. Los 12 bloques NO tienen formulas recibidas: en F1 son `source_pending_rules`, sin permiso de escritura. `facturacion_NN` es VARCHAR(150) como el CREATE aplicado; **no** se asume que sea un importe monetario.

## Clasificacion y protecciones

- MP principal: 2 protegidos (`id_dmp`, FK), 7 derivados o BUSCARV (`iguala`, `condiciones_pago`, `monto_anual`, `pendiente_corriente`, `pendiente_vencido`, `pendiente`, `facturas_pendientes`), 11 candidatos editables en fases posteriores. `editable:true` en contrato describe catalogo futuro; **no abre PATCH ni habilita escribir**.
- Zona 1: 4 tecnicos protegidos; 124 fuentes pendientes de reglas. Todas las columnas tienen `editable:false` por ahora.
- Permisos existentes: `COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER` / `.EDITAR`; Main utiliza el guard UNITED/COBRANZA_UNI. En F2, cada SELECT debe incluir el alcance por fila y comprobar permiso VER por separado; Zone 1 hereda identidad del padre validado y no un alcance textual propio.
- Activo/Inactivo es **estado del registro MP**, distinto de estatus de factura. No se impone DEFAULT ni migracion de valores NULL.
- GAS/M2M permanece intacto y activo. Ninguna escritura MP/Zone 1 se habilita. No tocar flags VA.

## Revision de codigo activo y riesgos reales

- GET legacy MP `/detalle-mp-2026` se conecta al wrapper `cobranza-uni-relaciones-protegidas.controller.js`, que utiliza `detalle-mp-2026-cuartos-v2.controller.js`. Este segundo controlador SI aplica `buildCobranzaProjectScopeSql_uni(req, 'mp')` en el SELECT principal y obtiene `mp.*`, que incluye `estatus_cartera`. No confundirlo con funciones GET no conectadas del controlador sync heredado.
- La integridad nombre/FK es critica: un dump historico (07/oct) tenia nombres de proyecto repetidos con FKs distintos y registros MP sin FK. Esto **no** certifica su estado actual. No llenar `id_dmp` de Zona 1 mediante `BUSCARV` por proyecto sin resolver identidad unica.
- En F2 crear GET administrativo con guard propio, filtros, paginacion, zona/fila, bloqueado si relacion/identidad ambiguas. F3 definir concurrencia, auditoria, proteccion frente a GAS antes de cualquier PATCH. Los campos de Zona 1 requieren reglas y muestras antes de habilitar alta/edicion.
- Los datos Zone 1 pueden permanecer con `id_dmp=NULL` hasta conciliacion aprobada; no incluirlos en consultas cruzadas como si estuvieran enlazados.

## Archivos de F1

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-contract.js`: nuevo contrato puro para 20+128 columnas, Sheets y reglas.
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants.js`: enlaza contrato MP sin tocar contratos GC/VA.
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase1.test.js`: 9 pruebas nuevas de contrato.
- `tests/cobranza-uni-administracion-fase1.test.js`: actualiza unica expectativa antigua MP sin esquema.
- `tests/cobranza-uni-administracion-venta-adicional-fase1.test.js`: actualiza unica expectativa antigua MP sin esquema; mantiene aserciones VA.
- `docs/BLTNOW_MP_ADMIN_FASE1_V001.md`: este documento.

## Validacion y limites

- Pruebas puras de contrato MP F1: **9/9** en copia local aislada con Node 22.
- Sintaxis `node --check` de archivos JS del ZIP: validada.
- Pruebas completas GC/VA y CI: pendientes **despues de aplicar en el checkout completo**. No se ejecutaron contra Aiven ni HTTP y no se publico.
- SQL: ALTER/CREATE **ya aplicados por el usuario**. ZIP no incluye SQL, .patch ni instaladores.
- Cambios remotos por esta F1: **ninguno** (GitHub, Aiven, Azure, Netlify, GAS intactos).

## Siguiente fase

MP F2: GET protegido + grid de `detalle_mp_2026` con filtro `Con pendiente` / `Facturas pendientes`, sin habilitar edicion y sin perder permisos/scope por fila. Zona 1 se integra a la vista en F5.
