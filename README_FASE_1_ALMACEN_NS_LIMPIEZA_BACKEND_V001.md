# BLT NOW | Almacen NetSuite | Fase 1 - Retiro Excel + backend base | V001

Fecha: 19/10/2026. **Entrega preparatoria, NO aplicada.**
Repositorio: `ziSirrush/GestorMantto`, `main` inspeccionado `7d738d1e7ba712e6a08edf3115a66637610e39cf` (Version 101626.3). Una rama main posterior requiere comparar antes de instalar.

## Decision de alcance aprobada en la conversacion

Fase 0: creadas por el usuario `almacen_ns_lotes`, `almacen_ns_inventario`, `almacen_ns_movimientos`, `almacen_ns_catalogo_articulos` (no verificadas contra Aiven vivo por este paquete).

**Fase 1**: retirar **sin migracion de datos** `almacen_fuente_excel` y `almacen_stock_reabasto_excepciones`; conservar `almacen_auditoria` y sus registros. El backend existente de Almacen deja de ejecutar el motor Excel. Quedan los **siete apartados** en la UI (no se modifica frontend). A partir de Fase 2 se completan calculos, servicios y relaciones operativas; Fase 3 entrega Sheets -> API -> Aiven; Fase 4 implementa frontend, permisos visuales y experiencia de sincronizacion.

## Archivos completos del ZIP

1. `backend/src/modules/almacen/almacen.routes.js` — sustitucion completa del router activo, manteniendo contratos de los siete apartados.
2. `backend/src/modules/almacen/almacen.ns-query-service.js` — nuevo servicio base desde las tres fuentes publicadas de NetSuite (sin lecturas Excel).
3. `backend/src/modules/almacen/almacen.ns-audit-service.js` — historia y operaciones sobre `almacen_auditoria`, con muestras desde 230 y sin FK a Excel.
4. `database/almacen_ns/fase_1/00_PRECHECK_ALMACEN_F1_SOLO_LECTURA.sql`
5. `database/almacen_ns/fase_1/01_ELIMINAR_LEGACY_ALMACEN_F1.sql` — **DDL destructivo** (dos DROP explicitos).
6. `database/almacen_ns/fase_1/02_SMOKE_ALMACEN_F1_SOLO_LECTURA.sql`

No hay `patch`, instalador, modificacion de frontend, permisos SQL nuevos, tabla nueva ni scripts GAS en esta fase.

## Mecanica base de cada apartado

| Apartado | Comportamiento F1 | Lo que falta |
| --- | --- | --- |
| Dashboard Almacen | Valor y fisico desde corte 230 publicado; filtros del alcance validado | Refinamiento F2/F4 |
| Inventario | Tabla consolidada desde 230 (ID articulo, subsidiaria, ubicacion). Complemento de categoria/AG del ultimo catalogo completo, **sin sumar cantidades de catalogo** | Busquedas exclusivamente de catalogo y mas filtros F2 |
| Stock | Existencia desde 230; **NO inventa** ABC, demanda, minimos, maximos, seguridad o reabasto | Calculos reales usando 433 en F2 |
| Prestamos | Conserva ruta y modulo; `available:false` cuando no existe origen contractual de responsable/folio de prestamo | Definicion de trazabilidad funcional F2 |
| Resguardos | Conserva ruta y modulo; `available:false` cuando no existen los campos de resguardo necesarios | Definicion funcional F2 |
| Auditoria | Conserva historial, conteos, cierre, y nuevas muestras desde 230; no borra registros historicos | QA real y detalles UX F4 |
| Carga de Informacion | Conserva ruta; lectura fuente/estado NetSuite; **desactiva importaciones Excel** con HTTP 410 | API de carga F2, GAS F3 y nueva UI F4 |

No es correcto presentar la existencia en `Almacen de prestamo` como prestamo a una persona ni la salida de un movimiento 433 como resguardo nominal: falta el vinculo estructurado. Quedan disponibles los modulos, no se inventan registros.

## Restriccion de permisos y subsidiarias (NO OMITIR)

Se reutiliza `humanInformationGuard_gnral` y los permisos `ALMACEN_*` **existentes**, sin bypassear el Panel. El dump de 07/10 registra `perm_agrupaciones.codigo=ALMACEN` en CORELLIAN. Los Informes NetSuite carecen de relacion con `usuarios_visibles`/zonas operativas, por lo que **F1 solo responde datos a sesiones cuyo Guard central devuelva `acceso_dominio_completo=true`**. Para ese dominio solo se permite el ID de subsidiaria NetSuite verificado en las muestras: CORELLIAN=2; UNITED=5 cuando exista una agrupacion oficialmente autorizada para ese dominio. WAT/PACIFICO/otras subsidiarias permanecen cerradas hasta resolver la asignacion de motores y permisos en F2/F4. No se expone el catalogo global ni un agregado multiempresa por poseer un rol alto. **403 es el resultado correcto de un alcance incompleto**, no un permiso abierto pendiente de frontend.

Los movimientos 433 se almacenan en su tabla independiente; **F1 no los transforma en prestamos, resguardos ni consumos concluyentes**. La Fase 2 los conectara con reglas verificables.

## SECUENCIA OBLIGATORIA - Riesgo de DROP (orden estricto)

1. Verificar SHA de `main`. Si GitHub avanzo desde el SHA indicado, **detener y comparar**; no sobrescribir cambios ajenos.
2. Ejecutar `00_PRECHECK_ALMACEN_F1_SOLO_LECTURA.sql` contra Aiven. Validar las 4 tablas NS, la existencia de `almacen_auditoria`, los nombres y la ausencia de FKs, vistas, triggers o rutinas externas dependientes. **No asumir que la confirmacion conversacional sustituye a Aiven.**
3. Conservar respaldo completo de Aiven y probar restauracion en ambiente aislado. Registrar conteo previo de `almacen_auditoria`. Las tablas Excel y excepciones anteriores se perderan por decision del usuario; guardar copia de seguridad aunque no se pretenda migrarla. El dump 07/10 es referencia antigua, no respaldo actual.
4. Extraer/copiar **solo los archivos completos** del ZIP en la raiz del repositorio. Revisar cambios con `git diff --check`, `git diff`, y ejecutar `node --check` en los 3 JS.
5. **Limpieza de codigo legacy**, sin tocar frontend ni otras carpetas. Solo cuando el router nuevo ya esta en el arbol de trabajo, eliminar los archivos obsoletos listados abajo mediante `git rm`. Confirmar `git grep` no encuentra consumidores activos. Estos archivos no pueden borrarse solo descomprimiendo un ZIP; se documenta su eliminacion de forma explicita.
6. Validar localmente las rutas /api/almacen con usuario autorizado, sin alcance y en modo visor. Comprobar que el historico `almacen_auditoria` existe, que el frontend no realiza escrituras de Excel y que la UI muestra estados vacios controlados antes de F3. Confirmar que la API ya no importa archivos XLSX.
7. **Publicar backend Azure solamente con autorizacion del usuario**, comprobar los endpoints nuevos y los 410 de carga; no saltar la verificacion del ambiente anterior. Mantener backup y plan de regreso.
8. **Unicamente despues de comprobar el backend nuevo activo**, ejecutar manualmente `01_ELIMINAR_LEGACY_ALMACEN_F1.sql` en Aiven. Este paso forma parte de la Fase 1, no de Fase 5.
9. Ejecutar `02_SMOKE_ALMACEN_F1_SOLO_LECTURA.sql`, cotejar que Auditoria mantiene su conteo y ejecutar pruebas funcionales de consulta. Documentar fecha, ejecutor y verificacion.

**ADVERTENCIA:** MySQL `DROP TABLE` no admite `ROLLBACK`. Si el backend actual sigue apuntando a `almacen_fuente_excel`, ejecutar el DROP rompe rutas activas. Esta entrega NO ejecuta ni despliega nada automaticamente.

### Retiro de archivos backend legacy (rutas EXACTAS)

El nuevo `almacen.routes.js` no importa los siguientes servicios anteriores. Antes del `git rm`, revisar usos extra-módulo y pruebas del repo (no tenemos clone local completo del GitHub vivo):

```powershell
# Ejecutar en la raiz de GestorMantto tras copiar los 3 archivos JS.
git grep -n -E 'almacen\.(service|query-service|source-engine|archive-service|audit-service|stock-reabasto-service|controller|official-workbook)|xlsx-lite' -- backend
# Las coincidencias exclusivamente DENTRO de los archivos legacy seran esperables
# hasta retirarlos. Si aparecen consumidores EXTERNOS, DETENER Y REVISAR.

git rm -- backend/src/modules/almacen/almacen.controller.js backend/src/modules/almacen/almacen.archive-service.js backend/src/modules/almacen/almacen.audit-service.js backend/src/modules/almacen/almacen.official-workbook.js backend/src/modules/almacen/almacen.query-service.js backend/src/modules/almacen/almacen.service.js backend/src/modules/almacen/almacen.source-engine.js backend/src/modules/almacen/almacen.stock-reabasto-service.js backend/src/modules/almacen/xlsx-lite.js

git diff --check
git status --short
```

No borrar `backend/src/modules/almacen/almacen.routes.js`; este archivo se **reemplaza** por el del ZIP. No borrar los JS/CSS del frontend ni `almacen_auditoria`.

## Pruebas de contrato minimas despues de instalar backend

- Sin corte publicado: `/api/almacen/dashboard` e `/inventario` retornan `source:null` y filas vacias; **ningun `SELECT` a tablas borradas**.
- Con lote `INVENTARIO_230` valido/publicado/activo: `/api/almacen/inventario` solo lista el ID de subsidiaria autorizado (sin sumar existencias del catalogo), `/dashboard` agrega la misma fuente.
- Catalogo V002 pendiente/incompleto: no se suma a inventario ni se publica por error.
- Persona sin puerta/alcance completo: recibe 403; permiso inexistente: denegado por Guard central.
- Usuario en visor: las mutaciones de auditoria deben denegarse por Guard central.
- `/api/almacen/prestamos/catalogos` y `/resguardos/catalogos` conservan `available:false` sin filas inventadas.
- `/api/almacen/carga/capabilities` retorna `canImport:false`; `POST /api/almacen/carga/importar` y PATCH `/stock/reabasto` retornan HTTP 410.
- El historial de `almacen_auditoria` no se pierde; se debe probar crear, capturar y cerrar con un corte NS autorizado.
- Si no hay sincronizacion GAS todavia, no reportar datos como si ya hubieran llegado de NetSuite.

## Reversibilidad y pendientes

- Antes de ejecutar DROP: restaurar `almacen.routes.js` original y los archivos eliminados con Git si QA falla.
- Despues de ejecutar DROP: **restaurar las tablas desde respaldo verificado** ANTES de volver al backend antiguo. No ejecutar DROP con la expectativa de revertir en SQL.
- Azure Blob puede conservar respaldos Excel fisicos antiguos; este paquete retira los consumidores/carga, **no elimina blobs externos**.
- Fase 2: reglas de mapeo para diferentes subsidiarias, movimientos, demanda/stock y relaciones comprobables de prestamos y resguardos, y endpoints de sincronizacion.
- Fase 3: GAS incremental + completo, validacion de lotes, reintentos e idempotencia (tx+linea en movimientos).
- Fase 4: frontend NetSuite, Dashboard/Inventario/Stock/Prestamos/Resguardos/Auditoria/Carga, permisos visuales y mensajes de estado actualizados. La interfaz F1 mantiene textos temporales del Excel hasta F4.

## Evidencia y limites

- **Verificado**: esquemas del SQL Fase 0 y V002 aportados, `Sabana Estrutura 071026.sql`, `Sabana 071026.sql`; GitHub `main` a SHA indicado; sintaxis JS `node --check`; pruebas locales mediante DB/Router simulados.
- **NO verificado**: esquema Aiven en vivo, datos reales NetSuite, E2E con Azure, despliegue y pruebas de restauracion. **No puedo confirmar que el DROP sea seguro en produccion** hasta completar pasos 2, 3, 6 y 7.
- **Sin escrituras externas**: ni GitHub, ni Aiven, ni Azure, ni Netlify se modificaron al preparar este ZIP.
