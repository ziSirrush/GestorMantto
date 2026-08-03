const azureStorage = require('../../services/storage/azure-storage.service');
const diagnostics = require('../../services/storage/storage-diagnostics.service');

function assertProgrammer_gnral(user) {
  const roles = new Set([user && user.rol, ...((user && user.roles) || [])].filter(Boolean));
  const allowed = ['Programador', 'Programador United', 'Programador Corellian'];
  if (!allowed.some(role => roles.has(role))) {
    const error = new Error('Esta prueba técnica está reservada para Programador.');
    error.status = 403;
    throw error;
  }
}

async function status_gnral(user) {
  assertProgrammer_gnral(user);
  return azureStorage.getStatus_gnral();
}

async function contractStatus_gnral(user, query = {}) {
  assertProgrammer_gnral(user);
  return diagnostics.getContractSnapshot_gnral({
    forceSchema: String(query.force_schema || '0') === '1',
    includeAzure: String(query.include_azure || '1') !== '0',
    includeSchema: String(query.include_schema || '1') !== '0',
    includeQueue: String(query.include_queue || '1') !== '0'
  });
}

async function testUpload_gnral(user, file, body) {
  assertProgrammer_gnral(user);
  return azureStorage.uploadPrivate_gnral({
    file,
    empresa: body.empresa || user.empresa,
    modulo: body.modulo || 'diagnostico',
    entidadTipo: body.entidad_tipo || 'prueba-tecnica',
    entidadId: body.entidad_id || user.id_SB,
    subruta: 'temporal',
    metadata: {
      uploaded_by: user.id_SB,
      purpose: 'fase_3_diagnostico'
    }
  });
}

async function testAccess_gnral(user, query) {
  assertProgrammer_gnral(user);
  return azureStorage.createReadSas_gnral(query.blob_name, {
    containerName: query.container_name,
    download: String(query.download || '0') === '1',
    fileName: query.file_name,
    verifyExists: String(query.verify_exists || '0') === '1'
  });
}

async function testDelete_gnral(user, body) {
  assertProgrammer_gnral(user);
  return azureStorage.deleteBlob_gnral(body.blob_name, {
    containerName: body.container_name,
    queueOnFailure: true,
    queueContext: {
      modulo: 'diagnostico',
      entidadTipo: 'blob-tecnico',
      entidadId: user.id_SB,
      solicitadoPor: user.id_SB,
      motivo: 'Eliminación solicitada desde diagnóstico técnico.'
    }
  });
}

async function testLifecycle_gnral(user, file, body) {
  assertProgrammer_gnral(user);
  return diagnostics.runLifecycleDiagnostic_gnral({ user, file, body });
}

module.exports = {
  status_gnral,
  contractStatus_gnral,
  testUpload_gnral,
  testAccess_gnral,
  testDelete_gnral,
  testLifecycle_gnral
};
