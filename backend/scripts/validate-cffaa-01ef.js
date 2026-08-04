const assert = require('assert');

process.env.AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'cuentaprueba';
process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME = process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || 'contenedor-prueba';
process.env.AZURE_STORAGE_SAS_MINUTES = process.env.AZURE_STORAGE_SAS_MINUTES || '15';
process.env.AZURE_STORAGE_DELEGATION_KEY_MINUTES = process.env.AZURE_STORAGE_DELEGATION_KEY_MINUTES || '60';
process.env.CFFAA_STORAGE_ACCESS_AUDIT_LOG = 'false';

const referenceService = require('../src/services/storage/storage-reference.service');
const accessService = require('../src/services/storage/storage-access.service');
const accessHandler = require('../src/services/storage/storage-access-handler.service');
const diagnostics = require('../src/services/storage/storage-diagnostics.service');

const user = { id_SB: 4, rol: 'Programador', roles: ['Programador'] };
const validReference = {
  id_adjunto: 10,
  storage_provider: 'AZURE_BLOB',
  storage_container: process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME,
  storage_blob_name: 'united/home/pendiente/1/archivo.jpg',
  nombre_archivo: 'evidencia.jpg',
  mime_type: 'image/jpeg',
  tamano_bytes: 1234,
  activo: 1
};

function captureError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

async function main() {
  const normalized = referenceService.normalizeAzureReference_gnral(validReference);
  assert.strictEqual(normalized.storage_provider, 'AZURE_BLOB');
  assert.strictEqual(normalized.nombre_original, 'evidencia.jpg');
  assert.strictEqual(normalized.tamano_bytes, 1234);

  const legacyAzure = referenceService.normalizeAzureReference_gnral({
    archivo_url: 'azureblob:united/home/pendiente/1/legado.pdf',
    nombre_archivo: 'legado.pdf',
    tipo_archivo: 'application/pdf'
  });
  assert.strictEqual(legacyAzure.storage_provider, 'AZURE_BLOB');
  assert.strictEqual(legacyAzure.storage_blob_name, 'united/home/pendiente/1/legado.pdf');

  let error = captureError(() => referenceService.normalizeAzureReference_gnral({
    ...validReference,
    storage_provider: 'GOOGLE_DRIVE'
  }));
  assert(error);
  assert.strictEqual(error.code, 'CFFAA_STORAGE_PROVIDER_NOT_SUPPORTED');

  error = captureError(() => referenceService.normalizeAzureReference_gnral({
    ...validReference,
    storage_container: 'otro-contenedor'
  }));
  assert(error);
  assert.strictEqual(error.code, 'CFFAA_STORAGE_REFERENCE_INVALID');

  error = captureError(() => referenceService.normalizeAzureReference_gnral({
    ...validReference,
    storage_blob_name: '../secreto.txt'
  }));
  assert(error);
  assert.strictEqual(error.code, 'CFFAA_STORAGE_REFERENCE_INVALID');

  error = captureError(() => referenceService.normalizeAzureReference_gnral({
    ...validReference,
    activo: 0
  }));
  assert(error);
  assert.strictEqual(error.code, 'CFFAA_STORAGE_FILE_INACTIVE');

  let capturedSasOptions = null;
  const data = await accessService.createReadAccess_gnral({
    user,
    reference: validReference,
    context: { modulo: 'pendientes', entidadTipo: 'comentario', entidadId: 1, archivoId: 10 },
    authorize: async () => ({ allowed: true, metadata: { scope: 'OWNER' } }),
    sasFactory: async (_blobName, options) => {
      capturedSasOptions = options;
      return {
        url: 'https://example.invalid/blob?sig=oculta',
        expires_at: '2026-08-03T22:00:00.000Z',
        expires_in_minutes: 15
      };
    }
  });
  assert.strictEqual(data.disposition, 'inline');
  assert.strictEqual(data.authorization.scope, 'OWNER');
  assert.strictEqual(capturedSasOptions.containerName, process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME);
  assert.strictEqual(capturedSasOptions.download, false);

  await assert.rejects(
    () => accessService.createReadAccess_gnral({
      user,
      reference: validReference,
      authorize: async () => false,
      sasFactory: async () => ({})
    }),
    errorValue => errorValue.code === 'CFFAA_STORAGE_ACCESS_FORBIDDEN' && errorValue.status === 403
  );

  error = captureError(() => accessHandler.createStorageAccessHandler_gnral({
    authorize: async () => true
  }));
  assert(error);
  assert.strictEqual(error.code, 'CFFAA_ACCESS_RESOLVER_REQUIRED');

  const handler = accessHandler.createStorageAccessHandler_gnral({
    resolveReference: async () => ({
      reference: validReference,
      context: { modulo: 'pendientes', entidad_tipo: 'comentario', entidad_id: 1, archivo_id: 10 }
    }),
    authorize: async () => true,
    sasFactory: async () => ({
      url: 'https://example.invalid/blob?sig=oculta',
      expires_at: '2026-08-03T22:00:00.000Z',
      expires_in_minutes: 15
    })
  });

  let responsePayload = null;
  const req = {
    user,
    actorUser: user,
    contextUser: user,
    query: {},
    params: {},
    body: {}
  };
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { responsePayload = payload; return payload; }
  };
  let nextError = null;
  await handler(req, res, errorValue => { nextError = errorValue; });
  assert.strictEqual(nextError, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(responsePayload.ok, true);
  assert.strictEqual(responsePayload.data.access_url.includes('sig='), true);

  process.env.JWT_SECRET = 'NO_DEBE_APARECER';
  process.env.DB_PASSWORD = 'NO_DEBE_APARECER';
  const snapshot = diagnostics.getStaticSnapshot_gnral();
  const serialized = JSON.stringify(snapshot);
  assert.strictEqual(serialized.includes(process.env.JWT_SECRET), false);
  assert.strictEqual(serialized.includes(process.env.DB_PASSWORD), false);
  assert.strictEqual(snapshot.access.sas_on_demand, true);
  assert.strictEqual(snapshot.access.raw_blob_endpoint_public, false);

  console.log('CFFAA-01E/F: SAS bajo demanda, autorización y diagnóstico estático validados.');
}

main().catch(errorValue => {
  console.error(errorValue);
  process.exit(1);
});
