'use strict';

const { google } = require('googleapis');

const oauthService = require('./oauth.service');
const cryptoService = require('./crypto.service');
const googleOAuthRepository = require('./google-oauth.repository');

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

const EXPORT_MIME_TYPES = Object.freeze({
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf'
});

function createHttpError(message, status, code, cause = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function normalizePageSize(value) {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
}

function escapeDriveQueryValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function normalizeConnection(connection) {
  if (!connection || Number(connection.estado) !== 1) {
    throw createHttpError(
      'Debes conectar tu cuenta de Google antes de consultar Drive.',
      409,
      'GOOGLE_DRIVE_NOT_CONNECTED'
    );
  }

  if (!connection.refresh_token && !connection.access_token) {
    throw createHttpError(
      'La conexión de Google no contiene credenciales válidas. Conecta nuevamente tu cuenta.',
      409,
      'GOOGLE_DRIVE_CREDENTIALS_MISSING'
    );
  }

  return connection;
}

async function createAuthorizedClient(userId) {
  const connection = normalizeConnection(
    await googleOAuthRepository.findByUserId(userId)
  );

  let credentials;
  try {
    credentials = {
      access_token: connection.access_token
        ? cryptoService.decrypt(connection.access_token)
        : null,
      refresh_token: connection.refresh_token
        ? cryptoService.decrypt(connection.refresh_token)
        : null,
      token_type: connection.token_type || 'Bearer',
      scope: connection.scope || undefined,
      expiry_date: connection.expiry_date === null
        ? null
        : Number(connection.expiry_date)
    };
  } catch (error) {
    throw createHttpError(
      'No fue posible descifrar las credenciales de Google. Conecta nuevamente tu cuenta.',
      409,
      'GOOGLE_DRIVE_DECRYPT_ERROR',
      error
    );
  }

  const client = oauthService.createOAuthClient(credentials);

  client.on('tokens', async (tokens) => {
    try {
      await googleOAuthRepository.updateRefreshedTokens({
        userId,
        accessToken: tokens.access_token
          ? cryptoService.encrypt(tokens.access_token)
          : null,
        refreshToken: tokens.refresh_token
          ? cryptoService.encrypt(tokens.refresh_token)
          : null,
        tokenType: tokens.token_type || null,
        scope: tokens.scope || null,
        expiryDate: Number.isFinite(Number(tokens.expiry_date))
          ? Number(tokens.expiry_date)
          : null
      });
    } catch (error) {
      console.error('[Google Drive] No fue posible persistir los tokens renovados.', error);
    }
  });

  try {
    await client.getAccessToken();
  } catch (error) {
    const invalidGrant = error && (
      error.code === 'invalid_grant' ||
      String(error.message || '').toLowerCase().includes('invalid_grant')
    );

    if (invalidGrant) {
      await googleOAuthRepository.markReconnectRequired(userId);
      throw createHttpError(
        'Google revocó o venció la autorización. Conecta nuevamente tu cuenta.',
        401,
        'GOOGLE_DRIVE_RECONNECT_REQUIRED',
        error
      );
    }

    throw createHttpError(
      'No fue posible autenticar la conexión con Google Drive.',
      502,
      'GOOGLE_DRIVE_AUTH_ERROR',
      error
    );
  }

  return {
    client,
    drive: google.drive({ version: 'v3', auth: client }),
    connection
  };
}

function mapDriveFile(file) {
  const shortcut = file.shortcutDetails || null;

  return {
    id: file.id || null,
    name: file.name || null,
    mime_type: file.mimeType || null,
    is_folder: file.mimeType === GOOGLE_FOLDER_MIME,
    is_shortcut: file.mimeType === GOOGLE_SHORTCUT_MIME,
    shortcut_target_id: shortcut ? shortcut.targetId || null : null,
    shortcut_target_mime_type: shortcut ? shortcut.targetMimeType || null : null,
    size: file.size === undefined || file.size === null ? null : Number(file.size),
    created_time: file.createdTime || null,
    modified_time: file.modifiedTime || null,
    parents: Array.isArray(file.parents) ? file.parents : [],
    web_view_link: file.webViewLink || null,
    web_content_link: file.webContentLink || null,
    icon_link: file.iconLink || null,
    thumbnail_link: file.thumbnailLink || null,
    md5_checksum: file.md5Checksum || null,
    trashed: Boolean(file.trashed),
    capabilities: file.capabilities || null
  };
}

async function getAbout(userId) {
  const { drive, connection } = await createAuthorizedClient(userId);
  const response = await drive.about.get({
    fields: 'user(displayName,emailAddress,photoLink,me),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)'
  });

  return {
    google_email: connection.google_email,
    user: response.data.user || null,
    storage_quota: response.data.storageQuota || null
  };
}

async function listFiles(userId, options = {}) {
  const { drive } = await createAuthorizedClient(userId);
  const folderId = String(options.folderId || 'root').trim() || 'root';
  const search = String(options.search || '').trim();
  const type = String(options.type || 'all').trim().toLowerCase();

  const filters = [
    `'${escapeDriveQueryValue(folderId)}' in parents`,
    'trashed = false'
  ];

  if (search) {
    filters.push(`name contains '${escapeDriveQueryValue(search)}'`);
  }

  if (type === 'folder' || type === 'folders') {
    filters.push(`mimeType = '${GOOGLE_FOLDER_MIME}'`);
  } else if (type === 'file' || type === 'files') {
    filters.push(`mimeType != '${GOOGLE_FOLDER_MIME}'`);
  }

  const response = await drive.files.list({
    q: filters.join(' and '),
    pageSize: normalizePageSize(options.pageSize),
    pageToken: options.pageToken || undefined,
    orderBy: 'folder,name_natural',
    spaces: 'drive',
    corpora: 'user',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,iconLink,thumbnailLink,md5Checksum,trashed,capabilities(canDownload,canEdit,canRename,canDelete),shortcutDetails(targetId,targetMimeType))'
  });

  return {
    folder_id: folderId,
    files: (response.data.files || []).map(mapDriveFile),
    next_page_token: response.data.nextPageToken || null,
    incomplete_search: Boolean(response.data.incompleteSearch)
  };
}

async function getFile(userId, fileId) {
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) {
    throw createHttpError('El ID del archivo es obligatorio.', 400, 'GOOGLE_DRIVE_FILE_ID_REQUIRED');
  }

  const { drive } = await createAuthorizedClient(userId);
  const response = await drive.files.get({
    fileId: normalizedFileId,
    supportsAllDrives: true,
    fields: 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,iconLink,thumbnailLink,md5Checksum,trashed,capabilities(canDownload,canEdit,canRename,canDelete),shortcutDetails(targetId,targetMimeType)'
  });

  return mapDriveFile(response.data || {});
}

async function getDownload(userId, fileId, requestedExportMimeType = null) {
  const file = await getFile(userId, fileId);

  if (file.is_folder) {
    throw createHttpError('Las carpetas no se pueden descargar como archivo.', 400, 'GOOGLE_DRIVE_FOLDER_DOWNLOAD');
  }

  const { drive } = await createAuthorizedClient(userId);
  const defaultExportMimeType = EXPORT_MIME_TYPES[file.mime_type] || null;
  const exportMimeType = String(requestedExportMimeType || defaultExportMimeType || '').trim();

  if (file.mime_type && file.mime_type.startsWith('application/vnd.google-apps.')) {
    if (!exportMimeType) {
      throw createHttpError(
        'Este tipo de archivo de Google no tiene un formato de exportación configurado.',
        400,
        'GOOGLE_DRIVE_EXPORT_UNSUPPORTED'
      );
    }

    const response = await drive.files.export(
      { fileId: file.id, mimeType: exportMimeType },
      { responseType: 'stream' }
    );

    return {
      file,
      stream: response.data,
      contentType: exportMimeType,
      exported: true
    };
  }

  if (file.capabilities && file.capabilities.canDownload === false) {
    throw createHttpError(
      'Tu cuenta de Google no tiene permiso para descargar este archivo.',
      403,
      'GOOGLE_DRIVE_DOWNLOAD_FORBIDDEN'
    );
  }

  const response = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return {
    file,
    stream: response.data,
    contentType: file.mime_type || 'application/octet-stream',
    exported: false
  };
}

module.exports = {
  GOOGLE_FOLDER_MIME,
  EXPORT_MIME_TYPES,
  createAuthorizedClient,
  getAbout,
  listFiles,
  getFile,
  getDownload
};
