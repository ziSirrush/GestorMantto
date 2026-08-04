# CFFAA-06 — Conciliación, históricos y cierre

Versión: V001  
Proyecto: Mantto Gestor  
Estado de entrega: listo para migración y pruebas controladas

## Objetivo

Cerrar el ciclo CFFAA comparando las referencias funcionales de Aiven con los blobs privados de Azure, medir las operaciones de archivos y permitir una limpieza de huérfanos únicamente bajo control explícito.

CFFAA-06 no migra archivos históricos de Glide, Google Drive o rutas locales. Cualquier migración histórica requiere aprobación expresa y una fase independiente.

## Componentes

### Conciliación Aiven/Azure

Ruta técnica:

```http
GET /api/azure-storage/reconciliacion/resumen
```

Por defecto revisa referencias activas para el reporte Aiven sin blob. Puede incluir inactivas con `?include_inactive=1`. Para proteger la limpieza, cualquier fila con `storage_blob_name` se considera referencia defensiva, incluso si está inactiva o el proveedor histórico está mal etiquetado.

Reporta:

- referencias Azure en Aiven cuyo blob no existe;
- blobs de Azure sin referencia en las tablas funcionales;
- blobs ya programados en la cola de eliminación;
- blobs recientes todavía no clasificados como huérfanos;
- escaneo completo o parcial;
- fuentes funcionales revisadas.

Tablas incluidas:

- `pendientes_archivos`;
- `pendientes_comentarios_adjuntos`;
- `sup_adjuntos`;
- `ventas_prospeccion_archivos`;
- `ventas_cotizaciones_archivos`.

La conciliación considera también `storage_operaciones_pendientes` para no reportar como huérfano un blob que ya está pendiente de eliminación. Como protección adicional, cualquier fila que conserve `storage_blob_name` se trata como referencia defensiva aunque su proveedor histórico esté mal etiquetado; por tanto, CFFAA-06 no eliminará automáticamente los posibles casos `GOOGLE_DRIVE` que en realidad apunten a Azure.

### Inventario histórico

```http
GET /api/azure-storage/reconciliacion/inventario
```

Agrupa los registros por proveedor y tabla, conservando compatibilidad con:

- `AZURE_BLOB`;
- `GLIDE`;
- `GLIDE_STORAGE`;
- `GOOGLE_DRIVE`;
- `LOCAL`;
- registros sin proveedor histórico.

### Referencias `/uploads`

```http
GET /api/azure-storage/reconciliacion/uploads-legacy
```

Revisa:

- columnas de texto con referencias URL/ruta en Aiven;
- archivos físicos presentes en `backend/uploads`;
- condición segura para deshabilitar la ruta estática.

La ruta `/uploads` permanece habilitada por defecto:

```env
CFFAA_LEGACY_UPLOADS_ENABLED=true
```

Solo debe cambiarse a `false` cuando el reporte indique cero referencias y cero archivos locales, seguido de una prueba funcional completa.

### Métricas

Migración:

```text
backend/sql/20260803_CFFAA_06_STORAGE_EVENTOS.sql
```

Nueva tabla técnica:

```text
storage_eventos
```

Eventos registrados sin SAS, tokens ni credenciales:

- `UPLOAD_OK`;
- `UPLOAD_ERROR`;
- `ACCESS_OK`;
- `ACCESS_DENIED`;
- `ACCESS_ERROR`;
- `REJECTED`;
- `DELETE_OK`;
- `DELETE_ERROR`;
- `RECONCILIATION`;
- `ORPHAN_DELETE`.

Consulta:

```http
GET /api/azure-storage/reconciliacion/metricas?days=30
```

Activación después de ejecutar la migración:

```env
CFFAA_STORAGE_METRICS_ENABLED=true
```

### Limpieza controlada de huérfanos

Permanece deshabilitada por defecto:

```env
CFFAA_STORAGE_ORPHAN_DELETE_ENABLED=false
```

Para una ventana de limpieza autorizada:

1. Ejecutar el reporte de conciliación.
2. Revisar manualmente los candidatos.
3. Activar temporalmente `CFFAA_STORAGE_ORPHAN_DELETE_ENABLED=true`.
4. Enviar únicamente nombres de blobs aprobados:

```http
POST /api/azure-storage/reconciliacion/huerfanos/eliminar
Content-Type: application/json

{
  "confirmacion": "ELIMINAR_HUERFANOS_AZURE",
  "blob_names": [
    "united/modulo/entidad/1/archivo.pdf"
  ]
}
```

Antes de eliminar cada blob, el backend vuelve a comprobar:

- que no exista referencia en ninguna tabla funcional;
- que no esté ya pendiente en la cola técnica;
- que exista en Azure;
- que tenga al menos la antigüedad configurada;
- que no exceda el máximo de la petición.

Si Azure falla, la eliminación se envía a `storage_operaciones_pendientes`.

Al terminar, regresar la variable a `false` y reiniciar el App Service.

## Seguridad de rutas

Todas las rutas de conciliación requieren:

- sesión válida;
- rol Programador;
- `CFFAA_STORAGE_RECONCILIATION_ENABLED=true`.

Los diagnósticos de CFFAA-01F quedan ocultos en producción, incluso si su variable está activa, salvo una intervención temporal explícita:

```env
CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE=false
```

## Variables

```env
CFFAA_STORAGE_RECONCILIATION_ENABLED=false
CFFAA_STORAGE_RECONCILIATION_MAX_BLOBS=5000
CFFAA_STORAGE_RECONCILIATION_MAX_DB_CHECKS=1000
CFFAA_STORAGE_RECONCILIATION_SAMPLE_LIMIT=200
CFFAA_STORAGE_METRICS_ENABLED=false
CFFAA_STORAGE_ORPHAN_DELETE_ENABLED=false
CFFAA_STORAGE_ORPHAN_MIN_AGE_HOURS=24
CFFAA_STORAGE_ORPHAN_MAX_DELETE=50
CFFAA_LEGACY_UPLOADS_ENABLED=true
CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE=false
```

## Orden de aplicación

1. Respaldar Aiven.
2. Ejecutar `20260803_CFFAA_06_STORAGE_EVENTOS.sql`.
3. Ejecutar `20260803_CFFAA_06_POSTFLIGHT.sql`.
4. Aplicar los archivos del FIX.
5. Mantener inicialmente:

```env
CFFAA_STORAGE_RECONCILIATION_ENABLED=false
CFFAA_STORAGE_METRICS_ENABLED=false
CFFAA_STORAGE_ORPHAN_DELETE_ENABLED=false
CFFAA_LEGACY_UPLOADS_ENABLED=true
CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE=false
```

6. Ejecutar validadores.
7. Publicar backend.
8. Activar métricas y conciliación:

```env
CFFAA_STORAGE_RECONCILIATION_ENABLED=true
CFFAA_STORAGE_METRICS_ENABLED=true
```

9. Reiniciar y ejecutar inventario, conciliación y reporte `/uploads`.
10. No habilitar eliminación hasta revisar el reporte.

## Matriz mínima de pruebas

| Plataforma | Carga | Abrir SAS | Sustituir | Eliminar | Rechazo >25 MB | PWA |
|---|---:|---:|---:|---:|---:|---:|
| Windows / Chrome | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | N/A |
| Android / Chrome | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| iPhone / Safari | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Módulos que deben cubrirse:

- Home/Pendientes;
- Soporte;
- Prospección;
- Cotizaciones.

La fase se considera cerrada cuando:

- no existen referencias Azure activas incompletas;
- los casos Aiven sin blob están explicados o corregidos;
- los huérfanos aprobados fueron eliminados o quedaron en cola;
- `/uploads` permanece activo mientras tenga referencias;
- diagnósticos técnicos están deshabilitados en producción;
- la matriz Windows, Android e iPhone/PWA fue ejecutada.
