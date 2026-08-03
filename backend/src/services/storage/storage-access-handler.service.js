const accessService = require('./storage-access.service');
const { createStorageError_gnral } = require('./storage-errors.service');

function parseBoolean_gnral(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function assertFactoryOptions_gnral(options) {
  if (!options || typeof options.resolveReference !== 'function') {
    throw createStorageError_gnral('La ruta de acceso debe resolver el archivo desde su tabla funcional.', {
      status: 500,
      code: 'CFFAA_ACCESS_RESOLVER_REQUIRED',
      expose: false
    });
  }
  if (typeof options.authorize !== 'function') {
    throw createStorageError_gnral('La ruta de acceso debe autorizar al usuario contra la entidad funcional.', {
      status: 500,
      code: 'CFFAA_ACCESS_AUTHORIZER_REQUIRED',
      expose: false
    });
  }
}

function createStorageAccessHandler_gnral(options = {}) {
  assertFactoryOptions_gnral(options);

  return async function cffaaStorageAccessHandler(req, res, next) {
    try {
      const actorUser = req.actorUser || req.user;
      const contextUser = req.contextUser || req.user;
      const resolved = await options.resolveReference({
        req,
        actorUser,
        contextUser
      });

      if (!resolved) {
        throw createStorageError_gnral('El archivo no existe o ya no está disponible.', {
          status: 404,
          code: 'CFFAA_FILE_NOT_FOUND'
        });
      }

      const reference = resolved.reference || resolved;
      const builtContext = typeof options.buildContext === 'function'
        ? await options.buildContext({ req, actorUser, contextUser, resolved })
        : {};
      const resolvedContext = resolved.context && typeof resolved.context === 'object' && !Array.isArray(resolved.context)
        ? resolved.context
        : {};
      const context = {
        ...(builtContext && typeof builtContext === 'object' ? builtContext : {}),
        ...resolvedContext
      };

      const data = await accessService.createReadAccess_gnral({
        actorUser,
        contextUser,
        reference,
        context,
        authorize: (accessContext) => options.authorize({
          ...accessContext,
          req,
          resolved
        }),
        download: parseBoolean_gnral(req.query && req.query.download, options.defaultDownload === true),
        verifyExists: options.verifyExists,
        minutes: options.minutes,
        allowInactive: options.allowInactive === true,
        sasFactory: options.sasFactory
      });

      return res.status(200).json({
        ok: true,
        message: 'Acceso temporal generado.',
        data
      });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  parseBoolean_gnral,
  createStorageAccessHandler_gnral
};
