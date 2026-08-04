# CFFAA-01E/01F — SAS bajo demanda, diagnóstico y pruebas V001

## Encontrado

CFFAA-01A-D ya centralizaba validación, subida, compensación, multipart y reintentos de eliminación. Faltaba un contrato que impidiera emitir SAS sin autorización funcional del módulo y faltaban pruebas técnicas de referencia y ciclo completo.

## Cambiado

### CFFAA-01E

- Normalización estricta de referencias Azure.
- Rechazo de proveedores no Azure, contenedores distintos, blobs inválidos y registros inactivos.
- Autorizador obligatorio proporcionado por cada módulo.
- Fábrica reutilizable de handlers Express.
- Disposición automática `inline` o `attachment` según MIME.
- Auditoría sin imprimir URLs firmadas.
- Sin endpoint público por nombre de blob.

### CFFAA-01F

- Snapshot seguro de política, límites, Azure, esquema y cola.
- Ruta técnica de diagnóstico del contrato.
- Ruta técnica de ciclo `subir → SAS → verificar → eliminar`.
- Limpieza compensatoria y cola CFFAA-01D ante fallo de eliminación.
- Script `validate-cffaa-01ef.js`.
- Scripts `validate-cffaa-01.js` y `validate-cffaa-01ef.js`.

## Variables

```env
CFFAA_STORAGE_ACCESS_VERIFY_EXISTS=false
CFFAA_STORAGE_ACCESS_AUDIT_LOG=true
```

Se conserva:

```env
AZURE_STORAGE_DIAGNOSTICS_ENABLED=false
```

Solo debe cambiarse temporalmente a `true` para ejecutar rutas técnicas, y regresar a `false` al terminar.

## Validación local

```bash
npm run check
node scripts/validate-cffaa-01.js
node scripts/validate-cffaa-01ef.js
npm start
```

## Validación publicada

1. Mantener `AZURE_STORAGE_DIAGNOSTICS_ENABLED=false` durante el despliegue normal.
2. Validar `/api/health` y `/api/azure-storage/status`.
3. Para prueba técnica controlada, activar temporalmente `AZURE_STORAGE_DIAGNOSTICS_ENABLED=true` y reiniciar.
4. Consultar `GET /api/azure-storage/diagnostico/contrato` con una sesión Programador.
5. Enviar un archivo pequeño por `POST /api/azure-storage/diagnostico/ciclo`, campo multipart `archivo`.
6. Confirmar `completed=true` y que no quede blob temporal.
7. Regresar `AZURE_STORAGE_DIAGNOSTICS_ENABLED=false` y reiniciar.

## Fuera de alcance

- Cambiar Home de Base64 a multipart.
- Crear endpoints funcionales de acceso en módulos.
- Modificar Soporte, Prospección o Cotizaciones.
- Migrar históricos.
- Unificar tablas.
