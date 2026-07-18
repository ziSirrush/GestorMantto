const homeRepository = require('./home.repository');

function currentUserRef(req) {
  const user = req.user || {};
  return {
    id: user.id_SB || user.id || null,
    correo: user.correo || user.email || null,
    iniciales: user.iniciales || null,
    empresa: user.empresa || null,
    rol: user.rol || user.role || user.puesto || null,
    roles: Array.isArray(user.roles) ? user.roles : [],
    multiempresa: Boolean(
      user.multiempresa ||
      user.multi_empresa ||
      user.doble_empresa ||
      user.ver_dos_empresas ||
      user.todas_empresas ||
      user.is_programador
    )
  };
}

function userCanSelectMultipleEmpresas(user) {
  const roles = [user.rol]
    .concat(Array.isArray(user.roles) ? user.roles : [])
    .map(role => String(role || '').toLowerCase());

  return Boolean(
    user.multiempresa ||
    roles.some(role => role.includes('director general') || role.includes('programador'))
  );
}

async function resolveAllowedEmpresas(user) {
  const rows = await homeRepository.getAllowedEmpresas();
  const all = rows.map(row => row.value).filter(Boolean);
  if (!user.empresa || userCanSelectMultipleEmpresas(user)) return all;
  return all.includes(user.empresa) ? [user.empresa] : [user.empresa];
}

function buildUserTaskScope(user) {
  const correo = String(user.correo || '').trim().toLowerCase();
  const iniciales = String(user.iniciales || '').trim().toUpperCase();

  const where = `
    (
      (p.tipo_pendiente = 'PERSONAL' AND LOWER(TRIM(p.creado_por_email)) = ?)
      OR
      (
        p.tipo_pendiente = 'COLABORATIVA'
        AND (
          LOWER(TRIM(p.creado_por_email)) = ?
          OR EXISTS (
            SELECT 1
            FROM pendientes_usuarios pu_auth
            WHERE pu_auth.id_pendiente = p.id_pendiente
              AND pu_auth.tipo_relacion = 'RESPONSABLE'
              AND UPPER(TRIM(pu_auth.iniciales_usuario)) = ?
          )
        )
      )
    )
  `;

  return { correo, iniciales, where, params: [correo, correo, iniciales] };
}

function formatProyectoNombre(value) {
  const raw = String(value || '').trim();
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

function decorateProyectoRow(row) {
  if (!row) return row;
  const codigo = row.proyecto_codigo || row.proyecto;
  const rawNombre = row.nombre_publico || row.proyecto_nombre || row.proyecto_cc_x_port || codigo;
  return {
    ...row,
    proyecto_codigo: codigo,
    proyecto_nombre: row.nombre_publico || formatProyectoNombre(rawNombre || codigo)
  };
}

async function getHomeBootstrap(req) {
  const user = currentUserRef(req);
  const scope = buildUserTaskScope(user);

  if (!scope.correo || !scope.iniciales) {
    return {
      status: 401,
      body: { ok: false, message: 'Sesion sin usuario valido para consultar Home.' }
    };
  }

  const allowedEmpresas = await resolveAllowedEmpresas(user);
  const empresa = allowedEmpresas.length === 1 ? allowedEmpresas[0] : (user.empresa || null);

  const pendientes = await homeRepository.getPendientes(scope.where, scope.params);

  const notifParams = [];
  let notifWhere = 'WHERE n.activo = 1';
  if (user.id) {
    notifWhere += ' AND n.id_usuario = ?';
    notifParams.push(user.id);
  }
  notifWhere += ` AND (
    n.accion_notificacion <> 'ABRIR_TAREA'
    OR n.id_referencia IS NULL
    OR EXISTS (
      SELECT 1
      FROM pendientes p
      WHERE p.id_pendiente = n.id_referencia
        AND ${scope.where}
    )
  )`;
  const notifScopedParams = [...notifParams, ...scope.params];

  const notificacionesNuevas = await homeRepository.getNotificaciones(
    notifWhere,
    notifScopedParams,
    0,
    30
  );
  const notificacionesAbiertas = await homeRepository.getNotificaciones(
    notifWhere,
    notifScopedParams,
    1,
    80
  );
  const actividades = await homeRepository.getActividadReciente(scope.where, scope.params);
  const areasRows = await homeRepository.getAreas();
  const usuarios = await homeRepository.getUsuarios(empresa);
  const proyectos = await homeRepository.getProyectos(empresa);

  return {
    status: 200,
    body: {
      ok: true,
      source: 'aiven',
      data: {
        pendientes,
        notificaciones_nuevas: notificacionesNuevas,
        notificaciones_abiertas: notificacionesAbiertas,
        actividad_reciente: actividades,
        catalogos: {
          areas: areasRows.map(row => row.value).filter(Boolean),
          empresas: allowedEmpresas,
          usuarios,
          proyectos: proyectos
            .map(row => decorateProyectoRow({ proyecto: row.proyecto }))
            .filter(row => row.proyecto_codigo),
          equipos: []
        }
      }
    }
  };
}

async function getActividadReciente(req) {
  const user = currentUserRef(req);
  const scope = buildUserTaskScope(user);

  if (!scope.correo || !scope.iniciales) {
    return {
      status: 401,
      body: { ok: false, message: 'Sesion sin usuario valido para consultar actividad.' }
    };
  }

  const rows = await homeRepository.getActividadReciente(scope.where, scope.params);
  return {
    status: 200,
    body: { ok: true, source: 'aiven', data: rows }
  };
}

module.exports = {
  getHomeBootstrap,
  getActividadReciente
};
