const path = require('path');
const mime = require('mime-types');
const {
  STORAGE_CODES,
  createStorageError_gnral
} = require('./storage-errors.service');

const MB = 1024 * 1024;
const DEFAULT_MAX_FILE_MB = 25;
const DEFAULT_MAX_REQUEST_MB = 50;

const BLOCKED_EXTENSIONS = Object.freeze(new Set([
  '.exe', '.dll', '.msi', '.msp', '.bat', '.cmd', '.com', '.scr', '.ps1', '.psm1',
  '.sh', '.bash', '.zsh', '.apk', '.ipa', '.jar', '.js', '.mjs', '.cjs', '.vbs',
  '.vbe', '.wsf', '.wsh', '.reg', '.php', '.py', '.rb', '.pl', '.cgi', '.html',
  '.htm', '.xhtml', '.svg', '.iso'
]));

const EXTENSION_MIME_TYPES = Object.freeze({
  '.jpg': ['image/jpeg', 'image/jpg', 'application/octet-stream'],
  '.jpeg': ['image/jpeg', 'image/jpg', 'application/octet-stream'],
  '.png': ['image/png', 'application/octet-stream'],
  '.webp': ['image/webp', 'application/octet-stream'],
  '.gif': ['image/gif', 'application/octet-stream'],
  '.heic': ['image/heic', 'image/heif', 'application/octet-stream'],
  '.heif': ['image/heif', 'image/heic', 'application/octet-stream'],
  '.avif': ['image/avif', 'application/octet-stream'],
  '.pdf': ['application/pdf', 'application/octet-stream'],
  '.doc': ['application/msword', 'application/rtf', 'text/rtf', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ],
  '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ],
  '.csv': ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'],
  '.txt': ['text/plain', 'application/octet-stream'],
  '.rtf': ['application/rtf', 'text/rtf', 'application/octet-stream'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', 'application/octet-stream']
});

const IMAGE_EXTENSIONS = Object.freeze(new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif'
]));

const DOCUMENT_EXTENSIONS = Object.freeze(new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.rtf', '.zip'
]));

const POLICIES = Object.freeze({
  GENERAL: Object.freeze({
    name: 'GENERAL',
    extensions: new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])
  }),
  IMAGE: Object.freeze({
    name: 'IMAGE',
    extensions: IMAGE_EXTENSIONS
  }),
  DOCUMENT: Object.freeze({
    name: 'DOCUMENT',
    extensions: DOCUMENT_EXTENSIONS
  })
});

function readPositiveNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function getLimits_gnral(overrides = {}) {
  const maxFileMb = readPositiveNumber(
    overrides.maxFileMb ?? process.env.AZURE_STORAGE_MAX_FILE_MB,
    DEFAULT_MAX_FILE_MB,
    1,
    1024
  );
  const maxRequestMb = readPositiveNumber(
    overrides.maxRequestMb ?? process.env.CFFAA_STORAGE_MAX_REQUEST_MB,
    DEFAULT_MAX_REQUEST_MB,
    1,
    2048
  );

  return {
    maxFileMb,
    maxFileBytes: Math.floor(maxFileMb * MB),
    maxRequestMb,
    maxRequestBytes: Math.floor(maxRequestMb * MB)
  };
}

function resolvePolicy_gnral(policyName = 'GENERAL') {
  const normalized = String(policyName || 'GENERAL').trim().toUpperCase();
  const policy = POLICIES[normalized];
  if (!policy) {
    throw createStorageError_gnral(`Política de archivos no reconocida: ${normalized}.`, {
      status: 500,
      code: 'CFFAA_UNKNOWN_FILE_POLICY',
      expose: false
    });
  }
  return policy;
}

function sanitizeOriginalName_gnral(value) {
  const raw = path.basename(String(value || 'archivo'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const safe = raw || 'archivo';
  if (safe.length <= 240) return safe;

  const extension = path.extname(safe).slice(0, 20);
  const base = path.basename(safe, path.extname(safe));
  return `${base.slice(0, Math.max(1, 240 - extension.length))}${extension}`;
}

function extensionOf_gnral(fileName) {
  return path.extname(sanitizeOriginalName_gnral(fileName)).toLowerCase();
}

function createTypeError(message, details = {}) {
  return createStorageError_gnral(message, {
    status: 415,
    code: STORAGE_CODES.FILE_TYPE_NOT_ALLOWED,
    details
  });
}

function validateMetadata_gnral(file, options = {}) {
  if (!file) {
    throw createStorageError_gnral('No se recibió un archivo válido.', {
      status: 400,
      code: STORAGE_CODES.INVALID_FILE
    });
  }

  const policy = resolvePolicy_gnral(options.policyName);
  const originalName = sanitizeOriginalName_gnral(file.originalname || file.name);
  const extension = extensionOf_gnral(originalName);

  if (!extension) {
    throw createTypeError('El archivo debe tener una extensión reconocida.', { originalName });
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw createTypeError(`La extensión ${extension} está bloqueada por seguridad.`, { extension });
  }
  if (!policy.extensions.has(extension)) {
    throw createTypeError(`La extensión ${extension} no está permitida para la política ${policy.name}.`, {
      extension,
      policy: policy.name
    });
  }

  const receivedMime = String(file.mimetype || '').trim().toLowerCase();
  const acceptedMimes = EXTENSION_MIME_TYPES[extension] || [];
  if (receivedMime && !acceptedMimes.includes(receivedMime)) {
    throw createTypeError(`El tipo MIME ${receivedMime} no coincide con la extensión ${extension}.`, {
      extension,
      receivedMime,
      acceptedMimes
    });
  }

  return {
    policy: policy.name,
    originalName,
    extension,
    extensionWithoutDot: extension.slice(1),
    receivedMime,
    acceptedMimes,
    detectedMime: mime.lookup(extension) || null
  };
}

function startsWith(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isProbablyText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  const utf16Le = sample.length >= 2 && sample[0] === 0xff && sample[1] === 0xfe;
  const utf16Be = sample.length >= 2 && sample[0] === 0xfe && sample[1] === 0xff;
  if (utf16Le || utf16Be) return true;

  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02;
}

function detectSignature_gnral(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'empty';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';

  const head6 = buffer.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';

  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])) {
    return 'zip';
  }
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (buffer.subarray(0, 5).toString('ascii') === '{\\rtf') return 'rtf';

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heif';
    if (['avif', 'avis'].includes(brand)) return 'avif';
  }

  if (isProbablyText(buffer)) return 'text';
  return 'unknown';
}

const EXPECTED_SIGNATURES = Object.freeze({
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.png': ['png'],
  '.webp': ['webp'],
  '.gif': ['gif'],
  '.heic': ['heif'],
  '.heif': ['heif'],
  '.avif': ['avif'],
  '.pdf': ['pdf'],
  '.doc': ['ole', 'rtf'],
  '.docx': ['zip'],
  '.xls': ['ole'],
  '.xlsx': ['zip'],
  '.ppt': ['ole'],
  '.pptx': ['zip'],
  '.csv': ['text'],
  '.txt': ['text'],
  '.rtf': ['rtf', 'text'],
  '.zip': ['zip']
});

function signatureValidationEnabled_gnral() {
  return String(process.env.CFFAA_FILE_SIGNATURE_VALIDATION || 'true').trim().toLowerCase() !== 'false';
}

function validateSignature_gnral(buffer, extension) {
  const signature = detectSignature_gnral(buffer);
  if (!signatureValidationEnabled_gnral()) return signature;

  const expected = EXPECTED_SIGNATURES[extension] || [];
  if (expected.length && !expected.includes(signature)) {
    throw createStorageError_gnral(`El contenido del archivo no coincide con la extensión ${extension}.`, {
      status: 415,
      code: STORAGE_CODES.FILE_SIGNATURE_MISMATCH,
      details: { extension, detectedSignature: signature, expectedSignatures: expected }
    });
  }
  return signature;
}

function validateFile_gnral(file, options = {}) {
  const metadata = validateMetadata_gnral(file, options);
  const limits = getLimits_gnral(options);
  const buffer = file && file.buffer;
  const size = Number(file && file.size) || (Buffer.isBuffer(buffer) ? buffer.length : 0);

  if (!Buffer.isBuffer(buffer)) {
    throw createStorageError_gnral('No se recibió el contenido binario del archivo.', {
      status: 400,
      code: STORAGE_CODES.INVALID_FILE
    });
  }
  if (size <= 0 || buffer.length <= 0) {
    throw createStorageError_gnral('El archivo está vacío.', {
      status: 400,
      code: STORAGE_CODES.EMPTY_FILE
    });
  }
  if (size > limits.maxFileBytes) {
    throw createStorageError_gnral(`El archivo excede el límite de ${limits.maxFileMb} MB.`, {
      status: 413,
      code: STORAGE_CODES.FILE_TOO_LARGE,
      details: { maxFileMb: limits.maxFileMb, size }
    });
  }

  const signature = validateSignature_gnral(buffer, metadata.extension);
  const mimeType = metadata.receivedMime && metadata.receivedMime !== 'application/octet-stream'
    ? metadata.receivedMime
    : (metadata.detectedMime || metadata.acceptedMimes.find(item => item !== 'application/octet-stream') || 'application/octet-stream');

  return {
    ...metadata,
    size,
    signature,
    mimeType,
    maxFileBytes: limits.maxFileBytes
  };
}

function validateFiles_gnral(files, options = {}) {
  const values = (Array.isArray(files) ? files : [files]).filter(Boolean);
  const limits = getLimits_gnral(options);
  const maxFiles = Number(options.maxFiles || values.length || 1);

  if (values.length > maxFiles) {
    throw createStorageError_gnral(`Solo se permiten ${maxFiles} archivo(s) por petición.`, {
      status: 413,
      code: STORAGE_CODES.TOO_MANY_FILES,
      details: { maxFiles, receivedFiles: values.length }
    });
  }

  const validated = values.map(file => validateFile_gnral(file, options));
  const totalBytes = validated.reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > limits.maxRequestBytes) {
    throw createStorageError_gnral(`Los archivos exceden el límite total de ${limits.maxRequestMb} MB por petición.`, {
      status: 413,
      code: STORAGE_CODES.REQUEST_TOO_LARGE,
      details: { maxRequestMb: limits.maxRequestMb, totalBytes }
    });
  }

  return {
    files: validated,
    totalBytes,
    maxRequestBytes: limits.maxRequestBytes,
    maxRequestMb: limits.maxRequestMb
  };
}

function shouldInline_gnral(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  return type === 'application/pdf' || [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
  ].includes(type);
}

function contentDisposition_gnral(fileName, mimeType, forceDownload = false) {
  const mode = forceDownload || !shouldInline_gnral(mimeType) ? 'attachment' : 'inline';
  return `${mode}; filename*=UTF-8''${encodeURIComponent(sanitizeOriginalName_gnral(fileName))}`;
}

module.exports = {
  MB,
  POLICIES,
  BLOCKED_EXTENSIONS,
  EXTENSION_MIME_TYPES,
  getLimits_gnral,
  resolvePolicy_gnral,
  sanitizeOriginalName_gnral,
  extensionOf_gnral,
  validateMetadata_gnral,
  detectSignature_gnral,
  validateSignature_gnral,
  validateFile_gnral,
  validateFiles_gnral,
  shouldInline_gnral,
  contentDisposition_gnral
};
