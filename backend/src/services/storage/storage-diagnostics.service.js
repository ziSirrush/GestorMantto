const filePolicy = require('./storage-file-policy.service');
const azureStorage = require('./azure-storage.service');

function enabled_gnral(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function safeError_gnral(error) {
  return {
    ok: false,
    code: error && error.code ? String(error.code) : null,
    message: error && error.message ? String(error.message) : 'Error no identificado.'
  };
}

function getStaticSnapshot_gnral() {
  const limits = filePolicy.getLimits_gnral();
  const policies = {};
  for (const [name, policy] of Object.entries(filePolicy.POLICIES)) {
    policies[name] = [...policy.extensions].sort();
  }

  return {
    contract_version: 'CFFAA-01E/F-V001',
    generated_at: new Date().toISOString(),
    upload: {
      max_file_mb: limits.maxFileMb,
      max_request_mb: limits.maxRequestMb,
      signature_validation: enabled_gnral(process.env.CFFAA_FILE_SIGNATURE_VALIDATION, true),
      policies
    },
    access: {
      sas_on_demand: true,
      raw_blob_endpoint_public: false,
      verify_exists_by_default: enabled_gnral(process.env.CFFAA_STORAGE_ACCESS_VERIFY_EXISTS, false),
      audit_log_enabled: enabled_gnral(process.env.CFFAA_STORAGE_ACCESS_AUDIT_LOG, true)
    },
    retry_job: {
      enabled: enabled_gnral(process.env.CFFAA_STORAGE_RETRY_ENABLED, false),
      interval_ms: Number(process.env.CFFAA_STORAGE_RETRY_INTERVAL_MS || 60000),
      batch_size: Number(process.env.CFFAA_STORAGE_RETRY_BATCH_SIZE || 20),
      max_attempts: Number(process.env.CFFAA_STORAGE_RETRY_MAX_ATTEMPTS || 10)
    },
    diagnostics: {
      enabled: enabled_gnral(process.env.AZURE_STORAGE_DIAGNOSTICS_ENABLED, false),
      programmer_only: true
    }
  };
}

async function getContractSnapshot_gnral(options = {}) {
  const snapshot = getStaticSnapshot_gnral();

  if (options.includeAzure !== false) {
    try {
      snapshot.azure = { ok: true, ...(await azureStorage.getStatus_gnral()) };
    } catch (error) {
      snapshot.azure = safeError_gnral(error);
    }
  }

  if (options.includeSchema !== false) {
    try {
      const storageSchema = require('./storage-schema.service');
      snapshot.schema = {
        ok: true,
        ...(await storageSchema.readSchemaStatus_gnral(options.forceSchema === true))
      };
    } catch (error) {
      snapshot.schema = safeError_gnral(error);
    }
  }

  if (options.includeQueue !== false) {
    try {
      const repository = require('./storage-operations.repository');
      const rows = await repository.status_gnral();
      snapshot.queue = {
        ok: true,
        totals: Object.fromEntries(rows.map(row => [row.estado, Number(row.total || 0)])),
        total: rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
      };
    } catch (error) {
      snapshot.queue = safeError_gnral(error);
    }
  }

  snapshot.overall_ok = [snapshot.azure, snapshot.schema, snapshot.queue]
    .filter(Boolean)
    .every(section => section.ok !== false && section.ready !== false);

  return snapshot;
}

async function runLifecycleDiagnostic_gnral({ user, file, body = {} }) {
  let uploaded = null;

  try {
    uploaded = await azureStorage.uploadPrivate_gnral({
      file,
      empresa: body.empresa || user.empresa,
      modulo: 'diagnostico-cffaa',
      entidadTipo: 'ciclo-storage',
      entidadId: user.id_SB,
      subruta: 'temporal',
      metadata: {
        uploaded_by: user.id_SB,
        purpose: 'cffaa_01f_lifecycle'
      },
      policyName: body.policy || 'GENERAL',
      forceDownload: true
    });

    const access = await azureStorage.createReadSas_gnral(uploaded.storage_blob_name, {
      containerName: uploaded.storage_container,
      fileName: uploaded.nombre_original,
      mimeType: uploaded.mime_type,
      download: true,
      verifyExists: true
    });

    const deletion = await azureStorage.deleteBlob_gnral(uploaded.storage_blob_name, {
      containerName: uploaded.storage_container,
      queueOnFailure: true,
      queueContext: {
        modulo: 'diagnostico-cffaa',
        entidadTipo: 'ciclo-storage',
        entidadId: user.id_SB,
        solicitadoPor: user.id_SB,
        motivo: 'Limpieza del ciclo técnico CFFAA-01F.'
      }
    });

    return {
      upload: {
        storage_provider: uploaded.storage_provider,
        storage_container: uploaded.storage_container,
        storage_blob_name: uploaded.storage_blob_name,
        nombre_original: uploaded.nombre_original,
        mime_type: uploaded.mime_type,
        tamano_bytes: uploaded.tamano_bytes
      },
      access: {
        generated: Boolean(access.url),
        expires_at: access.expires_at,
        expires_in_minutes: access.expires_in_minutes,
        url_returned: false
      },
      cleanup: deletion,
      completed: deletion.queued !== true
    };
  } catch (error) {
    if (uploaded && uploaded.storage_blob_name) {
      try {
        await azureStorage.deleteBlob_gnral(uploaded.storage_blob_name, {
          containerName: uploaded.storage_container,
          queueOnFailure: true,
          queueContext: {
            modulo: 'diagnostico-cffaa',
            entidadTipo: 'ciclo-storage',
            entidadId: user && user.id_SB,
            solicitadoPor: user && user.id_SB,
            motivo: 'Compensación del ciclo técnico CFFAA-01F.'
          }
        });
      } catch (cleanupError) {
        error.cffaa_cleanup = {
          queued_operation_id: cleanupError.queue_operation_id || null,
          message: cleanupError.message
        };
      }
    }
    throw error;
  }
}

module.exports = {
  enabled_gnral,
  safeError_gnral,
  getStaticSnapshot_gnral,
  getContractSnapshot_gnral,
  runLifecycleDiagnostic_gnral
};
