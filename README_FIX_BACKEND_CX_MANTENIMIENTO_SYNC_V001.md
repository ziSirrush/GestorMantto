# FIX BACKEND CX MANTENIMIENTO SYNC V001

## Objetivo
Agregar al backend de Mantto Gestor la recepcion productiva del Paso 3 de Customer Experience > Mantenimiento:

`POST /api/customer-experience/mantenimiento/sync`

Flujo esperado:

`BD_Mantenimiento (Google Sheets) -> API Azure -> Aiven cx_mantenimiento_encuestas`

## Base exacta verificada
Repositorio: `ziSirrush/GestorMantto`
Rama: `main`
Commit: `9a744173990386cc0c64f6e1225ab9b07cf273cb`
Version: `100826.3`

El paquete debe aplicarse sobre esa base exacta. Si `main` o el repo local cambiaron despues, NO sobrescribir estos archivos completos: rebasar el FIX contra la version nueva.

Blobs base verificados de los archivos existentes modificados:
- `backend/src/modules/customer-experience/customer-experience.routes.js`: `7079d495ee103109cb63968f516dca90f33cb97b`
- `backend/src/modules/customer-experience/customer-experience.controller.js`: `c3d634eaccce11aee83905a8bed88ca44fbf2682`

## Archivos de proyecto incluidos
Modificados completos:
- `backend/src/modules/customer-experience/customer-experience.routes.js`
- `backend/src/modules/customer-experience/customer-experience.controller.js`

Nuevos completos:
- `backend/src/modules/customer-experience/customer-experience-sync.service.js`
- `backend/src/modules/customer-experience/customer-experience-sync.repository.js`

No se modifica frontend.
No se modifica `backend/src/routes/index.js` porque Customer Experience ya esta montado en `/api/customer-experience`.
No se modifica `integration-auth.middleware.js` porque `INTEGRATION_VENTAS_ID` / `INTEGRATION_VENTAS_SECRET` ya forman parte del middleware M2M vigente.

## Contrato del endpoint
Ruta:

`POST /api/customer-experience/mantenimiento/sync`

Guard:

`requireIntegrationAuthFor('INTEGRATION_VENTAS_ID')`

El body debe conservar exactamente el contrato del SEND generado:

```json
{
  "source": "CX_MANTENIMIENTO_SHEETS",
  "table": "cx_mantenimiento_encuestas",
  "key": "id_de_encuesta",
  "mode": "FULL_ROW_UPSERT",
  "bloque": 1,
  "total_bloques": 1,
  "registros": []
}
```

Cada registro debe contener exactamente las 58 columnas de `BD_Mantenimiento`.

## Regla de persistencia
Llave logica: `id_de_encuesta`.

- Si no existe: INSERT.
- Si existe una sola vez y los 58 valores son iguales: SIN CAMBIOS.
- Si existe una sola vez y algun valor cambia: UPDATE de la fila existente.
- Si la llave ya esta duplicada en Aiven: ese registro se rechaza; no se elige silenciosamente una fila.
- Un bloque admite maximo 300 registros.
- Los registros se procesan dentro de una transaccion con SAVEPOINT por registro para aislar errores de fila.
- Errores estructurales de BD abortan y revierten el bloque.

No se utiliza el `id` AUTO_INCREMENT como llave de sincronizacion.

## Estructura de BD
Este FIX NO crea ni altera tablas, columnas, indices ni permisos.

Asume existente:

`cx_mantenimiento_encuestas`

con las 58 columnas ya definidas para CX Mantenimiento mas `id` AUTO_INCREMENT.

`Temas puntuales` no forma parte del contrato porque no existe en esa tabla.

## Seguridad M2M
El Apps Script debe configurar como Script Properties:
- `MANTTO_API_BASE`
- `INTEGRATION_VENTAS_ID`
- `INTEGRATION_VENTAS_SECRET`

El secreto no esta incluido en este paquete.

La exigencia efectiva de HMAC sigue el switch global ya existente `INTEGRATION_AUTH_ENABLED`. Este FIX no cambia su valor ni su comportamiento.

## Aplicacion local recomendada
Antes de copiar:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
Set-Location $REPO

git rev-parse HEAD
git status --short
```

Debe mostrar HEAD:

`9a744173990386cc0c64f6e1225ab9b07cf273cb`

y `git status --short` debe estar vacio.

Copiar los cuatro archivos del ZIP conservando exactamente sus rutas.

Luego validar:

```powershell
node --check .\backend\src\modules\customer-experience\customer-experience.routes.js
node --check .\backend\src\modules\customer-experience\customer-experience.controller.js
node --check .\backend\src\modules\customer-experience\customer-experience-sync.service.js
node --check .\backend\src\modules\customer-experience\customer-experience-sync.repository.js

git diff --check
git status --short
git diff --stat
```

## Prueba funcional posterior al despliegue autorizado
Despues de aplicar/desplegar backend y confirmar configuracion M2M:

1. Ejecutar `CX_MTTO_SEND_Diagnostico()` en Apps Script.
2. Ejecutar `CX_MTTO_SEND_PruebaPrimerRegistro()`.
3. Confirmar en la respuesta: `insertados`, `actualizados` o `sin_cambios` = 1 y `rechazados` = 0.
4. Confirmar en Aiven el `id_de_encuesta` probado.
5. Repetir el mismo registro y confirmar `sin_cambios = 1`.
6. Solo entonces ejecutar `CX_MTTO_SEND_ProcesoCompleto()`.

## Rollback local antes de commit
Si el FIX se copio sobre un repo limpio en la base indicada y aun no se ha hecho commit:

```powershell
git restore -- \
  backend/src/modules/customer-experience/customer-experience.routes.js \
  backend/src/modules/customer-experience/customer-experience.controller.js

Remove-Item .\backend\src\modules\customer-experience\customer-experience-sync.service.js -Force
Remove-Item .\backend\src\modules\customer-experience\customer-experience-sync.repository.js -Force
```

## Validaciones realizadas al paquete
- `node --check`: PASS en los 4 JS.
- `git diff --check`: PASS.
- Contrato Paso 2 -> SEND -> backend: PASS, 58/58 campos y mismo orden.
- Prueba aislada con repositorio/DB mock: PASS para INSERT, SIN CAMBIOS, UPDATE, duplicado en bloque, campo faltante, contrato incorrecto y limite de 300.
- Base `routes.js` y `controller.js` reconstruida y comparada por Git blob SHA contra GitHub: PASS.
- `main` reconsultado al terminar: continuo en `9a744173...` / `Version 100826.3`.

## No ejecutado
- No se conecto este FIX a Aiven live.
- No se aplico ninguna escritura en Aiven.
- No se modifico GitHub.
- No se desplego Azure.
- No se ejecuto E2E real Apps Script -> Azure -> Aiven.

Por lo tanto, este paquete esta preparado y validado localmente, pero NO debe describirse como desplegado ni validado contra produccion.
