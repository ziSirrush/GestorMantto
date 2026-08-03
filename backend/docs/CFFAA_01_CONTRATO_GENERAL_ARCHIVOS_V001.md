# CFFAA-01 — Contrato general de archivos V001

## Alcance entregado

Esta entrega contiene CFFAA-01A, CFFAA-01B, CFFAA-01C y CFFAA-01D. Es acumulativa sobre CFFAA-00.

No unifica tablas ni cambia todavía los formularios funcionales de Home, Soporte, Prospección o Cotizaciones.

## CFFAA-01A — Política y validación común

Se agregó `storage-file-policy.service.js` con:

- límite por archivo basado en `AZURE_STORAGE_MAX_FILE_MB`;
- límite total por petición basado en `CFFAA_STORAGE_MAX_REQUEST_MB`;
- políticas `GENERAL`, `IMAGE` y `DOCUMENT`;
- saneamiento de nombres;
- extensiones permitidas y bloqueadas;
- comparación de MIME y extensión;
- validación de firmas para JPEG, PNG, GIF, WEBP, HEIF/HEIC, AVIF, PDF, ZIP, Office binario, RTF y texto;
- SVG, HTML, scripts, ejecutables e instaladores bloqueados;
- disposición `inline` solo para imágenes web seguras y PDF; los demás archivos usan `attachment`.

La validación de firma reduce archivos renombrados, pero no sustituye un antivirus.

## CFFAA-01B — Servicio general

`azure-storage.service.js` ahora:

- utiliza la política común;
- conserva rutas por empresa, módulo y entidad;
- normaliza nombre, MIME y extensión antes de subir;
- reutiliza temporalmente la User Delegation Key;
- genera SAS sin consultar la existencia del blob por defecto;
- permite verificar existencia mediante `verifyExists: true`;
- programa una eliminación pendiente si Azure falla al borrar;
- conserva Managed Identity en Azure y `DefaultAzureCredential` en local.

Se agregó `storage-contract.service.js` para que las fases posteriores puedan ejecutar:

```text
subir a Azure
→ persistir en Aiven
→ eliminar o encolar el blob si Aiven falla
```

También incluye sustitución segura: primero se confirma el archivo nuevo y después se elimina el anterior.

## CFFAA-01C — Middleware multipart común

Se agregó `storage-upload.middleware.js`:

- `multer.memoryStorage()` centralizado;
- cantidad máxima de archivos;
- tamaño por archivo;
- límite total de petición;
- límite de campos multipart;
- validación temprana de extensión y MIME;
- validación posterior de firma;
- traducción uniforme de errores de Multer.

El módulo técnico de diagnóstico Azure ya utiliza este middleware. Los módulos funcionales lo adoptarán en sus fases específicas.

## CFFAA-01D — Operaciones pendientes

Se agregó la tabla técnica:

```text
storage_operaciones_pendientes
```

Su única función inicial es reintentar `ELIMINAR_BLOB`. No almacena relaciones funcionales ni reemplaza las tablas de adjuntos.

El job:

- reclama operaciones con bloqueo `FOR UPDATE SKIP LOCKED`;
- evita que dos instancias procesen la misma operación;
- recupera operaciones estancadas en `PROCESANDO`;
- utiliza reintento exponencial;
- marca `DESCARTADA` al agotar intentos;
- considera completada la eliminación aunque el blob ya no exista.

## Archivos SQL

1. `backend/sql/20260803_CFFAA_01D_STORAGE_OPERACIONES_PENDIENTES.sql`
2. `backend/sql/20260803_CFFAA_01D_POSTFLIGHT.sql`

## Variables

```env
CFFAA_STORAGE_MAX_REQUEST_MB=50
CFFAA_STORAGE_FIELD_SIZE_MB=2
CFFAA_FILE_SIGNATURE_VALIDATION=true
AZURE_STORAGE_DELEGATION_KEY_MINUTES=60

CFFAA_STORAGE_RETRY_ENABLED=false
CFFAA_STORAGE_RETRY_INTERVAL_MS=60000
CFFAA_STORAGE_RETRY_BATCH_SIZE=20
CFFAA_STORAGE_RETRY_STALE_MINUTES=15
CFFAA_STORAGE_RETRY_MAX_ATTEMPTS=10
CFFAA_STORAGE_RETRY_BASE_SECONDS=60
CFFAA_STORAGE_RETRY_MAX_SECONDS=3600
```

`AZURE_STORAGE_DELEGATION_KEY_MINUTES` debe superar `AZURE_STORAGE_SAS_MINUTES` por al menos cinco minutos.

## Orden de aplicación

1. Mantener `CFFAA_STORAGE_RETRY_ENABLED=false`.
2. Ejecutar `20260803_CFFAA_01D_STORAGE_OPERACIONES_PENDIENTES.sql`.
3. Ejecutar `20260803_CFFAA_01D_POSTFLIGHT.sql`.
4. Configurar las variables nuevas en Azure y `.env` local.
5. Publicar los archivos backend.
6. Ejecutar `npm run check`.
7. Ejecutar `node scripts/validate-cffaa-01.js`.
8. Validar `/api/health` y `/api/azure-storage/status` con sesión autorizada.
9. Activar `CFFAA_STORAGE_RETRY_ENABLED=true`.
10. Reiniciar App Service y confirmar el log del job.

## Logs esperados

Con el job desactivado:

```text
CFFAA-01D: job de operaciones pendientes de Storage inactivo por configuración.
```

Con el job activado:

```text
CFFAA-01D: job de operaciones pendientes activo cada 60000 ms.
```

## Compatibilidad

- No cambia `package.json` ni `package-lock.json`.
- No modifica las tablas funcionales existentes.
- Las cargas actuales que ya llaman `uploadPrivate_gnral` reciben validación común.
- Los flujos Base64 permanecen hasta CFFAA-02, pero sus buffers ya se validan antes de subir.
- Los Multer propios de Soporte, Prospección y Cotizaciones se migrarán en sus fases; mientras tanto, el manejador global ya normaliza sus errores.

## Rollback

El código puede revertirse copiando la versión anterior de los archivos modificados.

No se recomienda eliminar la tabla técnica durante un rollback. Si fuese indispensable, primero debe verificarse que no existan operaciones `PENDIENTE`, `PROCESANDO` o `ERROR`.

---

## Ampliación CFFAA-01E — SAS bajo demanda

Se agregó un contrato reutilizable que obliga a cada módulo a resolver y autorizar el archivo desde su propia tabla funcional antes de emitir una SAS.

Piezas nuevas:

- `storage-reference.service.js`: normaliza proveedor, contenedor, blob, estado y metadatos.
- `storage-access.service.js`: valida sesión, ejecuta la autorización del módulo y genera la SAS.
- `storage-access-handler.service.js`: fábrica de handlers Express para las fases específicas.

Regla no negociable:

```text
id funcional del archivo
→ consultar tabla del módulo
→ validar usuario contra la entidad
→ normalizar referencia Azure
→ generar SAS temporal
```

No se creó un endpoint público que reciba directamente `blob_name`. La ruta técnica que sí lo permite permanece protegida por Programador y `AZURE_STORAGE_DIAGNOSTICS_ENABLED=true`.

Los accesos registran actor, usuario contextual, módulo, entidad y blob, pero nunca imprimen la URL firmada ni su parámetro `sig`.

Variables nuevas:

```env
CFFAA_STORAGE_ACCESS_VERIFY_EXISTS=false
CFFAA_STORAGE_ACCESS_AUDIT_LOG=true
```

`verifyExists=false` evita una llamada adicional por apertura. Cada módulo puede forzar la verificación en su ruta cuando lo necesite.

## Ampliación CFFAA-01F — Diagnóstico y pruebas

Se agregó:

- diagnóstico estático del contrato;
- diagnóstico de Azure, esquema y cola técnica;
- prueba controlada de ciclo completo: cargar, generar SAS, verificar existencia y eliminar;
- pruebas automáticas sin publicar una SAS real;
- validación de referencias, contenedor, proveedor, archivo inactivo y autorización obligatoria.

Rutas técnicas, disponibles únicamente con sesión Programador y diagnóstico habilitado:

```text
GET  /api/azure-storage/diagnostico/contrato
POST /api/azure-storage/diagnostico/ciclo
```

La prueba de ciclo elimina el blob al terminar. Si la limpieza falla, usa la cola de CFFAA-01D.

Comandos de validación:

```bash
npm run check
node scripts/validate-cffaa-01.js
node scripts/validate-cffaa-01ef.js
```

CFFAA-01E/F no modifica todavía los endpoints funcionales de Home, Soporte, Prospección o Cotizaciones. Esos módulos adoptarán el handler común en sus fases específicas.
