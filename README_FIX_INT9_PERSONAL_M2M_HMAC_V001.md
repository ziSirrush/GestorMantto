# BLT NOW — FIX INT-9: alta de personal mediante M2M/HMAC

**Entrega:** `ENTREGA_FIX_INT9_PERSONAL_M2M_HMAC_V001`  
**Fecha:** 20/10/2026  
**Repositorio:** `ziSirrush/GestorMantto`  
**Referencia verificada:** `main` — `7f497d121eb26ec6a121140a19c334c6e16d57ab`  
**Estado:** FIX preparado y validado localmente con simulación. **NO aplicado al repositorio del usuario, NO publicado en GitHub, NO desplegado en Azure ni probado contra Aiven real.**

## 1. Diagnóstico

El backend de Programación de Personal INT-9 expone `POST /api/instalaciones/programacion/personal`, pero exige sesión JWT y permisos humanos. Google Apps Script usa firma HMAC de la identidad de Ventas y no dispone de `id_SB` de un usuario. El servicio rechazaba la creación por ausencia de actor.

El middleware M2M general **ya está** implementado en el backend; no necesita modificaciones y por eso **no se incluye** en este FIX.

## 2. Alcance exacto

1. `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js`: permite **solamente el POST de alta de personal** por M2M con `INTEGRATION_VENTAS_ID` y firma obligatoria (`alwaysRequireAuth: true`) incluso cuando la bandera global está desactivada. Mantiene intactas las demás rutas y el flujo humano JWT + Guard CORELLIAN + permisos `VER`/`CREAR`.
2. `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js`: acepta que el actor sea la integración M2M exclusivamente en `crear`, guarda `created_by` y `updated_by` como `NULL` (esquema ya lo permite) y registra en log técnico la identidad de la integración y el ID nuevo. No inventa un `id_SB` de usuario.
3. `tests/instalaciones-programacion-personal-m2m.test.js`: 17 pruebas unitarias/de ruta simulada para verificar seguridad y compatibilidad sin conectarse a Aiven o Azure.
4. `docs/ADR_20261020_INT9_PERSONAL_M2M_HMAC_V001.md`: documenta el cambio de autenticación, límites de autorización y riesgos conocidos.

**NO se cambian:** las tablas, los esquemas SQL, el middleware compartido, el frontend, GAS, otras integraciones, las rutas de edición/baja, los permisos del Panel ni los secretos.

## 3. Contrato M2M — misma configuración de Ventas

- **Método y endpoint:** `POST /api/instalaciones/programacion/personal`.
- **Identidad esperada:** valor configurado en Azure bajo `INTEGRATION_VENTAS_ID` (Apps Script utiliza `ventas-appscript`). Confirmar que ambos coincidan.
- **Secreto Azure:** `INTEGRATION_VENTAS_SECRET`.
- **Script Property GAS:** `INTEGRATION_VENTAS_SECRET` (mismo valor, sin incluirlo en código).
- **Encabezados:** `X-Integration-Id`, `X-Integration-Timestamp`, `X-Integration-Signature`.
- **Firma:** HMAC-SHA256 hexadecimal minúscula de los bytes UTF-8 `timestamp + "\nPOST\n" + apiPath + "\n" + payloadTexto`.
- Se debe **enviar exactamente el mismo `payloadTexto`** que se firmó, sin serializar de nuevo.
- No son necesarios nuevos ID/secrets, siempre que los existentes de Ventas funcionen.

**Ejemplo de cuerpo para un solo registro:**

```json
{
  "tipo": "MONTADOR",
  "nombre": "Juan Perez Ejemplo",
  "contratista": "Contratista Ejemplo",
  "puesto": "Mecánico",
  "categoria": "A"
}
```

Para `AJUSTADOR`, no enviar contratista ni puesto; se admite `experiencia`. El backend valida las reglas y devuelve `201` para creación, `400` para datos inválidos, `401` para autenticación M2M fallida, `409` si ya existe una persona activa equivalente y `503` cuando falta la estructura SQL.

**Google Sheets:** si la columna de origen se denomina `tipo_personal`, el emisor GAS debe mapearla a `tipo` antes del POST. Se envía **una persona por solicitud**; el backend **no** acepta aquí un lote `registros: []`. Si se reenvía un registro existente, `409` **no implica** una actualización automática.

## 4. Condiciones de seguridad / control

- Si hay **cualquier** encabezado M2M, una firma parcial o incorrecta **no** puede retroceder al flujo JWT.
- La verificación M2M es obligatoria en INT-9, con independencia del switch global `INTEGRATION_AUTH_ENABLED`.
- Solo la identidad M2M configurada para Ventas tiene permiso en esta ruta. Otras integraciones son rechazadas.
- JWT sigue pasando por el Guard y permisos humanos ya existentes.
- El permiso M2M **no** concede automáticamente `PUT`, `DELETE`, asignaciones o lecturas protegidas.
- Se reutiliza una credencial que también permite operaciones de Ventas: **compartir identidad amplía el alcance de esa credencial**. Es una elección explícita para esta integración; no equivale a una identidad exclusiva del módulo.
- **Auditoría:** al ser una máquina, las FKs `created_by`/`updated_by` quedan en `NULL`; el log registra el ID técnico de integración, ID generado y tipo. Este FIX **no** incorpora auditoría persistente de M2M en Aiven. Si se exige para operación definitiva, requiere una decisión complementaria de diseño.

## 5. Prerrequisitos / verificación antes de aplicar

1. Confirmar que los archivos originales locales no tienen cambios pendientes y corresponden a la referencia del `main` auditado.
2. Confirmar las variables ya existentes `INTEGRATION_VENTAS_ID=ventas-appscript` e `INTEGRATION_VENTAS_SECRET` en Azure **sin revelar el valor**.
3. Confirmar que Apps Script usa el mismo valor de secreto en Script Properties.
4. Verificar que `instalaciones_personal` existe en **Aiven real** y que el usuario SQL del backend tiene `INSERT` y `SELECT`. **No puedo confirmar esto con el repositorio solamente.**
5. Validar que la ruta realmente está desplegada en Azure antes de enviar filas reales.

### Instalación manual, sin instaladores ni `.patch`

El ZIP conserva las rutas del repositorio. Extraerlo **fuera** de la carpeta del repo, comparar los dos archivos originales y copiar únicamente los cuatro archivos indicados en el manifiesto. **No ejecutar `git push` ni publicar sin autorización.**

Ejemplo de prevalidación en PowerShell (adaptar `$REPO` a la carpeta local):

```powershell
$REPO = 'C:\ruta\al\repositorio'
Set-Location $REPO

git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer origin.' }
if ((git rev-parse origin/main).Trim() -ne '7f497d121eb26ec6a121140a19c334c6e16d57ab') {
  throw 'main cambio desde la auditoria: volver a comparar antes de aplicar.'
}

$R = 'backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js'
$S = 'backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js'
if ((git hash-object $R).Trim() -ne '7db5c90164db48d087da54bc20a48e809ee6eb6f') {
  throw 'El archivo ROUTES local no coincide con main auditado.'
}
if ((git hash-object $S).Trim() -ne '4339fac84edcb6951b30faf65aa8fbf659a6a6b5') {
  throw 'El archivo SERVICE local no coincide con main auditado.'
}

if (Test-Path 'tests/instalaciones-programacion-personal-m2m.test.js') {
  throw 'Ya existe una prueba con el nombre del entregable: revisar antes de sobrescribir.'
}
if (Test-Path 'docs/ADR_20261020_INT9_PERSONAL_M2M_HMAC_V001.md') {
  throw 'Ya existe el ADR: revisar antes de sobrescribir.'
}

Write-Host 'Prevalidación correcta. Copiar ahora manualmente los cuatro archivos del entregable a sus mismas rutas.'
```

**Después de copiar manualmente los archivos:**

```powershell
git diff --check
node --check backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js
node --check backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js
node --check tests/instalaciones-programacion-personal-m2m.test.js
node --test tests/instalaciones-programacion-personal-m2m.test.js
git status --short
git diff --stat
```

Si las pruebas son correctas y se aprueba el cambio, realizar **solo un commit local** de los cuatro archivos. `git push origin main` no forma parte de esta entrega: el workflow de GitHub puede disparar el despliegue automático del backend en Azure.

## 6. Reversión segura

**Antes del commit**, si no existían cambios propios previos en los dos archivos modificados:

```powershell
git restore -- backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js
Remove-Item 'tests/instalaciones-programacion-personal-m2m.test.js'
Remove-Item 'docs/ADR_20261020_INT9_PERSONAL_M2M_HMAC_V001.md'
```

No ejecutar los comandos de reversión sobre trabajo ajeno o archivos previos no verificados. El retorno a la versión base **no requiere cambios SQL**.

## 7. Validaciones reales de esta entrega

- Origen comparado con `main` actual en el momento de preparar el FIX; hashes Git exactos verificados.
- Sintaxis `node --check` de los tres archivos JS: correcta.
- `node --test tests/instalaciones-programacion-personal-m2m.test.js`: **17 de 17** correctas.
- Entorno de las pruebas: Node.js `v22.16.0`, rutas HTTP simuladas y DB en memoria, usando el **middleware HMAC real** del repositorio auditado.
- Sin acceso real a Azure/App Service/Aiven ni validación E2E; pendiente smoke HTTP y una inserción controlada tras despliegue autorizado.

## 8. Contenido y no contenido

Incluye **dos archivos backend completos modificados**, **una prueba nueva**, **un ADR nuevo**, además de este README, manifiesto, validación y SHA-256 de integridad. No incluye el proyecto completo, datos personales operativos, secrets de producción, instaladores, `.patch`, respaldos ni migraciones.
