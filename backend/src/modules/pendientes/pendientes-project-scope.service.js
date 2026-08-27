'use strict';

const db = require('../../config/db');
const {
  normalizeGroupingCompany_gnral,
  resolveMasterAccess_gnral
} = require('../../services/alcance/alcance-resolver.service');
const {
  CORELLIAN_COMPANY,
  resolveAlcanceCor_cor,
  buildResolvedUserColumnsScopeSql_cor
} = require('../../services/alcance/alcance-cor.service');
const {
  UNITED_COMPANY,
  resolveAlcanceUni_uni,
  buildResolvedPortafolioScopeSql_uni
} = require('../../services/alcance/alcance-uni.service');

const COMPANY_LABELS_GNRAL = Object.freeze({
  [CORELLIAN_COMPANY]: 'Corellian SA de CV',
  [UNITED_COMPANY]: 'United Elevadores'
});

function httpError_gnral(message, status = 500, code = 'PENDIENTE_PROJECT_SCOPE_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = status < 500;
  return error;
}

function effectiveUser_gnral(req) {
  return req?.contextUser || req?.user || {};
}

function text_gnral(value, max = 255) {
  const valueText = value == null ? '' : String(value).trim();
  return max ? valueText.slice(0, max) : valueText;
}

function normalizeSupportedCompany_gnral(value) {
  const domain = normalizeGroupingCompany_gnral(value);
  return domain === CORELLIAN_COMPANY || domain === UNITED_COMPANY ? domain : null;
}

function companyLabel_gnral(domain, fallback = null) {
  return COMPANY_LABELS_GNRAL[domain] || text_gnral(fallback, 150) || null;
}

function uniqueStrings_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => text_gnral(value, 150))
    .filter(Boolean))];
}

async function resolveMasterKeys_gnral(executor, req) {
  const corellian = await resolveMasterAccess_gnral(executor, req, CORELLIAN_COMPANY);
  const united = await resolveMasterAccess_gnral(executor, req, UNITED_COMPANY);

  const corellianEnabled = corellian?.enabled === true;
  const unitedEnabled = united?.enabled === true;
  return {
    corellian: corellianEnabled,
    united: unitedEnabled,
    ambas: corellianEnabled && unitedEnabled
  };
}

async function resolveTaskCompanyContext_gnral(executor, req, requestedCompany) {
  const user = effectiveUser_gnral(req);
  const defaultRaw = text_gnral(user.empresa, 150);
  const defaultDomain = normalizeSupportedCompany_gnral(defaultRaw);
  const requestedRaw = text_gnral(requestedCompany, 150);
  const requestedDomain = requestedRaw
    ? normalizeSupportedCompany_gnral(requestedRaw)
    : null;
  const masters = await resolveMasterKeys_gnral(executor, req);

  if (requestedRaw && !requestedDomain) {
    if (!defaultDomain || requestedRaw.toLowerCase() !== defaultRaw.toLowerCase()) {
      throw httpError_gnral(
        'La empresa seleccionada no corresponde a Corellian SA de CV o United Elevadores.',
        400,
        'PENDIENTE_EMPRESA_NO_SOPORTADA'
      );
    }
  }

  // La seleccion cruzada de razon social se habilita exclusivamente cuando
  // el usuario efectivo tiene simultaneamente las dos llaves maestras.
  if (masters.ambas) {
    const selectedDomain = requestedDomain || defaultDomain;
    if (!selectedDomain) {
      throw httpError_gnral(
        'No fue posible determinar la empresa predeterminada del usuario.',
        409,
        'PENDIENTE_EMPRESA_DEFAULT_NO_RESUELTA'
      );
    }

    const defaultLabel = defaultRaw || companyLabel_gnral(defaultDomain);
    const selectedLabel = selectedDomain === defaultDomain
      ? defaultLabel
      : companyLabel_gnral(selectedDomain, requestedRaw);
    const companies = uniqueStrings_gnral([
      defaultLabel,
      companyLabel_gnral(defaultDomain === CORELLIAN_COMPANY ? UNITED_COMPANY : CORELLIAN_COMPANY),
      companyLabel_gnral(selectedDomain)
    ]).filter(value => normalizeSupportedCompany_gnral(value));

    return {
      user,
      masters,
      domain: selectedDomain,
      empresaDefault: defaultLabel,
      empresaSeleccionada: selectedLabel,
      empresasPermitidas: companies,
      puedeSeleccionarEmpresa: true
    };
  }

  // Sin ambas llaves, la empresa del usuario es la autoridad. El rol,
  // multiempresa o cualquier bandera legacy no amplian el selector.
  if (defaultDomain) {
    if (requestedDomain && requestedDomain !== defaultDomain) {
      throw httpError_gnral(
        'No tienes autorizacion para cambiar la razon social de esta tarea.',
        403,
        'PENDIENTE_EMPRESA_FORBIDDEN'
      );
    }

    const defaultLabel = defaultRaw || companyLabel_gnral(defaultDomain);
    return {
      user,
      masters,
      domain: defaultDomain,
      empresaDefault: defaultLabel,
      empresaSeleccionada: defaultLabel,
      empresasPermitidas: [defaultLabel],
      puedeSeleccionarEmpresa: false
    };
  }

  // Compatibilidad fail-closed para otras empresas existentes: la tarea puede
  // seguir identificando su empresa, pero no obtiene catalogo CORELLIAN/UNITED.
  if (requestedRaw && defaultRaw && requestedRaw.toLowerCase() !== defaultRaw.toLowerCase()) {
    throw httpError_gnral(
      'No tienes autorizacion para cambiar la razon social de esta tarea.',
      403,
      'PENDIENTE_EMPRESA_FORBIDDEN'
    );
  }

  return {
    user,
    masters,
    domain: null,
    empresaDefault: defaultRaw || null,
    empresaSeleccionada: defaultRaw || requestedRaw || null,
    empresasPermitidas: uniqueStrings_gnral([defaultRaw || requestedRaw]),
    puedeSeleccionarEmpresa: false
  };
}

async function resolveDomainScope_gnral(executor, req, companyContext) {
  if (!companyContext?.domain) return null;

  if (companyContext.domain === CORELLIAN_COMPANY) {
    return resolveAlcanceCor_cor(executor, req, {
      masterAccess: companyContext.masters.corellian === true
    });
  }

  if (companyContext.domain === UNITED_COMPANY) {
    return resolveAlcanceUni_uni(executor, req, {
      masterAccess: companyContext.masters.united === true
    });
  }

  return null;
}

function likeParam_gnral(value) {
  const search = text_gnral(value, 255);
  return search ? `%${search}%` : null;
}

function formatProyectoNombre_gnral(value) {
  const raw = text_gnral(value, 255);
  const match = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return raw;

  const numero = String(Number(match[1]) || match[1].replace(/^0+/, '') || match[1]);
  const meses = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  const mes = meses[match[2]] || match[2];
  const dia = String(Number(match[3]) || match[3]);
  return `${dia} de ${mes} #${numero}`;
}

async function listAreas_gnral(executor) {
  const [rows] = await executor.query(`
    SELECT DISTINCT area AS value
    FROM usuarios
    WHERE estado = 1
      AND area IS NOT NULL
      AND TRIM(area) <> ''
    ORDER BY area ASC
  `);
  return rows.map(row => row.value).filter(Boolean);
}

async function listUsersByCompany_gnral(executor, companyLabel) {
  if (!companyLabel) return [];
  const [rows] = await executor.query(`
    SELECT id_SB, nombre, iniciales, correo, area, puesto, empresa
    FROM usuarios
    WHERE estado = 1
      AND LOWER(TRIM(empresa)) = LOWER(TRIM(?))
    ORDER BY nombre ASC
  `, [companyLabel]);
  return rows;
}

function corellianScopeSql_gnral(scope) {
  return buildResolvedUserColumnsScopeSql_cor(
    scope,
    ['f.id_asesor', 'f.id_sup', 'f.id_admin']
  );
}

function unitedScopeSql_gnral(scope) {
  return buildResolvedPortafolioScopeSql_uni(scope, 'p');
}

async function listCorellianProjects_gnral(executor, scope, search) {
  const scoped = corellianScopeSql_gnral(scope);
  const params = [...scoped.params];
  let searchSql = '';
  if (search) {
    searchSql = ' AND f.proyecto LIKE ?';
    params.push(search);
  }

  const [rows] = await executor.query(`
    SELECT DISTINCT TRIM(f.proyecto) AS proyecto
    FROM ins_fl f
    WHERE f.activo = 1
      AND f.proyecto IS NOT NULL
      AND TRIM(f.proyecto) <> ''
      AND ${scoped.sql}
      ${searchSql}
    ORDER BY proyecto ASC
    LIMIT 250
  `, params);
  return rows;
}

async function listUnitedProjects_gnral(executor, scope, search) {
  const scoped = unitedScopeSql_gnral(scope);
  const params = [...scoped.params];
  let searchSql = '';
  if (search) {
    searchSql = ' AND p.proyecto LIKE ?';
    params.push(search);
  }

  const [rows] = await executor.query(`
    SELECT DISTINCT TRIM(p.proyecto) AS proyecto
    FROM portafolio p
    WHERE p.estado_registro = 1
      AND p.proyecto IS NOT NULL
      AND TRIM(p.proyecto) <> ''
      AND ${scoped.sql}
      ${searchSql}
    ORDER BY proyecto ASC
    LIMIT 250
  `, params);
  return rows;
}

async function listCorellianEquipment_gnral(executor, scope, project, search) {
  if (!project) return [];
  const scoped = corellianScopeSql_gnral(scope);
  const params = [project, ...scoped.params];
  let searchSql = '';
  if (search) {
    searchSql = ' AND (f.referencia_sitio LIKE ? OR f.id_proyecto LIKE ?)';
    params.push(search, search);
  }

  const [rows] = await executor.query(`
    SELECT DISTINCT
      TRIM(f.referencia_sitio) AS numero_equipo,
      TRIM(f.referencia_sitio) AS identificacion_sitio,
      TRIM(f.proyecto) AS proyecto,
      TRIM(f.id_proyecto) AS id_proyecto
    FROM ins_fl f
    WHERE f.activo = 1
      AND LOWER(TRIM(COALESCE(f.proyecto, ''))) = LOWER(TRIM(?))
      AND f.referencia_sitio IS NOT NULL
      AND TRIM(f.referencia_sitio) <> ''
      AND ${scoped.sql}
      ${searchSql}
    ORDER BY identificacion_sitio ASC, numero_equipo ASC
    LIMIT 500
  `, params);
  return rows;
}

async function listUnitedEquipment_gnral(executor, scope, project, search) {
  if (!project) return [];
  const scoped = unitedScopeSql_gnral(scope);
  const params = [project, ...scoped.params];
  let searchSql = '';
  if (search) {
    searchSql = ' AND (p.numero_equipo LIKE ? OR p.identificacion_sitio LIKE ?)';
    params.push(search, search);
  }

  const [rows] = await executor.query(`
    SELECT DISTINCT
      p.numero_equipo,
      p.identificacion_sitio,
      p.proyecto
    FROM portafolio p
    WHERE p.estado_registro = 1
      AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
      AND p.numero_equipo IS NOT NULL
      AND TRIM(p.numero_equipo) <> ''
      AND ${scoped.sql}
      ${searchSql}
    ORDER BY p.identificacion_sitio ASC, p.numero_equipo ASC
    LIMIT 500
  `, params);
  return rows;
}

async function listProjects_gnral(executor, context, scope, search) {
  if (!context.domain || !scope) return [];
  if (context.domain === CORELLIAN_COMPANY) {
    return listCorellianProjects_gnral(executor, scope, search);
  }
  if (context.domain === UNITED_COMPANY) {
    return listUnitedProjects_gnral(executor, scope, search);
  }
  return [];
}

async function listEquipment_gnral(executor, context, scope, project, search) {
  if (!context.domain || !scope || !project) return [];
  if (context.domain === CORELLIAN_COMPANY) {
    return listCorellianEquipment_gnral(executor, scope, project, search);
  }
  if (context.domain === UNITED_COMPANY) {
    return listUnitedEquipment_gnral(executor, scope, project, search);
  }
  return [];
}

async function projectAllowed_gnral(executor, context, scope, project) {
  const projectValue = text_gnral(project, 255);
  if (!projectValue) return true;

  if (context.domain === CORELLIAN_COMPANY) {
    const scoped = corellianScopeSql_gnral(scope);
    const [rows] = await executor.query(`
      SELECT 1
      FROM ins_fl f
      WHERE f.activo = 1
        AND LOWER(TRIM(COALESCE(f.proyecto, ''))) = LOWER(TRIM(?))
        AND ${scoped.sql}
      LIMIT 1
    `, [projectValue, ...scoped.params]);
    return rows.length > 0;
  }

  if (context.domain === UNITED_COMPANY) {
    const scoped = unitedScopeSql_gnral(scope);
    const [rows] = await executor.query(`
      SELECT 1
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
        AND ${scoped.sql}
      LIMIT 1
    `, [projectValue, ...scoped.params]);
    return rows.length > 0;
  }

  return false;
}

async function equipmentAllowed_gnral(executor, context, scope, project, equipment) {
  const projectValue = text_gnral(project, 255);
  const equipmentValue = text_gnral(equipment, 255);
  if (!equipmentValue) return true;
  if (!projectValue) return false;

  if (context.domain === CORELLIAN_COMPANY) {
    const scoped = corellianScopeSql_gnral(scope);
    const [rows] = await executor.query(`
      SELECT 1
      FROM ins_fl f
      WHERE f.activo = 1
        AND LOWER(TRIM(COALESCE(f.proyecto, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(f.referencia_sitio, ''))) = LOWER(TRIM(?))
        AND ${scoped.sql}
      LIMIT 1
    `, [projectValue, equipmentValue, ...scoped.params]);
    return rows.length > 0;
  }

  if (context.domain === UNITED_COMPANY) {
    const scoped = unitedScopeSql_gnral(scope);
    const [rows] = await executor.query(`
      SELECT 1
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(p.numero_equipo, ''))) = LOWER(TRIM(?))
        AND ${scoped.sql}
      LIMIT 1
    `, [projectValue, equipmentValue, ...scoped.params]);
    return rows.length > 0;
  }

  return false;
}

function scopeSummary_gnral(scope) {
  if (!scope) return null;
  return {
    motor: scope.motor || null,
    empresa: scope.empresa || null,
    llave_maestra: scope.llave_maestra === true,
    requiere_filtro_usuario: scope.requiere_filtro_usuario === true,
    requiere_filtro_zona: scope.requiere_filtro_zona === true
  };
}

async function getPendientesCatalogos_gnral(req, res) {
  let connection;
  try {
    connection = await db.getConnection();
    const context = await resolveTaskCompanyContext_gnral(
      connection,
      req,
      req.query?.empresa
    );
    const scope = await resolveDomainScope_gnral(connection, req, context);
    const project = text_gnral(req.query?.proyecto, 255);
    const projectSearch = likeParam_gnral(req.query?.search);
    const equipmentSearch = likeParam_gnral(req.query?.equipo || req.query?.search);

    const areas = await listAreas_gnral(connection);
    const usuarios = await listUsersByCompany_gnral(connection, context.empresaSeleccionada);
    const proyectos = await listProjects_gnral(connection, context, scope, projectSearch);
    const equipos = await listEquipment_gnral(
      connection,
      context,
      scope,
      project,
      equipmentSearch
    );

    return res.status(200).json({
      ok: true,
      source: 'aiven',
      data: {
        areas,
        empresas: context.empresasPermitidas,
        empresa_default: context.empresaDefault,
        empresa_seleccionada: context.empresaSeleccionada,
        puede_seleccionar_empresa: context.puedeSeleccionarEmpresa,
        usuarios,
        proyectos: proyectos
          .map(row => ({
            proyecto_codigo: row.proyecto,
            proyecto_nombre: formatProyectoNombre_gnral(row.proyecto)
          }))
          .filter(row => row.proyecto_codigo),
        equipos,
        alcance_proyectos: scopeSummary_gnral(scope)
      }
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok: false,
      code: error?.code || 'PENDIENTE_PROJECT_SCOPE_ERROR',
      message: status < 500
        ? error.message
        : 'No fue posible resolver el alcance de proyectos de la tarea.'
    });
  } finally {
    if (connection) connection.release();
  }
}

async function validateTaskProjectSelection_gnral(req, res, next) {
  let connection;
  try {
    connection = await db.getConnection();
    const company = text_gnral(req.body?.empresa, 150);
    const project = text_gnral(req.body?.proyecto, 255);
    const equipment = text_gnral(req.body?.equipo, 255);
    const context = await resolveTaskCompanyContext_gnral(connection, req, company);
    const scope = await resolveDomainScope_gnral(connection, req, context);

    if (project && (!scope || !(await projectAllowed_gnral(connection, context, scope, project)))) {
      throw httpError_gnral(
        'El proyecto seleccionado no pertenece al alcance de informacion autorizado.',
        403,
        'PENDIENTE_PROYECTO_FUERA_ALCANCE'
      );
    }

    if (equipment && !project) {
      throw httpError_gnral(
        'Selecciona un proyecto antes de seleccionar un equipo.',
        400,
        'PENDIENTE_EQUIPO_REQUIERE_PROYECTO'
      );
    }

    if (equipment && (!scope || !(await equipmentAllowed_gnral(
      connection,
      context,
      scope,
      project,
      equipment
    )))) {
      throw httpError_gnral(
        'El equipo seleccionado no pertenece al proyecto y alcance autorizados.',
        403,
        'PENDIENTE_EQUIPO_FUERA_ALCANCE'
      );
    }

    // Compatibilidad con el servicio de persistencia actual de Pendientes.
    // El alcance YA fue validado arriba con las llaves/engines centrales; aqui
    // solo se entrega, dentro de esta solicitud, la empresa efectiva elegida.
    // No se modifica el usuario almacenado ni se concede alcance adicional.
    if (context.empresaSeleccionada) {
      if (req.contextUser) {
        req.contextUser = {
          ...req.contextUser,
          empresa: context.empresaSeleccionada,
          multiempresa: context.masters.ambas === true || req.contextUser.multiempresa === true
        };
      } else if (req.user) {
        req.user = {
          ...req.user,
          empresa: context.empresaSeleccionada,
          multiempresa: context.masters.ambas === true || req.user.multiempresa === true
        };
      }
      if (req.body) req.body.empresa = context.empresaSeleccionada;
    }

    req.pendientesProjectScope = {
      empresa: context.empresaSeleccionada,
      dominio: context.domain,
      puede_seleccionar_empresa: context.puedeSeleccionarEmpresa,
      alcance: scopeSummary_gnral(scope)
    };

    return next();
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok: false,
      code: error?.code || 'PENDIENTE_PROJECT_SCOPE_ERROR',
      message: status < 500
        ? error.message
        : 'No fue posible validar el alcance de proyecto/equipo de la tarea.'
    });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getPendientesCatalogos_gnral,
  validateTaskProjectSelection_gnral,
  resolveMasterKeys_gnral,
  resolveTaskCompanyContext_gnral,
  resolveDomainScope_gnral,
  projectAllowed_gnral,
  equipmentAllowed_gnral
};
