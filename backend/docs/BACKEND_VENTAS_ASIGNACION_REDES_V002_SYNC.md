# Mantto Gestor - Ventas > Asignacion a Redes

Version: V002 Sync
Estado: Desarrollo / pendiente de despliegue y prueba contra Aiven

## Objetivo

Agregar la importacion historica de las hojas 7 y 8 al backend de Asignacion a Redes, conservando los encabezados oficiales y las cuatro tablas ya creadas.

## Endpoints nuevos

```text
POST /api/ventas/redes/sync
POST /api/ventas/redes/comentarios/sync
```

Ambos endpoints requieren:

1. Token Bearer valido.
2. Usuario con rol Programador, Programador United o Programador Corellian.
3. Variable temporal `CFFAA_HISTORICAL_SYNC_ENABLED=true`.

Al terminar la importacion debe restaurarse:

```text
CFFAA_HISTORICAL_SYNC_ENABLED=false
```

## Hojas y tablas destino

### Hoja 7

```text
ventas_redes
ventas_redes_archivos
```

Encabezados exactos:

```text
id_redes
nombre_contacto
id_contacto_via
email
telefono
id_estado
nombre_empresa
ciudad
nombre_proyecto
informacion_enviada
id_solicitud
id_usuario_asignado
created_by
id_estatus
imagen_1_url
imagen_2_url
fecha_cambio_estatus
id_cotizacion
```

### Hoja 8

```text
ventas_redes_comentarios
ventas_redes_comentarios_adjuntos
```

Encabezados exactos:

```text
id_comentario
id_redes
id_usuario
comentario
fecha_hora
archivo_adjunto_url
```

## Reglas de normalizacion

- Las celdas vacias se convierten a `null`.
- `id_redes` es obligatorio para la importacion de la Hoja 7 porque conserva el ID historico.
- `id_comentario` e `id_redes` son obligatorios en la Hoja 8 para conservar la relacion historica.
- Los demas campos funcionales pueden quedar vacios.
- Los IDs opcionales deben ser enteros positivos cuando tengan valor.
- Los correos se normalizan a minusculas sin rechazar formatos historicos.
- Las fechas aceptan ISO UTC, por ejemplo `2025-06-21T22:04:00.152Z`.
- Si `fecha_hora` esta vacia, permanece `NULL` y `created_at` toma la fecha de importacion.
- `updated_by` de `ventas_redes` registra al Programador que ejecuto la sincronizacion.
- Las URLs historicas deben comenzar con `https://storage.googleapis.com/`.
- El backend procesa internamente lotes de 300 registros y usa una transaccion por lote.
- La carga es repetible mediante UPSERT; no genera duplicados en `ventas_redes` ni en comentarios.

## Validacion de relaciones

- `id_contacto_via` debe pertenecer a `catalogo_general\Ventas\Tipo Contacto\`.
- `id_estado` debe pertenecer a `catalogo_general\General\Estado\`.
- `id_solicitud` debe pertenecer a `catalogo_general\Ventas\Soli Red\`.
- `id_estatus` debe pertenecer a `catalogo_general\Ventas\Estatus Pros\`.
- `id_usuario_asignado`, `created_by` e `id_usuario` deben existir en `usuarios.id_SB` cuando tengan valor.
- Los usuarios historicos pueden estar inactivos; se valida su existencia para no perder trazabilidad.
- `id_cotizacion` debe existir en `ventas_cotizaciones_cor` y tener `activo = 1`.
- Los comentarios se cargan solo cuando su `id_redes` ya existe.

## Archivos historicos y Azure

La importacion no descarga archivos de Google Storage ni los sube inmediatamente a Azure.

Las referencias historicas se guardan como:

```text
storage_provider = GLIDE
storage_url = URL original
```

Mapeo de evidencias:

```text
imagen_1_url -> orden_archivo = 1
imagen_2_url -> orden_archivo = 2
```

Reglas de proteccion:

- Una evidencia existente con `storage_provider = AZURE_BLOB` nunca se reemplaza por una URL historica.
- Un adjunto Azure existente nunca se reemplaza por el respaldo.
- Las referencias GLIDE pueden actualizarse o eliminarse al repetir la sincronizacion.
- No se almacena Base64 ni contenido binario en MySQL.

La migracion fisica de GLIDE a Azure debe hacerse en una etapa independiente y controlada.

## Script de Google Apps Script

Archivo:

```text
google-apps-script/IMPORTAR_VENTAS_REDES_HOJAS_7_Y_8.gs
```

Funcion principal:

```text
enviarRedesYComentariosAiven
```

El script envia primero la Hoja 7 y despues la Hoja 8.

### Script Properties

Obligatoria:

```text
MANTTO_GESTOR_API_TOKEN
```

Debe contener un token Bearer vigente de un usuario Programador. No debe escribirse dentro del codigo.

Opcional:

```text
MANTTO_GESTOR_API_BASE_URL
```

Debe contener solo la raiz del backend, sin `/api` al final. Si no se configura, el script usa la URL incluida como referencia en el script de Prospeccion proporcionado.

## Archivos nuevos

```text
backend/src/modules/ventas-redes/ventas-redes-sync.repository.js
backend/src/modules/ventas-redes/ventas-redes-sync.service.js
google-apps-script/IMPORTAR_VENTAS_REDES_HOJAS_7_Y_8.gs
BACKEND_VENTAS_ASIGNACION_REDES_V002_SYNC.md
```

## Archivos modificados

```text
backend/src/modules/ventas-redes/ventas-redes.controller.js
backend/src/modules/ventas-redes/ventas-redes.routes.js
backend/scripts/validate-structure.js
```

El ZIP V002 tambien conserva de forma acumulativa los archivos de la V001 que crean la backend base de Asignacion a Redes.

## SQL requerido

No se incluye SQL adicional. Las tablas ya fueron creadas y confirmadas:

```text
ventas_redes
ventas_redes_archivos
ventas_redes_comentarios
ventas_redes_comentarios_adjuntos
```

## Secuencia de despliegue y carga

1. Publicar la backend acumulativa V002.
2. Confirmar `/api/health`.
3. Configurar temporalmente `CFFAA_HISTORICAL_SYNC_ENABLED=true`.
4. Crear las Script Properties del Apps Script.
5. Verificar los encabezados exactos de Hoja 7 y Hoja 8.
6. Ejecutar `enviarRedesYComentariosAiven`.
7. Revisar `processed`, `rejected`, `inserted`, `updated` y `errors` en los logs.
8. Validar conteos y relaciones en MySQL.
9. Restaurar `CFFAA_HISTORICAL_SYNC_ENABLED=false`.

## Validaciones realizadas

- Sintaxis Node.js de todos los archivos nuevos y modificados.
- `npm run check` sobre la estructura completa.
- Carga e inventario del router de Redes.
- Confirmacion de los dos endpoints `/sync`.
- Pruebas aisladas de normalizacion.
- Prueba aislada de rechazo por ruta de catalogo incorrecta.
- Prueba aislada de preservacion de evidencias y adjuntos Azure.
- Sintaxis JavaScript del archivo de Google Apps Script.

## Riesgos conocidos

- No se ejecuto la importacion contra Aiven productivo.
- No se hicieron descargas reales desde Google Storage.
- No se hicieron cargas reales a Azure; esta importacion conserva enlaces historicos.
- Un token JWT puede expirar durante una importacion larga; debe usarse uno vigente.
- Si el JSON completo supera `JSON_LIMIT` del backend o limites de Google Apps Script, sera necesario dividir la ejecucion en bloques desde Apps Script. El backend ya procesa los registros recibidos en lotes internos de 300.
- Los registros validos de un lote se confirman aunque otros registros sean rechazados por reglas funcionales. La respuesta devuelve `ok=false` cuando existe al menos un rechazo y detalla las filas afectadas.
