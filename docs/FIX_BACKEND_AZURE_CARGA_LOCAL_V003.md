# FIX_BACKEND_AZURE_CARGA_LOCAL_V003

## Causa
El servicio de Azure Storage cargaba `@azure/identity` y `@azure/storage-blob` al iniciar el backend. Si las dependencias aún no estaban instaladas en `node_modules`, todo el servidor terminaba con `MODULE_NOT_FOUND`, incluso aunque no se usaran rutas de Azure.

## Cambio
- Se cambió la carga del SDK de Azure a carga diferida.
- El backend puede iniciar sin esas dependencias instaladas.
- Las rutas ajenas a Azure continúan disponibles.
- Si se intenta usar `/api/azure-storage` sin instalar el SDK, la API responde 503 con un mensaje claro.
- No se modificaron rutas, tablas, controladores ni variables de entorno.

## Archivo modificado
- `backend/src/services/storage/azure-storage.service.js`

## Validaciones
- `node --check src/services/storage/azure-storage.service.js`
- carga directa del servicio sin SDK Azure instalado
- `npm run check`

## Nota
Para utilizar realmente Azure Storage en localhost todavía debe ejecutarse dentro de `backend`:

```bash
npm install
```

El FIX evita que la ausencia temporal del SDK derribe todo el backend, pero no sustituye la instalación de las dependencias necesarias para operar Azure Storage.
