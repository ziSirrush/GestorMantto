# Mantto Gestor — FIX 3 / Integracion y QA final del autoguardado V001

**Fecha:** 09/10/2026  
**Paquete:** `FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001`  
**GitHub oficial verificado:** `ziSirrush/GestorMantto` · `main` · commit `2e516699c42f870b730bbee712b437e72e9f4d8d` · `Version 100926.4` (09/10/2026).  
**Base funcional:** superponer **FIX 1 Edicion Total Backend V001** y **FIX 2 Autoguardado V001** sobre el codigo oficial, en ese orden. La comprobacion del commit NO demuestra que estos dos ZIP esten desplegados en Azure/Netlify.

## 1. Diagnostico y cambio puntual

El FIX 2 ya realizaba PATCH de **un campo por vez** y GET inmediato para confirmar. La revision final detecto dos riesgos:

1. **Borrado involuntario de dato historico:** un valor almacenado como fecha/numero legado puede ser mostrado como input vacio porque el navegador no admite el formato original. Antes, un mero `blur` sin captura podia interpretarse como cambio a `NULL`. Ahora un guardado requiere un evento real `input` / `change` (o la accion explicita **Vaciar campo**). Un focusout sin edicion nunca escribe.
2. **Perdida de cambios concurrentes:** tras confirmar un PATCH, el GET traia el valor mas reciente de otros campos, pero la UI podia seguir mostrando datos previos. Si el usuario modificaba un control desactualizado, el `expected` podia avanzar al valor nuevo que **nunca vio**, permitiendo una sobreescritura silenciosa. Ahora se conserva un `baseline` por campo; un campo sin cambios/foco se sincroniza con el GET, mientras que un borrador se conserva con `expected` original y obtiene conflicto 409 si el servidor cambio el dato.

**Se conserva sin cambios:** autorizacion por ACCESO_VISUAL + EDITAR global del FIX 1, Guard CORELLIAN, record scope, auditoria atomica, 93 campos operativos editables, 3 campos tecnicos protegidos, sin botones Editar/Guardar individual y **edicion multiple solo mismo proyecto con confirmacion manual**.

## 2. Archivos entregados (codigo solo del modulo, pruebas y QA)

```text
modules/instalaciones-administracion/instalaciones-administracion_cor.js

tests/instalaciones-administracion-fase3-frontend-base.test.js
tests/instalaciones-administracion-fase4-formularios-guardado.test.js
tests/instalaciones-administracion-fase5-integracion-qa.test.js
tests/instalaciones-administracion-edicion-fantasma-v001.test.js
tests/instalaciones-administracion-fix3-autoguardado-integracion-v001.test.js
tests/instalaciones-administracion-fix3-readonly-qa-v001.test.js
validation/instalaciones-administracion-fix3-autoguardado-readonly.js
database/QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_SOLO_LECTURA_V001.sql
docs/MATRIZ_QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.md
ACTUALIZAR_CACHE_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
EJECUTAR_QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
README_FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001.md
MANIFEST_FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001.txt
SHA256SUMS_FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001.txt
```

Las 4 pruebas de frontend heredadas se actualizaron porque aun afirmaban flujos antiguos (guardar ficha con boton/version anterior) y daban falsos negativos con el comportamiento ya aprobado. **No se sobrescriben** `index.html`, `core/module-loader.js`, otras vistas, backend, GAS ni tablas. Los scripts de cache **solo** cambian dos tokens locales.

## 3. Instalacion local y verificaciones

1. **Antes de extraer o sobrescribir**, en el clon correcto: `git status --short`, `git rev-parse HEAD`. Revisar trabajo local: un ZIP no debe pisar modificaciones ajenas. Si `main` avanzo desde el commit verificado o el modulo cambio, detener y reconciliar.
2. Confirmar que FIX 1 y FIX 2 ya estan aplicados y el codigo de FIX 2 esta intacto. El hash Git **antes** de sustituir `modules/instalaciones-administracion/instalaciones-administracion_cor.js` debe ser `c18ace5c7caa97457de2af838a9f829a7d7d3132` (`git hash-object ...`), identificado en el ZIP FIX 2. No extraer sobre un archivo distinto sin revisar diff.
3. Extraer el FIX 3 en la raiz del repositorio, conservando estructura y sustituyendo solo los archivos listados. No aplicar SQL de escritura: el SQL incluido es **solo SELECT**. El permiso global del FIX 1 debe estar registrado y asignado desde Panel de Control para los usuarios aprobados; no se asigna aqui.
4. En **PowerShell**, desde la raiz del repositorio:

```powershell
& .\ACTUALIZAR_CACHE_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
& .\EJECUTAR_QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
git status --short
git diff --check
git diff -- modules/instalaciones-administracion/instalaciones-administracion_cor.js core/module-loader.js index.html
```

`ACTUALIZAR_CACHE...ps1` valida prerequisitos y un unico token por archivo; cambia SOLO la URL versionada del JS en `core/module-loader.js` y la del propio loader en `index.html`: de `20261009-instalaciones-administracion-autoguardado-fix2-v001` a `20261009-instalaciones-administracion-autoguardado-fix3-qa-v001`. Rechaza tokens desconocidos, es idempotente e intenta restaurar ambos archivos si falla una escritura. NO modifica el backend ni el cache de otros modulos.

## 4. QA remoto de solo lectura OPCIONAL

Con autorizacion y **JWT de un usuario de QA con ACCESO_VISUAL + EDITAR global** (no usar tokens productivos compartidos ni publicarlos):

```powershell
$env:MANTTO_QA_TOKEN = '<JWT_AUTORIZADO_DE_QA>'
# Opcionales, JWT validos con los permisos realmente indicados:
$env:MANTTO_QA_READONLY_TOKEN = '<JWT_ACCESO_VISUAL_SIN_EDITAR>'
$env:MANTTO_QA_DENIED_TOKEN = '<JWT_SIN_ACCESO>'
node .\validation\instalaciones-administracion-fix3-autoguardado-readonly.js --readonly --base-url https://TU_API_AZURE.azurewebsites.net --record-id 123 --denied-record-id 999
```

IDs son **solo ejemplos**, elegir registros autorizados para QA y un ID deliberadamente fuera de scope. Se admiten credenciales adicionales de dispositivo mediante `MANTTO_QA_DEVICE_TOKEN`. El script solo hace GET, valida contrato/93 campos/proyeccion/alcance y **nunca muestra valores ni secretos**. Los casos sin tokens o IDs opcionales son `NO EJECUTADO`. No prueba escritura ni rollback real.

`database/QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_SOLO_LECTURA_V001.sql` contiene exclusivamente SELECTs para ejecutar **manualmente** por una cuenta de lectura; no aplica permisos ni tablas.

## 5. Pruebas y limites

- Se contrasto la rama oficial y el ZIP del FIX 2; `node --check` del JS y el smoke. Se ejecutaron **146/146 pruebas offline** con DOM/API/BD simulados y stubs minimos de core para cubrir contratos en este ambiente aislado. **NO se ejecutaron contra el clon completo**; el PS1 del paquete vuelve a ejecutar las suites contra el clon real.
- No se ejecuto PowerShell en Windows, Azure, Aiven real, sincronizacion GAS, pruebas E2E de escritura/auditoria/transacciones ni pruebas visuales reales de PWA. **No puedo confirmar esto** sin esas evidencias.
- QA real pendiente P0: conflictos simultaneos, valor legado, solo-lectura/scope, limpieza tras revocacion de acceso, auditoria antes y despues, rollback, lotes 2–20 mismo proyecto. Ver `docs/MATRIZ_QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.md`.
- **No declarar liberacion productiva** hasta completar QA local y GitHub Pages y aprobar manualmente la promocion de Netlify; backend solo en Azure.

**Escrituras externas:** ninguna. **No** se modificaron GitHub, Aiven, Azure, Netlify ni GAS. Se crearon archivos locales del ZIP.
