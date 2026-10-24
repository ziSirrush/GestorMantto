# BLT NOW — Cobranza UNITED > Administración — Excel Fase 5/6 V001

Fecha: 23/10/2026. **Base de código:** `ziSirrush/GestorMantto`, rama `main`, SHA `58f590d98c74d15ef944cc44056d1884c75dda29` (versión 102326.9). **Precondición local:** instalar F1, F2, F3 y F4 Excel V001, en ese orden, ANTES de este delta. No es un cambio desplegado en GitHub.

## Objetivo completado en código

- Solo **MP** tiene pestañas **MP / Zona 1**. GC y VA conservan tablas tipo Excel sin pestañas.
- **Zona 1**: 128 columnas (16 generales + 12×9 facturación + 4 técnicas); **108 campos de factura habilitables**, bajo lista blanca y permiso efectivo. Los otros 20 campos (16 generales y cuatro técnicos) permanecen sin edición en **esta vista** porque contienen identidad, datos heredados y dependencias no aprobadas. No se supone que todas las 128 columnas sean editables.
- **Edición fantasma** igual a GC: doble clic o Enter sobre celda → input embebido → Enter/blur guarda con valor `expected` → recarga; Escape cancela sin solicitud. `type=date` usa fechas `YYYY-MM-DD` del backend. `NULL` se solicita dejando la celda vacía. No hay modal de edición ni alta/vínculo en la pantalla.
- **Edición múltiple**: seleccionar 2–20 filas en la página visible, campo único + valor/NULL, confirmar y guardar. Backend hace un preflight de concurrencia del lote completo antes del primer UPDATE, transacción única, auditoría por celda cambiada, COMMIT/ROLLBACK. IDs BIGINT como texto, sin pérdida de precisión.
- **Reutilización**: edición individual usa el endpoint y el servicio existentes `PATCH /api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/:id/:zonaId`; servicio F6 existente ajustado para permitir SOLO `edit` bajo puerta nueva. Alta y vínculo POST siguen bloqueados. Edición múltiple usa `PATCH /api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/registros/edicion-multiple` registrado **antes** de la ruta dinámica. No se añade ninguna consulta de tabla ajena, ni nuevos índices, tablas, columnas, migraciones ni `.sql`.
- El GET de la F4 continúa **solo lectura**, con `readonly:true` indicando que la consulta no escribe. Fechas DATE salen como texto ISO mediante `CAST(... AS CHAR)` para evitar errores de zona horaria.

## Seguridad obligatoria

La escritura se cierra por defecto. Para activar edición de Zona 1 **después de verificar realmente** que todos los activadores GAS GC/VA/MP están apagados, que el planchado/conteo/conciliación entre Sheets y Aiven están validados y con respaldo, el backend Azure necesita **las tres variables**:

```text
MP_ADMIN_ZONA1_EXCEL_EDIT_ENABLED=true
MP_ADMIN_GAS_CUTOVER_CONFIRMED=true
MP_ADMIN_GC_VA_MP_RECONCILED=true
```

Además `MP_ADMIN_EDIT_ENABLED` no debe estar en `false/0/no/off` (mismo motor de MP principal). Se deben mantener los permisos individuales `MAIN + MP.VER + MP.EDITAR`, sesión humana efectiva, acceso a información **UNITED** y su alcance de proyectos. **La pantalla no determina el permiso**: `/tablas/:tabla/acceso` devuelve `can_write_zone1` y los 108 nombres autorizados solo cuando el backend habilita la función y el usuario tiene EDITAR. View-as no permite escritura.

- F4 y F5 comparten los mismos filtros estrictos de identidad en SQL (`id_dmp`, proyecto coincidente, `idns` no vacío coincidente, cliente compatible, alcance canónico UNITED). Nunca se enlaza un proyecto por el nombre.
- El `PATCH` individual verifica y bloquea fila padre y Zona 1 con `FOR UPDATE`, compara `expected`, hace un UPDATE preciso y registra auditoría en la misma transacción. Exige `idns` válido incluso para el editor individual.
- Bulk: único SELECT `FOR UPDATE` acotado a los 2–20 IDs, más un UPDATE y auditoría por fila cambiada. Se rechazan duplicados, filas no autorizadas, valores previos desfasados y campos fuera de la lista blanca. Sin SELECT repetido por fila, sin UPSERT ni DELETE. La validación del cliente no reemplaza el guard del backend.
- **Legado** `MP_RULES_UNI.zone1WritesEnabled=false` y `gasSyncRemainsActive=true` se conservan para el flujo histórico de alta/vínculo y sus pruebas, que continúa **inactivo**. F5 incorpora una puerta independiente y explícita **únicamente** para modificar las celdas de los 108 campos de facturación; no concede permisos genéricos a los POST legacy. Este doble mecanismo debe revisarse y documentarse para consolidación en F6, sin cambiar la autorización efectiva.

**Estado real de GAS:** el usuario informó que los activadores fueron desactivados. **No puedo confirmar esto** desde Aiven/GAS ni verificar el estado de la conciliación global en remoto; las banderas de Azure quedan sin modificar y la escritura permanece cerrada hasta que se configuren conscientemente.

## Delta entregado

| Tipo | Ruta |
|---|---|
| MOD | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` |
| MOD | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-grid.js` |
| MOD | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-write-service.js` |
| NEW | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-excel-bulk.js` |
| MOD | `modules/cobranza-uni/administracion/main/main.js` (cache bust del submódulo Zona 1 y flags) |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` (transmite flags al hijo) |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js` |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` |
| MOD | `tests/cobranza-uni-administracion-excel-fase1.test.js` (expectativa F5 del flag) |
| MOD | `tests/cobranza-uni-administracion-excel-fase4.test.js` (expectativa de F5 PATCH) |
| MOD | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase6.test.js` (expectativa de propagación de permiso) |
| NEW | `tests/cobranza-uni-administracion-excel-fase5.test.js` |
| NEW | `docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE5_V001.md` |
| NEW | `README_FASE5_EXCEL.txt` |

Las pruebas históricas solo cambian comprobaciones del antiguo estado «solo lectura». No se retiran los controles de autorización, identidad, auditoría o bloqueo de alta y vínculo.

## Verificaciones y límites

- **Prueba local con mocks**, compuesta por Excel F1–F5 y MP F1–F8: **196 casos, 195 aprobados, 0 fallidos, 1 omitido**. La omisión ya existía por falta de archivo GC en el laboratorio parcial. **F5 nueva: 19/19 aprobadas.**
- `node --check` para todos los JS de la copia; ZIP extraído y repetición de pruebas. Todas las operaciones SQL simuladas en memoria, con pruebas de 403, 404, 409, concurrencia, auditoría, borrado NULL, control de acceso, formulación y regresión.
- **Dos suites VA F2/F3 de la copia parcial no se ejecutan**, porque los módulos backend de VA (`pc-query` y `pc-edit-validation`, entre otras dependencias) están ausentes en este subconjunto. Al instalar F1–F5 en el repositorio verdadero, **es obligatorio ejecutar la totalidad de `npm test` y los tests del backend** para considerar CI validado. No confundir estos límites con errores de implementación ni proclamar éxito de CI.
- **No confirmado**: E2E navegador real, escritura en Aiven de laboratorio, conciliación con GAS real, Azure App Service env, CI de GitHub, despliegue de Azure, GitHub Pages o Netlify.
- **No se modificó remoto** GitHub/Aiven/Azure/Netlify, GAS ni activadores. ZIP solo fuentes completas, pruebas, documentación y README; **sin `.patch`, instaladores ni SQL**.

## Siguiente fase

**F6:** auditoría de consumidores y consultas backend legacy, retiro de código definitivamente no usado, depuración de etiquetas obsoletas, suite integral en el repo y validación final antes de autorizar cualquier publicación.
