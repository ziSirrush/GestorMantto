'use strict';

/**
 * BLT NOW - Modo Offline, nueva implementacion Fase 1.
 * Catalogo de modulos de lectura autorizados, no un motor paralelo de permisos.
 * El acceso a registros se valida nuevamente en los endpoints de cada modulo
 * (ninguna fila de Aiven se entrega por este servicio).
 */

const crypto = require('node:crypto');

const READ_ACTIONS = Object.freeze(['VER', 'ACCESO_VISUAL', 'CONSULTAR', 'LISTAR']);
const OFFLINE_CONFIGURATION_MODULE = 'GENERAL_MODO_OFFLINE';

const CATALOG_SQL = `
  SELECT pm.id_modulo, pm.codigo AS modulo_codigo, pm.nombre AS modulo_nombre,
         pm.ruta_frontend, pm.orden AS modulo_orden,
         pg.id_agrupacion, pg.codigo AS agrupacion_codigo,
         pg.nombre AS agrupacion_nombre, pg.empresa AS agrupacion_empresa,
         pg.orden AS agrupacion_orden, pg.activo AS agrupacion_activa,
         psa.codigo_permiso
    FROM perm_modulos pm
    INNER JOIN perm_agrupaciones pg
      ON pg.id_agrupacion = pm.id_agrupacion AND pg.activo = 1
    INNER JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.activo = 1
    INNER JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.activo = 1
    INNER JOIN perm_subelemento_acciones psa
      ON psa.id_subelemento = ps.id_subelemento AND psa.activo = 1
    INNER JOIN perm_acciones pa
      ON pa.id_accion = psa.id_accion AND pa.activo = 1
   WHERE pm.activo = 1
     AND pa.codigo IN ('VER', 'ACCESO_VISUAL', 'CONSULTAR', 'LISTAR')
   ORDER BY pg.orden, pm.orden, pm.id_modulo, psa.codigo_permiso
`;

function positiveId(value) {
  const valueNumber = Number(value);
  return Number.isSafeInteger(valueNumber) && valueNumber > 0 ? valueNumber : null;
}

function denied(message, code = 'OFFLINE_CATALOG_ACCESS_DENIED') {
  const error = new Error(message);
  error.status = 403;
  error.code = code;
  return error;
}

function scopeFingerprint(domain, master, ids) {
  const normal = Array.isArray(ids) ? [...new Set(ids.map(positiveId).filter(Boolean))].sort((a,b)=>a-b) : null;
  const subject = domain === 'UNITED' ? 'zones' : domain === 'CORELLIAN' ? 'users' : 'relations';
  const signatureBody = {domain, master: Boolean(master), [subject]: normal};
  return crypto.createHash('sha256').update(JSON.stringify(signatureBody)).digest('hex');
}

function readScopeSummary(scope, domain) {
  if (!scope || scope.empresa !== domain || !scope.motor) return null;
  if (scope.llave_maestra === true) {
    return { mode: 'DOMINIO_COMPLETO', master_key: true, zone_ids: null, zones: null,
      scope_signature: scopeFingerprint(domain, true, null) };
  }
  if (domain === 'UNITED') {
    if (scope.requiere_filtro_zona !== true || !Array.isArray(scope.zona_ids)) return null;
    const ids = [...new Set(scope.zona_ids.map(positiveId).filter(Boolean))].sort((a, b) => a-b);
    if (!ids.length) return null;
    const codes = Array.isArray(scope.zona_codigos)
      ? [...new Set(scope.zona_codigos.map(v => String(v || '').trim().toUpperCase()).filter(Boolean))].sort()
      : [];
    return { mode: 'ZONAS', master_key: false, zone_ids: ids, zones: codes,
      scope_signature: scopeFingerprint(domain, false, ids) };
  }
  if (domain === 'CORELLIAN') {
    if (scope.requiere_filtro_usuario !== true || !Array.isArray(scope.usuarios_visibles)) return null;
    const users = [...new Set(scope.usuarios_visibles.map(positiveId).filter(Boolean))];
    if (!users.length) return null;
    return { mode: 'USUARIOS', master_key: false, visible_user_count: users.length,
      scope_signature: scopeFingerprint(domain, false, users) };
  }
  if (domain === 'GENERAL') {
    return { mode: 'RELACION_DIRECTA', master_key: false, scope_signature: scopeFingerprint(domain, false, null) };
  }
  return null;
}

/**
 * Dependencias inyectables para tests, sin consultar BD durante require().
 * Validar permisos con el servicio oficial, puertas/alcance con el resolver oficial.
 */
async function listAuthorizedModules(req, injected = {}) {
  if (req?.informationAccess?.acceso_puerta !== true || req.informationAccess.dominio !== 'GENERAL') {
    throw denied('Se requiere la puerta autorizada de Modo Offline.');
  }
  const user = req.contextUser || req.user || {};
  const userId = positiveId(user.id_SB || user.id || user.user_id);
  if (!userId) throw denied('Usuario efectivo no disponible.', 'OFFLINE_EFFECTIVE_USER_REQUIRED');

  const connection = injected.connection || require('../../config/db');
  const permissionService = injected.permissions || require('../../services/permissions/effective-permission.service');
  const resolver = injected.resolver || require('../../services/alcance/alcance-resolver.service');
  const [rows] = await connection.query(CATALOG_SQL);
  if (!Array.isArray(rows)) throw new Error('El catalogo de permisos no devolvio filas validas.');

  const groupedModules = new Map();
  for (const row of rows) {
    const code = String(row.modulo_codigo || '').trim();
    const permissionCode = String(row.codigo_permiso || '').trim();
    const groupId = positiveId(row.id_agrupacion);
    const moduleId = positiveId(row.id_modulo);
    if (!code || !permissionCode || !groupId || !moduleId || code === OFFLINE_CONFIGURATION_MODULE) continue;
    const key = `${groupId}:${moduleId}`;
    if (!groupedModules.has(key)) groupedModules.set(key, {
      id: moduleId,
      code,
      name: String(row.modulo_nombre || code),
      route: String(row.ruta_frontend || '').trim() || null,
      group: {
        id_agrupacion: groupId,
        codigo: String(row.agrupacion_codigo || '').trim(),
        nombre: String(row.agrupacion_nombre || '').trim(),
        empresa: row.agrupacion_empresa,
        activo: row.agrupacion_activa
      },
      permissionCodes: []
    });
    groupedModules.get(key).permissionCodes.push(permissionCode);
  }

  const scopeByGrouping = new Map();
  const catalog = [];
  const candidates = [...groupedModules.values()];

  async function evaluateCandidate(candidate) {
    let allowedByPermission = false;
    for (const code of [...new Set(candidate.permissionCodes)]) {
      if (await permissionService.hasEffectivePermission(userId, code, connection)) {
        allowedByPermission = true;
        break;
      }
    }
    if (!allowedByPermission) return null;

    const groupingId = candidate.group.id_agrupacion;
    // Promise memoizada: un solo resolver oficial por puerta aun con concurrencia.
    if (!scopeByGrouping.has(groupingId)) {
      const scopeTask = (async () => {
        const grouping = candidate.group;
        const door = await resolver.resolveInformationDoor_gnral(connection, req, grouping);
        if (!door?.allowed) return null;
        const scope = await resolver.resolveAlcanceByGrouping_gnral(connection, req, grouping);
        const domain = resolver.normalizeGroupingCompany_gnral(grouping.empresa);
        const summary = readScopeSummary(scope, domain);
        return summary ? { domain, summary } : null;
      })();
      scopeByGrouping.set(groupingId, scopeTask);
    }
    const allowed = await scopeByGrouping.get(groupingId);
    if (!allowed) return null;
    return {
      code: candidate.code,
      name: candidate.name,
      route: candidate.route,
      grouping_code: candidate.group.codigo,
      grouping_name: candidate.group.nombre,
      domain: allowed.domain,
      scope: allowed.summary,
      backup_status: 'PENDIENTE_EXPORTACION',
      datasets: []
    };
  }

  // Evita cientos de consultas SQL secuenciales o inundar el pool Aiven.
  const batchSize = 6;
  for (let index = 0; index < candidates.length; index += batchSize) {
    const evaluated = await Promise.all(candidates.slice(index, index + batchSize).map(evaluateCandidate));
    catalog.push(...evaluated.filter(Boolean));
  }

  // Exportadores existentes que YA cuentan con su propio Guard y record scope.
  // No convertir el catalogo de permisos en permiso para exportar otro modulo.
  for (const module of catalog) {
    if (module.code === 'INSTALACIONES_PROYECTOS' && module.domain === 'CORELLIAN') {
      module.datasets = ['instalaciones-proyectos'];
      module.backup_status = 'EXPORTADOR_COMPLETO';
    }
    if (module.code === 'OPERACION_RESUMEN_DEL_DIA' && module.domain === 'UNITED') {
      module.datasets = ['operacion-resumen-dia'];
      module.backup_status = 'EXPORTADOR_COMPLETO';
    }
  }

  return catalog;
}

module.exports = {
  CATALOG_SQL,
  READ_ACTIONS,
  readScopeSummary,
  scopeFingerprint,
  listAuthorizedModules
};
