'use strict';

const path = require('path');
const mime = require('mime-types');

const driveService = require('../services/google/drive.service');
const logger = require('../shared/logger');

function safeFilename(value) {
  return String(value || 'archivo')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/:*?<>|]/g, '_')
    .trim() || 'archivo';
}

function extensionForMimeType(contentType) {
  const extension = mime.extension(contentType || '');
  return extension ? `.${extension}` : '';
}

function filenameForDownload(file, contentType, exported) {
  const original = safeFilename(file.name);
  if (!exported || path.extname(original)) return original;
  return `${original}${extensionForMimeType(contentType)}`;
}

async function about(req, res, next) {
  try {
    const data = await driveService.getAbout(req.user.id_SB);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return next(error);
  }
}

async function list(req, res, next) {
  try {
    const data = await driveService.listFiles(req.user.id_SB, {
      folderId: req.query.folder_id,
      pageSize: req.query.page_size,
      pageToken: req.query.page_token,
      search: req.query.search,
      type: req.query.type
    });

    return res.json({ ok: true, ...data });
  } catch (error) {
    return next(error);
  }
}

async function detail(req, res, next) {
  try {
    const file = await driveService.getFile(req.user.id_SB, req.params.fileId);
    return res.json({ ok: true, file });
  } catch (error) {
    return next(error);
  }
}

async function download(req, res, next) {
  try {
    const result = await driveService.getDownload(
      req.user.id_SB,
      req.params.fileId,
      req.query.export_mime_type
    );

    const filename = filenameForDownload(
      result.file,
      result.contentType,
      result.exported
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Cache-Control', 'private, no-store');

    result.stream.on('error', (error) => {
      logger.error('Error transmitiendo archivo de Google Drive.', error);
      if (!res.headersSent) return next(error);
      return res.destroy(error);
    });

    return result.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  about,
  list,
  detail,
  download
};
