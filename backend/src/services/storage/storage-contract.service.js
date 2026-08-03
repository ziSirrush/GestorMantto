const azureStorage = require('./azure-storage.service');

async function uploadAndPersist_gnral(options) {
  if (!options || typeof options.persist !== 'function') {
    const error = new Error('uploadAndPersist_gnral requiere una función persist.');
    error.status = 500;
    error.code = 'CFFAA_PERSIST_CALLBACK_REQUIRED';
    throw error;
  }

  let uploaded = null;
  try {
    uploaded = await azureStorage.uploadPrivate_gnral(options.upload);
    const persisted = await options.persist(uploaded);
    return { uploaded, persisted };
  } catch (error) {
    if (uploaded && uploaded.storage_blob_name) {
      try {
        await azureStorage.deleteBlob_gnral(uploaded.storage_blob_name, {
          queueOnFailure: true,
          queueContext: options.cleanupContext || {},
          containerName: uploaded.storage_container
        });
      } catch (cleanupError) {
        error.cffaa_cleanup = {
          queued_operation_id: cleanupError.queue_operation_id || null,
          cleanup_error: cleanupError.message
        };
      }
    }
    throw error;
  }
}

async function replaceAndPersist_gnral(options) {
  const result = await uploadAndPersist_gnral(options);
  const previousBlobName = options && options.previousBlobName;

  if (previousBlobName && previousBlobName !== result.uploaded.storage_blob_name) {
    try {
      await azureStorage.deleteBlob_gnral(previousBlobName, {
        queueOnFailure: true,
        queueContext: options.cleanupContext || {}
      });
    } catch (error) {
      result.previous_cleanup = {
        completed: false,
        queued_operation_id: error.queue_operation_id || null,
        error: error.message
      };
    }
  }

  return result;
}

module.exports = {
  uploadAndPersist_gnral,
  replaceAndPersist_gnral
};
