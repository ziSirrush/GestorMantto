const STORAGE_CODES = Object.freeze({
  INVALID_FILE: 'CFFAA_INVALID_FILE',
  EMPTY_FILE: 'CFFAA_EMPTY_FILE',
  FILE_TOO_LARGE: 'CFFAA_FILE_TOO_LARGE',
  REQUEST_TOO_LARGE: 'CFFAA_REQUEST_TOO_LARGE',
  TOO_MANY_FILES: 'CFFAA_TOO_MANY_FILES',
  FILE_TYPE_NOT_ALLOWED: 'CFFAA_FILE_TYPE_NOT_ALLOWED',
  FILE_SIGNATURE_MISMATCH: 'CFFAA_FILE_SIGNATURE_MISMATCH',
  UPLOAD_FIELD_INVALID: 'CFFAA_UPLOAD_FIELD_INVALID',
  STORAGE_UNAVAILABLE: 'CFFAA_STORAGE_UNAVAILABLE',
  STORAGE_OPERATION_FAILED: 'CFFAA_STORAGE_OPERATION_FAILED',
  REFERENCE_INVALID: 'CFFAA_STORAGE_REFERENCE_INVALID',
  PROVIDER_NOT_SUPPORTED: 'CFFAA_STORAGE_PROVIDER_NOT_SUPPORTED',
  FILE_INACTIVE: 'CFFAA_STORAGE_FILE_INACTIVE',
  ACCESS_FORBIDDEN: 'CFFAA_STORAGE_ACCESS_FORBIDDEN',
  ACCESS_AUTHORIZER_REQUIRED: 'CFFAA_STORAGE_ACCESS_AUTHORIZER_REQUIRED'
});

function createStorageError_gnral(message, options = {}) {
  const error = new Error(String(message || 'Error de archivos.'));
  error.status = Number(options.status || 500);
  error.statusCode = error.status;
  error.code = options.code || STORAGE_CODES.STORAGE_OPERATION_FAILED;
  error.expose = options.expose !== false;
  if (options.details !== undefined) error.details = options.details;
  if (options.cause) error.cause = options.cause;
  return error;
}

function normalizeUploadError_gnral(error) {
  if (!error) return error;
  if (error.status || error.statusCode) return error;

  const mappings = {
    LIMIT_FILE_SIZE: {
      status: 413,
      code: STORAGE_CODES.FILE_TOO_LARGE,
      message: 'El archivo excede el límite permitido.'
    },
    LIMIT_FILE_COUNT: {
      status: 413,
      code: STORAGE_CODES.TOO_MANY_FILES,
      message: 'La petición excede la cantidad permitida de archivos.'
    },
    LIMIT_UNEXPECTED_FILE: {
      status: 400,
      code: STORAGE_CODES.UPLOAD_FIELD_INVALID,
      message: error.field
        ? `El campo de archivo ${error.field} no es válido o excede la cantidad permitida.`
        : 'Se recibió un campo de archivo no esperado.'
    },
    LIMIT_PART_COUNT: {
      status: 413,
      code: STORAGE_CODES.REQUEST_TOO_LARGE,
      message: 'La petición contiene demasiadas partes.'
    },
    LIMIT_FIELD_COUNT: {
      status: 400,
      code: STORAGE_CODES.UPLOAD_FIELD_INVALID,
      message: 'La petición contiene demasiados campos.'
    },
    LIMIT_FIELD_KEY: {
      status: 400,
      code: STORAGE_CODES.UPLOAD_FIELD_INVALID,
      message: 'El nombre de uno de los campos es demasiado largo.'
    },
    LIMIT_FIELD_VALUE: {
      status: 413,
      code: STORAGE_CODES.REQUEST_TOO_LARGE,
      message: 'Uno de los campos de la petición excede el tamaño permitido.'
    }
  };

  const mapping = mappings[error.code];
  if (!mapping) return error;

  return createStorageError_gnral(mapping.message, {
    ...mapping,
    cause: error,
    details: error.field ? { field: error.field } : undefined
  });
}

module.exports = {
  STORAGE_CODES,
  createStorageError_gnral,
  normalizeUploadError_gnral
};
