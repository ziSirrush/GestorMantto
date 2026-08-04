const pendientesFiles = require('./pendientes-files.service');

function accessAction_gnral(handler) {
  return async function pendientesFileAccess(req, res, next) {
    try {
      const data = await handler(req);
      return res.status(200).json({
        ok: true,
        message: 'Acceso al archivo generado correctamente.',
        data
      });
    } catch (error) {
      return next(error);
    }
  };
}

const getDirectFileAccess = accessAction_gnral(pendientesFiles.directFileAccess_gnral);
const getCommentFileAccess = accessAction_gnral(pendientesFiles.commentAttachmentAccess_gnral);
const getLegacyFileAccess = accessAction_gnral(pendientesFiles.legacyEvidenceAccess_gnral);

async function deleteDirectFile(req, res, next) {
  try {
    const idPendiente = Number.parseInt(req.params.id, 10);
    const idArchivo = Number.parseInt(req.params.idArchivo, 10);
    if (!idPendiente || !idArchivo) {
      return res.status(400).json({
        ok: false,
        message: 'Identificador de archivo no válido.'
      });
    }

    const result = await pendientesFiles.deleteDirectFile_gnral(
      idPendiente,
      idArchivo,
      req.contextUser || req.user
    );
    return res.json({
      ok: true,
      message: 'Evidencia eliminada correctamente.',
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDirectFileAccess,
  getCommentFileAccess,
  getLegacyFileAccess,
  deleteDirectFile
};
