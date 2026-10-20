# BLT NOW | Instalaciones > Administracion | Altas Fase 1 V001

Fecha: 20/10/2026. Entrega: backend solamente, sin desplegar.
Fuente de codigo oficial: `ziSirrush/GestorMantto`, `main` comprobado en commit `e6ff69a39343a77583f7bc1f7a254c2661de5883`.
Estructura revisada: `Sabana Estrutura 071026.sql`, tabla existente `ins_fl` (respaldo historico; no sustituye Aiven actual).

## Cambios

* **POST** `/api/instalaciones/administracion/altas`: acepta `{ "rows": [ {...}, ... ] }` con **1 a 20 equipos**, del mismo o de distintos proyectos.
* Requiere por equipo `proyecto`, `id_proyecto` (PP NS) y `referencia_sitio`. Los demas campos manuales admiten `NULL` siempre que su validacion real lo permita. `id_ins_fl` lo genera MySQL y `activo` se fija en `1`.
* Reutiliza los 11 grupos de campos del contrato existente, normalizaciones vigentes de fechas, porcentajes, montos, estatus y responsables, sin crear tablas ni columnas.
* No permite que el navegador establezca IDs tecnicos, campos de sistema, calculados ni los cinco campos reservados para las formulas de Fase 3 (`meses_garantia_restantes`, `fecha_fin_montaje_real`, `fecha_fin_ajuste_real`, `anio_termino`, `costo_mensual_mantenimiento_cem`). Se siguen calculando solo los derivados existentes del backend (`estatus_completo`, `dias_sin_visita`, `dias_sin_ccnr`, `dias_restantes`) conforme a sus reglas ACTUALES; no se anticipan formulas del Excel.
* Usa **Guard CORELLIAN** existente, permiso `...EDITAR` y `resolveVisibilityScope`; un usuario limitado solo puede crear registros con `id_asesor`, `id_sup` o `id_admin` vinculado a uno de sus usuarios visibles. Los responsables provienen exclusivamente de las iniciales validas por catalogo; la API no acepta FKs manuales. El modo Visor no crea registros.
* Detecta duplicados por `(id_proyecto, referencia_sitio)` dentro del lote y en MySQL; rechaza PPNS compartido por nombres de proyecto distintos. Se conservan las restricciones UNIQUE/FK vigentes de `ins_fl`.
* **Una transaccion por lote**: inserta, relee por PK y audita **cada equipo** con `tipo_interaccion=CREAR`, `metodo_http=POST`, usando la misma conexion MySQL. Si falla cualquier fila, permisos, validacion, BD o auditoria, hace `ROLLBACK` de todos los equipos.
* Responde solo con los IDs creados y conteo, sin devolver fichas completas; la futura Fase 4 recargara los equipos autorizados mediante GET al confirmar.

## Archivos entregados (rutas relativas a la raiz del repo)

1. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` **modificado completo** (agrega solo POST con el Guard existente).
2. `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js` **nuevo**.
3. `backend/tests/instalaciones-administracion-altas-fase1.test.js` **nuevo**.
4. Este README.

No hay instalador, archivo `.patch`, ALTER ni scripts de mutacion SQL.

## Ejemplo de contrato (NO ejecutar contra Produccion)

```http
POST /api/instalaciones/administracion/altas
Content-Type: application/json
Authorization: Bearer <TOKEN_VALIDO>
```

```json
{
  "rows": [
    {"proyecto":"Proyecto A","id_proyecto":"P90001","referencia_sitio":"Elevador 1","tipo_equipo":"ELEVADOR","cliente":null,"estatus":"02-OC"},
    {"proyecto":"Proyecto A","id_proyecto":"P90001","referencia_sitio":"Elevador 2","tipo_equipo":null,"cliente":null,"estatus":null},
    {"proyecto":"Proyecto B","id_proyecto":"P90002","referencia_sitio":"Escalera 1","marca":null}
  ]
}
```

Resultado esperado en una prueba controlada y autorizada: `201`, `ok:true`, `created:3`, `records:[{id_ins_fl:...}]`; conflicto `409`, payload invalido `400`, sin autorizacion `403`.

**ATENCION:** el ejemplo solo ilustra formato, **no constituye datos reales**. No mandarlo a Aiven sin ambiente controlado y respaldo.

## Aplicacion local (PowerShell, NO publica)

Antes de aplicar, revisa el estado real del checkout. El `main` puede haber avanzado y deben conciliarse cambios si no coincide la base:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\BLTNOW_FASE1_ALTAS_INSTALACIONES_ADMIN_V001.zip"
Set-Location $REPO
$BASE = 'e6ff69a39343a77583f7bc1f7a254c2661de5883'
if ((git rev-parse HEAD).Trim() -ne $BASE) { throw 'Base diferente: conciliar antes de aplicar.' }
$RUTA = 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'
if ((git hash-object $RUTA).Trim() -ne 'e2a340042a53ac2ca5f213b460f00d2c878105b5') { throw 'Rutas modificadas localmente: detener.' }
if (Test-Path 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js') { throw 'Archivo altas ya existe: detener.' }
if (Test-Path 'backend/tests/instalaciones-administracion-altas-fase1.test.js') { throw 'Prueba altas ya existe: detener.' }
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
node --check backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
node --check backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js
node --test backend/tests/instalaciones-administracion-altas-fase1.test.js
if ($LASTEXITCODE -ne 0) { throw 'QA fallida: no continuar.' }
git diff --check
git status --short
git diff --stat
```

No ejecuta `git commit`, `git push`, deploy ni ALTER/INSERT en Aiven. Si el checkout es distinto, NO sobreescribir los archivos: actualizar la entrega respecto al commit real.

## Validaciones realizadas / pendientes

- **Comprobado en GitHub:** `main` commit `e6ff69a...`, Guard, permisos EDITAR, 11 grupos, validaciones, interacciones, rutas y alcance actual.
- **Comprobado contra sabana de estructura 07/10:** `ins_fl` admite NULL en gran parte de sus campos, tiene PK auto-incremental, UNIQUE (`id_proyecto`, `referencia_sitio`) y FK de responsables.
- **Validacion local aislada:** `node --check` de los dos JS y test, **23/23 pruebas simuladas** (`node --test`) correctas; sin conexion a MySQL real. Se verifico que la ruta base entregada coincide exactamente con su Git blob de GitHub, salvo el POST anadido.
- **NO ejecutado:** pruebas de integracion con backend completo, conexion a Aiven, autorizaciones reales, auditoria MySQL real, E2E y despliegue.

## Pendiente por fases

Fase 2: boton '+ Agregar nuevo', misma tabla completa y edicion fantasma con filas sin PK.
Fase 3: formulas del Excel `FieldLine Instalaciones.xlsx`; **pendiente decidir tratamiento de las fechas REAL (AR/BB)** sin inventar valores.
Fase 4: confirmacion del lote, recarga selectiva inmediata y convivencia segura con GAS. **La sincronizacion externa actual puede sobrescribir campos coincidentes por PP NS + referencia**: no habilitar altas productivas sin comprobar la politica de autoridad.
Fase 5: QA integrado y validacion final con copia restaurada y usuario autorizado.

**Estado de plataformas:** GitHub, Aiven, Azure y Netlify **sin modificaciones** por esta entrega.
