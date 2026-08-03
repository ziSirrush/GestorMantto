const azureStorage = require('../../services/storage/azure-storage.service');

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
    download: String(query.download || '0') === '1',
    fileName: query.file_name
  });
}

async function testDelete_gnral(user, body) {
  assertProgrammer_gnral(user);
  return azureStorage.deleteBlob_gnral(body.blob_name);
}

module.exports = { status_gnral, testUpload_gnral, testAccess_gnral, testDelete_gnral };
