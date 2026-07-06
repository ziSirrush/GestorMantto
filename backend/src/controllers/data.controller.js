const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadRoot = path.join(__dirname, '..', '..', 'uploads', 'pendientes');


function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? '%' + s + '%' : null;
}


function formatProyectoNombre(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d+)-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const numero = String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
  const meses = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  const mes = meses[m[2]] || m[2];
  const dia = String(Number(m[3]) || m[3]);
  return `${dia} de ${mes} #${numero}`;
}

function decorateProyectoRow(row) {
  if (!row) return row;
  return {
    ...row,
    proyecto_codigo: row.proyecto_codigo || row.proyecto,
    proyecto_nombre: row.proyecto_nombre || formatProyectoNombre(row.proyecto_codigo || row.proyecto)
  };
}

function portafolioFilters(req, alias) {
  const a = alias || 'p';
  const clauses = [
    `${a}.estado_registro = 1`,
    `(${a}.inactivo IS NULL OR UPPER(${a}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`
  ];
  const params = [];
  const zona = likeParam(req.query.zona);
  const tipo = likeParam(req.query.tipo);
  const supervisor = likeParam(req.query.supervisor);
  const search = likeParam(req.query.search || req.query.buscar);
  const operativo = String(req.query.operativo || '').trim().toLowerCase();

  if (zona) { clauses.push(`${a}.zona_operativa LIKE ?`); params.push(zona); }
  if (supervisor) { clauses.push(`${a}.supervisor_zona LIKE ?`); params.push(supervisor); }
  if (tipo) { clauses.push(`COALESCE(lt.tipo_equipo, ${a}.id_equipo_ns, 'Sin tipo') LIKE ?`); params.push(tipo); }
  if (search) {
    clauses.push(`(
      ${a}.numero_equipo LIKE ?
      OR ${a}.proyecto LIKE ?
      OR ${a}.ciudad LIKE ?
      OR ${a}.estado LIKE ?
      OR ${a}.identificacion_sitio LIKE ?
      OR ${a}.supervisor_zona LIKE ?
    )`);
    params.push(search, search, search, search, search, search);
  }
  if (operativo === 'parado') {
    clauses.push(`UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%'`);
  } else if (operativo === 'funcionando') {
    clauses.push(`(lt.ticket IS NULL OR UPPER(COALESCE(lt.estatus_equipo_final,'')) NOT LIKE '%NO FUNC%')`);
  }

  return { where: clauses.join(' AND '), params };
}

const latestTicketJoin = `
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (PARTITION BY t.codigo_equipo ORDER BY t.fecha_reporte DESC, t.id DESC) AS rn
      FROM tickets t
      WHERE t.codigo_equipo IS NOT NULL AND t.codigo_equipo <> ''
    ) ranked
    WHERE ranked.rn = 1
  ) lt ON lt.codigo_equipo = p.numero_equipo
`;

const portafolioBaseSelect = `
  p.id_portafolio,
  p.proyecto,
  p.ciudad,
  p.estado,
  p.numero_equipo,
  p.id_equipo_ns,
  p.identificacion_sitio,
  p.inactivo,
  p.estatus_servicio,
  p.causa_no_servicio,
  p.detalle_no_servicio,
  p.zona_operativa AS zona,
  p.direccion,
  p.motivo_inactivo,
  p.suspension_temporal,
  p.causa_suspension_temporal,
  p.fecha_instalacion,
  p.fecha_entrega,
  p.termino_garantia,
  p.fecha_recepcion_mantenimiento,
  p.mes_inicio_gratuitos,
  p.mes_termino_gratuitos,
  p.mes_objetivo_inicio_cobranza,
  p.fecha_ingreso_portafolio,
  p.superintendente,
  p.supervisor_zona AS supervisor,
  p.proyecto_cc_x_port,
  COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') AS tipo_equipo,
  lt.ticket AS ultimo_ticket,
  lt.fecha_reporte AS ultimo_fecha_reporte,
  lt.fecha_reporte AS fecha_inicio_paro,
  lt.estado_ticket AS ultimo_estado_ticket,
  lt.estatus_equipo_final AS ultimo_estatus_equipo_final,
  lt.responsabilidad AS ultima_responsabilidad,
  CASE
    WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
    WHEN p.mes_objetivo_inicio_cobranza IS NOT NULL AND TRIM(p.mes_objetivo_inicio_cobranza) <> '' THEN 'Cobranza'
    WHEN (p.mes_termino_gratuitos IS NOT NULL AND TRIM(p.mes_termino_gratuitos) <> '') OR (p.termino_garantia IS NOT NULL AND TRIM(p.termino_garantia) <> '') THEN 'Gratuito/Garantía'
    ELSE 'Servicio'
  END AS contrato,
  CASE
    WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado'
    ELSE 'Funcionando'
  END AS estado_operativo,
  CASE
    WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' AND lt.fecha_reporte IS NOT NULL THEN DATEDIFF(CURDATE(), DATE(lt.fecha_reporte))
    ELSE NULL
  END AS dias_parado
`;

async function getPortafolioFiltros(req, res) {
  try {
    const [zonas] = await db.query(`
      SELECT DISTINCT zona_operativa AS value
      FROM portafolio
      WHERE estado_registro = 1 AND zona_operativa IS NOT NULL AND zona_operativa <> ''
      ORDER BY zona_operativa ASC
    `);
    const [supervisores] = await db.query(`
      SELECT DISTINCT supervisor_zona AS value
      FROM portafolio
      WHERE estado_registro = 1 AND supervisor_zona IS NOT NULL AND supervisor_zona <> ''
      ORDER BY supervisor_zona ASC
    `);
    const [tipos] = await db.query(`
      SELECT DISTINCT COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') AS value
      FROM portafolio p
      ${latestTicketJoin}
      WHERE p.estado_registro = 1
        AND COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') IS NOT NULL
        AND COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') <> ''
      ORDER BY value ASC
    `);

    return res.json({
      ok: true,
      source: 'aiven',
      filters: {
        zonas: zonas.map(r => r.value).filter(Boolean),
        supervisores: supervisores.map(r => r.value).filter(Boolean),
        tipos: tipos.map(r => r.value).filter(Boolean)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando filtros de portafolio.', error: error.message });
  }
}

async function getPortafolioDashboard(req, res) {
  const filters = portafolioFilters(req, 'p');
  try {
    const [kpiRows] = await db.query(`
      SELECT
        COUNT(*) AS total_activos,
        SUM(CASE WHEN contrato = 'Servicio' THEN 1 ELSE 0 END) AS en_servicio,
        SUM(CASE WHEN contrato = 'Cobranza' THEN 1 ELSE 0 END) AS en_cobranza,
        SUM(CASE WHEN contrato = 'Gratuito/Garantía' THEN 1 ELSE 0 END) AS gratuito_garantia,
        SUM(CASE WHEN contrato = 'No en Servicio' THEN 1 ELSE 0 END) AS no_en_servicio,
        SUM(CASE WHEN estado_operativo = 'Funcionando' THEN 1 ELSE 0 END) AS funcionando,
        SUM(CASE WHEN estado_operativo = 'Parado' THEN 1 ELSE 0 END) AS parado
      FROM (
        SELECT
          CASE
            WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
            WHEN p.mes_objetivo_inicio_cobranza IS NOT NULL AND TRIM(p.mes_objetivo_inicio_cobranza) <> '' THEN 'Cobranza'
            WHEN (p.mes_termino_gratuitos IS NOT NULL AND TRIM(p.mes_termino_gratuitos) <> '') OR (p.termino_garantia IS NOT NULL AND TRIM(p.termino_garantia) <> '') THEN 'Gratuito/Garantía'
            ELSE 'Servicio'
          END AS contrato,
          CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado' ELSE 'Funcionando' END AS estado_operativo
        FROM portafolio p
        ${latestTicketJoin}
        WHERE ${filters.where}
      ) base
    `, filters.params);

    async function distBy(expr, params) {
      const [rows] = await db.query(`
        SELECT ${expr} AS label, COUNT(*) AS total
        FROM portafolio p
        ${latestTicketJoin}
        WHERE ${filters.where}
        GROUP BY ${expr}
        ORDER BY total DESC, label ASC
        LIMIT 12
      `, params || filters.params);
      return rows.map(r => ({ label: r.label || 'Sin dato', total: Number(r.total || 0) }));
    }

    const contratoExpr = `CASE
      WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
      WHEN p.mes_objetivo_inicio_cobranza IS NOT NULL AND TRIM(p.mes_objetivo_inicio_cobranza) <> '' THEN 'Cobranza'
      WHEN (p.mes_termino_gratuitos IS NOT NULL AND TRIM(p.mes_termino_gratuitos) <> '') OR (p.termino_garantia IS NOT NULL AND TRIM(p.termino_garantia) <> '') THEN 'Gratuito/Garantía'
      ELSE 'Servicio'
    END`;
    const operativoExpr = `CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado' ELSE 'Funcionando' END`;

    const [parados] = await db.query(`
      SELECT ${portafolioBaseSelect}
      FROM portafolio p
      ${latestTicketJoin}
      WHERE ${filters.where}
        AND UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%'
      ORDER BY dias_parado DESC, lt.fecha_reporte ASC
      LIMIT 50
    `, filters.params);

    return res.json({
      ok: true,
      source: 'aiven',
      kpis: kpiRows[0] || {},
      distribuciones: {
        contrato: await distBy(contratoExpr),
        operativo: await distBy(operativoExpr),
        tipo: await distBy(`COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo')`),
        zona: await distBy(`COALESCE(p.zona_operativa, 'Sin zona')`)
      },
      parados
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando dashboard de portafolio.', error: error.message });
  }
}

async function getPortafolioEquipos(req, res) {
  const page = positiveInt(req.query.page, 1, 1, 100000);
  const pageSize = positiveInt(req.query.page_size || req.query.pageSize, 25, 5, 100);
  const offset = (page - 1) * pageSize;
  const filters = portafolioFilters(req, 'p');
  try {
    const [countRows] = await db.query(`
      SELECT COUNT(*) AS total
      FROM portafolio p
      ${latestTicketJoin}
      WHERE ${filters.where}
    `, filters.params);

    const [rows] = await db.query(`
      SELECT ${portafolioBaseSelect}
      FROM portafolio p
      ${latestTicketJoin}
      WHERE ${filters.where}
      ORDER BY p.proyecto ASC, p.numero_equipo ASC
      LIMIT ? OFFSET ?
    `, [...filters.params, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando equipos de portafolio.', error: error.message });
  }
}

async function getPortafolioEquipoDetalle(req, res) {
  const codigo = String(req.params.codigo || '').trim();
  if (!codigo) return res.status(400).json({ ok: false, message: 'No se recibio numero de equipo.' });
  try {
    const [rows] = await db.query(`
      SELECT ${portafolioBaseSelect}
      FROM portafolio p
      ${latestTicketJoin}
      WHERE p.numero_equipo = ?
      LIMIT 1
    `, [codigo]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Equipo no encontrado en portafolio.' });
    return res.json({ ok: true, source: 'aiven', data: rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de equipo.', error: error.message });
  }
}

async function saveTicketVobo(req, res) {
  const ticket = String(req.params.ticket || '').trim();
  const voboEstado = String(req.body?.vobo_estado || '').trim() || 'Pendiente';
  const voboComentario = String(req.body?.vobo_comentario || '').trim();

  if (!ticket) {
    return res.status(400).json({ ok: false, message: 'No se recibio ticket.' });
  }

  try {
    const [result] = await db.query(
      `UPDATE tickets
       SET vobo_estado = ?,
           vobo_comentario = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE ticket = ? OR folio = ?
       LIMIT 1`,
      [voboEstado, voboComentario, ticket, ticket]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
    }

    return res.json({
      ok: true,
      message: 'Vo.Bo. guardado correctamente.',
      data: {
        ticket,
        vobo_estado: voboEstado,
        vobo_comentario: voboComentario
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error guardando Vo.Bo.',
      error: error.message
    });
  }
}

async function getTickets(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM tickets
      ORDER BY id DESC
      LIMIT 50000
    `);

    return res.json({ ok: true, source: 'tickets', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando tickets.',
      error: error.message
    });
  }
}

async function getPortafolio(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM portafolio
      LIMIT 50000
    `);

    return res.json({ ok: true, source: 'portafolio', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando portafolio.',
      error: error.message
    });
  }
}

async function getEquipos(req, res) {
  return getPortafolio(req, res);
}


function currentUserRef(req) {
  const user = req.user || {};
  return {
    id: user.id_SB || user.id || null,
    correo: user.correo || user.email || null,
    iniciales: user.iniciales || null,
    empresa: user.empresa || null,
    rol: user.rol || user.role || user.puesto || null,
    roles: Array.isArray(user.roles) ? user.roles : [],
    multiempresa: Boolean(user.multiempresa || user.multi_empresa || user.doble_empresa || user.ver_dos_empresas || user.todas_empresas || user.is_programador)
  };
}

function normalizeTaskType(value) {
  const t = String(value || 'PERSONAL').trim().toUpperCase();
  return t === 'COLABORATIVA' ? 'COLABORATIVA' : 'PERSONAL';
}

function normalizeTaskStatus(value) {
  const e = String(value || 'Pendiente').trim();
  if (e === 'En proceso' || e === 'Cerrado') return e;
  return 'Pendiente';
}

function normalizePriority(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback === undefined ? null : fallback;
  const p = String(value).trim().toUpperCase();
  if (['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(p)) return p;
  return fallback === undefined ? null : fallback;
}

function userCanSelectMultipleEmpresas(user) {
  const roles = [user.rol].concat(Array.isArray(user.roles) ? user.roles : []).map(r => String(r || '').toLowerCase());
  return Boolean(user.multiempresa || roles.some(rol => rol.includes('director general') || rol.includes('programador')));
}

async function resolveAllowedEmpresas(user) {
  const [rows] = await db.query(`
    SELECT DISTINCT empresa AS value
    FROM usuarios
    WHERE estado = 1 AND empresa IS NOT NULL AND empresa <> ''
    ORDER BY empresa ASC
  `);
  const all = rows.map(r => r.value).filter(Boolean);
  if (!user.empresa || userCanSelectMultipleEmpresas(user)) return all;
  return all.includes(user.empresa) ? [user.empresa] : [user.empresa];
}

function sanitizeText(value, max) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!max) return text;
  return text.slice(0, max);
}


function normalizeOptionalDate(value) {
  const raw = sanitizeText(value, 20);
  if (!raw) return null;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? raw : null;
}

function normalizeInitials(value) {
  return sanitizeText(value, 20).toUpperCase();
}

function uniqueInitials(values) {
  return Array.from(new Set((values || [])
    .map(value => normalizeInitials(typeof value === 'string' ? value : (value?.iniciales_usuario || value?.iniciales)))
    .filter(Boolean)));
}

function normalizeEmpresa(value) {
  return sanitizeText(value, 150) || null;
}

function savePendienteUpload(file, kind) {
  if (!file || typeof file !== 'object') return null;
  const name = sanitizeText(file.name || file.nombre_archivo || 'adjunto', 255) || 'adjunto';
  const mime = sanitizeText(file.type || file.tipo_archivo || '', 100) || 'application/octet-stream';
  const dataUrl = String(file.data || file.base64 || '').trim();
  if (!dataUrl) return null;
  const parts = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const base64 = parts ? parts[2] : dataUrl;
  let buffer;
  try { buffer = Buffer.from(base64, 'base64'); } catch (e) { return null; }
  if (!buffer.length) return null;
  const maxBytes = 8 * 1024 * 1024;
  if (buffer.length > maxBytes) throw new Error('El archivo excede 8 MB.');

  const safeExt = (path.extname(name).toLowerCase() || '').replace(/[^a-z0-9.]/g, '').slice(0, 12);
  const finalName = `${kind || 'adjunto'}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`;
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, finalName), buffer);
  return {
    nombre_archivo: name,
    archivo_url: `/uploads/pendientes/${finalName}`,
    tipo_archivo: mime
  };
}

async function getPendientesCatalogos(req, res) {
  try {
    const user = currentUserRef(req);
    const allowedEmpresas = await resolveAllowedEmpresas(user);
    let empresa = normalizeEmpresa(req.query.empresa);
    if (!empresa && allowedEmpresas.length === 1) empresa = allowedEmpresas[0];
    if (empresa && allowedEmpresas.length && !allowedEmpresas.includes(empresa)) empresa = allowedEmpresas[0] || null;
    const proyectoElegido = sanitizeText(req.query.proyecto, 255);
    const projectSearch = likeParam(req.query.proyecto || req.query.search || '');
    const equipoSearch = likeParam(req.query.equipo || req.query.search || '');

    const [areasRows] = await db.query(`
      SELECT DISTINCT area AS value
      FROM usuarios
      WHERE estado = 1 AND area IS NOT NULL AND area <> ''
      ORDER BY area ASC
    `);

    const empresasRows = allowedEmpresas.map(value => ({ value }));

    const usuariosParams = [];
    let usuariosWhere = 'estado = 1';
    if (empresa) {
      usuariosWhere += ' AND empresa = ?';
      usuariosParams.push(empresa);
    }
    const [usuarios] = await db.query(`
      SELECT id_SB, nombre, iniciales, correo, area, puesto, empresa
      FROM usuarios
      WHERE ${usuariosWhere}
      ORDER BY nombre ASC
    `, usuariosParams);

    const proyectosParams = [];
    let proyectosWhere = "estado_registro = 1 AND proyecto IS NOT NULL AND proyecto <> ''";
    if (empresa) {
      proyectosWhere += ' AND proyecto_cc_x_port = ?';
      proyectosParams.push(empresa);
    }
    if (projectSearch) {
      proyectosWhere += ' AND proyecto LIKE ?';
      proyectosParams.push(projectSearch);
    }
    const [proyectos] = await db.query(`
      SELECT DISTINCT proyecto
      FROM portafolio
      WHERE ${proyectosWhere}
      ORDER BY proyecto ASC
      LIMIT 250
    `, proyectosParams);

    const equiposParams = [];
    let equiposWhere = "estado_registro = 1 AND numero_equipo IS NOT NULL AND numero_equipo <> ''";
    if (empresa) {
      equiposWhere += ' AND proyecto_cc_x_port = ?';
      equiposParams.push(empresa);
    }
    if (proyectoElegido) {
      equiposWhere += ' AND proyecto = ?';
      equiposParams.push(proyectoElegido);
    }
    if (equipoSearch) {
      equiposWhere += ' AND (numero_equipo LIKE ? OR identificacion_sitio LIKE ?)';
      equiposParams.push(equipoSearch, equipoSearch);
    }

    const [equipos] = await db.query(`
      SELECT DISTINCT numero_equipo, identificacion_sitio, proyecto, proyecto_cc_x_port
      FROM portafolio
      WHERE ${equiposWhere}
      ORDER BY proyecto ASC, identificacion_sitio ASC, numero_equipo ASC
      LIMIT 500
    `, equiposParams);

    return res.json({
      ok: true,
      source: 'aiven',
      data: {
        areas: areasRows.map(r => r.value).filter(Boolean),
        empresas: empresasRows.map(r => r.value).filter(Boolean),
        usuarios,
        proyectos: proyectos.map(r => decorateProyectoRow({ proyecto: r.proyecto })).filter(r => r.proyecto_codigo),
        equipos
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando catalogos de pendientes.', error: error.message });
  }
}

async function getPendientes(req, res) {
  const type = String(req.query.tipo || req.query.tipo_pendiente || '').trim().toUpperCase();
  const status = String(req.query.estatus || '').trim();
  const search = likeParam(req.query.search || req.query.buscar);
  const limit = positiveInt(req.query.limit, 80, 1, 200);
  const clauses = [];
  const params = [];

  if (type === 'PERSONAL' || type === 'COLABORATIVA') {
    clauses.push('p.tipo_pendiente = ?');
    params.push(type);
  }
  if (['Pendiente', 'En proceso', 'Cerrado'].includes(status)) {
    clauses.push('p.estatus = ?');
    params.push(status);
  }
  if (search) {
    clauses.push(`(
      p.pendiente LIKE ? OR p.descripcion LIKE ? OR p.proyecto LIKE ? OR p.equipo LIKE ? OR p.area LIKE ?
    )`);
    params.push(search, search, search, search, search);
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  try {
    const [rows] = await db.query(`
      SELECT
        p.*,
        COALESCE(st.total_subtareas, 0) AS total_subtareas,
        COALESCE(st.subtareas_cerradas, 0) AS subtareas_cerradas,
        COALESCE(cm.total_comentarios, 0) AS total_comentarios,
        COALESCE(rel.responsables, '') AS responsables,
        COALESCE(rel.seguimiento, '') AS seguimiento
      FROM pendientes p
      LEFT JOIN (
        SELECT id_pendiente,
               COUNT(*) AS total_subtareas,
               SUM(CASE WHEN estatus = 'Cerrado' THEN 1 ELSE 0 END) AS subtareas_cerradas
        FROM pendientes_subtareas
        GROUP BY id_pendiente
      ) st ON st.id_pendiente = p.id_pendiente
      LEFT JOIN (
        SELECT id_pendiente, COUNT(*) AS total_comentarios
        FROM pendientes_comentarios
        GROUP BY id_pendiente
      ) cm ON cm.id_pendiente = p.id_pendiente
      LEFT JOIN (
        SELECT id_pendiente,
               GROUP_CONCAT(CASE WHEN tipo_relacion = 'RESPONSABLE' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS responsables,
               GROUP_CONCAT(CASE WHEN tipo_relacion = 'SEGUIMIENTO' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS seguimiento
        FROM pendientes_usuarios
        GROUP BY id_pendiente
      ) rel ON rel.id_pendiente = p.id_pendiente
      ${where}
      ORDER BY
        CASE p.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAJA' THEN 4 ELSE 5 END,
        CASE p.estatus WHEN 'Pendiente' THEN 1 WHEN 'En proceso' THEN 2 WHEN 'Cerrado' THEN 3 ELSE 4 END,
        CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
        p.due_date ASC,
        p.updated_at DESC
      LIMIT ?
    `, [...params, limit]);

    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando pendientes.', error: error.message });
  }
}

async function getPendienteDetalle(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  try {
    const [rows] = await db.query('SELECT * FROM pendientes WHERE id_pendiente = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });

    const [subtareas] = await db.query(`
      SELECT * FROM pendientes_subtareas
      WHERE id_pendiente = ?
      ORDER BY orden ASC, id_subtarea ASC
    `, [id]);
    const [usuarios] = await db.query(`
      SELECT pu.*, u.nombre, u.correo, u.area, u.puesto
      FROM pendientes_usuarios pu
      LEFT JOIN usuarios u ON u.iniciales = pu.iniciales_usuario
      WHERE pu.id_pendiente = ?
      ORDER BY pu.tipo_relacion ASC, pu.iniciales_usuario ASC
    `, [id]);
    const [comentarios] = await db.query(`
      SELECT pc.*, u.nombre, u.iniciales, u.correo
      FROM pendientes_comentarios pc
      LEFT JOIN usuarios u ON u.id_SB = pc.id_usuario
      WHERE pc.id_pendiente = ?
      ORDER BY pc.fecha ASC, pc.id_comentario ASC
    `, [id]);
    const comentarioIds = comentarios.map(c => c.id_comentario);
    let adjuntos = [];
    if (comentarioIds.length) {
      const placeholders = comentarioIds.map(() => '?').join(',');
      const [adjRows] = await db.query(`
        SELECT * FROM pendientes_comentarios_adjuntos
        WHERE id_comentario IN (${placeholders})
        ORDER BY fecha ASC, id_adjunto ASC
      `, comentarioIds);
      adjuntos = adjRows;
    }
    const adjuntosPorComentario = adjuntos.reduce((acc, row) => {
      const key = String(row.id_comentario);
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    return res.json({
      ok: true,
      source: 'aiven',
      data: {
        pendiente: rows[0],
        subtareas,
        usuarios,
        comentarios: comentarios.map(c => ({ ...c, adjuntos: adjuntosPorComentario[String(c.id_comentario)] || [] }))
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de pendiente.', error: error.message });
  }
}

async function syncPendienteChildren(conn, id, body, creator) {
  const tipo = normalizeTaskType(body.tipo_pendiente);
  const relationType = tipo === 'COLABORATIVA' ? 'RESPONSABLE' : 'SEGUIMIENTO';
  const usuarios = Array.isArray(body.usuarios) ? body.usuarios : [];
  const subtareas = Array.isArray(body.subtareas) ? body.subtareas : [];
  const creatorInitials = normalizeInitials(creator?.iniciales);
  const selectedInitials = uniqueInitials(usuarios);
  const filteredInitials = selectedInitials.filter(iniciales => iniciales !== creatorInitials);
  const blockedSelfAssignment = Boolean(creatorInitials && selectedInitials.includes(creatorInitials));

  await conn.query('DELETE FROM pendientes_usuarios WHERE id_pendiente = ?', [id]);
  for (const iniciales of filteredInitials) {
    await conn.query(
      'INSERT INTO pendientes_usuarios (id_pendiente, iniciales_usuario, tipo_relacion) VALUES (?, ?, ?)',
      [id, iniciales, relationType]
    );
  }

  if (body.rewrite_subtareas !== false) {
    await conn.query('DELETE FROM pendientes_subtareas WHERE id_pendiente = ?', [id]);
    let orden = 1;
    for (const st of subtareas) {
      const text = sanitizeText(typeof st === 'string' ? st : (st.subtarea || st.texto), 500);
      if (!text) continue;
      await conn.query(
        'INSERT INTO pendientes_subtareas (id_pendiente, subtarea, estatus, orden) VALUES (?, ?, ?, ?)',
        [id, text, normalizeTaskStatus(st.estatus) === 'Cerrado' ? 'Cerrado' : 'Pendiente', orden]
      );
      orden += 1;
    }
  }

  return { blockedSelfAssignment, insertedInitials: filteredInitials };
}

async function createTaskAssignmentNotifications(conn, idPendiente, body, creator, skipInitials) {
  const tipo = normalizeTaskType(body.tipo_pendiente);
  if (tipo !== 'COLABORATIVA') return { inserted: 0, recipients: [] };

  const skip = new Set((skipInitials || []).map(v => String(v || '').trim()).filter(Boolean));

  // Fuente principal: relaciones ya guardadas en pendientes_usuarios.
  // Esto evita depender exclusivamente del payload del frontend y garantiza que,
  // si la tarea quedo con responsables, tambien se creen sus notificaciones.
  let iniciales = [];
  const [relRows] = await conn.query(`
    SELECT iniciales_usuario
    FROM pendientes_usuarios
    WHERE id_pendiente = ?
      AND tipo_relacion = 'RESPONSABLE'
  `, [idPendiente]);
  iniciales = relRows.map(r => sanitizeText(r.iniciales_usuario, 20)).filter(Boolean);

  // Fallback para compatibilidad con payloads anteriores.
  if (!iniciales.length) {
    iniciales = (Array.isArray(body.usuarios) ? body.usuarios : [])
      .map(u => sanitizeText(typeof u === 'string' ? u : (u.iniciales_usuario || u.iniciales), 20))
      .filter(Boolean);
  }

  const creatorInitials = normalizeInitials(creator?.iniciales);
  iniciales = Array.from(new Set(iniciales.map(normalizeInitials))).filter(inicial => inicial && !skip.has(inicial) && inicial !== creatorInitials);
  if (!iniciales.length) return { inserted: 0, recipients: [] };

  const placeholders = iniciales.map(() => '?').join(',');
  const [usuarios] = await conn.query(`
    SELECT id_SB, nombre, iniciales
    FROM usuarios
    WHERE estado = 1 AND iniciales IN (${placeholders})
  `, iniciales);

  const tituloTarea = sanitizeText(body.pendiente, 120) || 'Tarea colaborativa';
  const creador = creator.iniciales || creator.correo || 'Usuario';
  let inserted = 0;
  const recipients = [];

  for (const usuario of usuarios) {
    if (!usuario.id_SB) continue;

    await conn.query(`
      INSERT INTO sup_notificaciones (
        id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
        icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
        leido, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
    `, [
      usuario.id_SB,
      'TAREA_ASIGNADA',
      'Nueva tarea colaborativa',
      `${creador} te asigno la tarea: ${tituloTarea}`,
      '✅',
      'ABRIR_TAREA',
      idPendiente,
      `home:tarea:${idPendiente}`
    ]);
    inserted += 1;
    recipients.push(usuario.iniciales);
  }

  return { inserted, recipients };
}

function notificationStateFilter(value) {
  const estado = String(value || '').trim().toLowerCase();
  if (['nuevas', 'nueva', 'unread', 'no_leidas', 'no-leidas'].includes(estado)) return 0;
  if (['abiertas', 'abierta', 'read', 'leidas', 'leida'].includes(estado)) return 1;
  return null;
}

async function createPendiente(req, res) {
  const user = currentUserRef(req);
  const body = req.body || {};
  const pendiente = sanitizeText(body.pendiente, 255);
  const dueDate = normalizeOptionalDate(body.due_date);
  if (!pendiente) return res.status(400).json({ ok: false, message: 'El pendiente es obligatorio.' });
  if (!user.correo || !user.iniciales) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const tipo = normalizeTaskType(body.tipo_pendiente);
    const [result] = await conn.query(`
      INSERT INTO pendientes (
        pendiente, tipo_pendiente, estatus, area, descripcion,
        creado_por_email, creado_por_iniciales, due_date,
        proyecto, equipo, photo_url, adjunto_url, con_subtareas, prioridad
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pendiente,
      tipo,
      normalizeTaskStatus(body.estatus),
      sanitizeText(body.area, 100) || null,
      sanitizeText(body.descripcion) || null,
      user.correo,
      user.iniciales,
      dueDate,
      sanitizeText(body.proyecto, 255) || null,
      sanitizeText(body.equipo, 100) || null,
      savePendienteUpload(body.photo_file, 'foto')?.archivo_url || sanitizeText(body.photo_url) || null,
      savePendienteUpload(body.adjunto_file, 'adjunto')?.archivo_url || sanitizeText(body.adjunto_url) || null,
      body.con_subtareas ? 1 : 0,
      tipo === 'COLABORATIVA' ? normalizePriority(body.prioridad, null) : normalizePriority(body.prioridad, 'MEDIA')
    ]);
    const id = result.insertId;
    const childrenResult = await syncPendienteChildren(conn, id, { ...body, tipo_pendiente: tipo }, user);
    const notificationResult = await createTaskAssignmentNotifications(conn, id, { ...body, tipo_pendiente: tipo, pendiente }, user);
    await conn.commit();
    return res.status(201).json({ ok: true, source: 'aiven', message: 'Pendiente creado correctamente.', id_pendiente: id, notificaciones_creadas: notificationResult.inserted, notificaciones_destinatarios: notificationResult.recipients, autoasignacion_bloqueada: childrenResult.blockedSelfAssignment });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: 'Error creando pendiente.', error: error.message });
  } finally {
    conn.release();
  }
}

async function updatePendiente(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  const body = req.body || {};
  const pendiente = sanitizeText(body.pendiente, 255);
  const dueDate = normalizeOptionalDate(body.due_date);
  if (!pendiente) return res.status(400).json({ ok: false, message: 'El pendiente es obligatorio.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [exists] = await conn.query('SELECT creado_por_email, tipo_pendiente FROM pendientes WHERE id_pendiente = ? LIMIT 1', [id]);
    if (!exists.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    }
    if (exists[0].creado_por_email !== user.correo) {
      await conn.rollback();
      return res.status(403).json({ ok: false, message: 'Solo el creador puede editar la configuracion general de la tarea.' });
    }

    const [oldRelRows] = await conn.query(`
      SELECT iniciales_usuario
      FROM pendientes_usuarios
      WHERE id_pendiente = ? AND tipo_relacion = 'RESPONSABLE'
    `, [id]);
    const oldResponsables = oldRelRows.map(r => r.iniciales_usuario).filter(Boolean);

    const tipo = normalizeTaskType(body.tipo_pendiente);
    await conn.query(`
      UPDATE pendientes SET
        pendiente = ?, tipo_pendiente = ?, area = ?, descripcion = ?, due_date = ?,
        proyecto = ?, equipo = ?, photo_url = ?, adjunto_url = ?, con_subtareas = ?, prioridad = ?
      WHERE id_pendiente = ?
    `, [
      pendiente,
      tipo,
      sanitizeText(body.area, 100) || null,
      sanitizeText(body.descripcion) || null,
      dueDate,
      sanitizeText(body.proyecto, 255) || null,
      sanitizeText(body.equipo, 100) || null,
      savePendienteUpload(body.photo_file, 'foto')?.archivo_url || sanitizeText(body.photo_url) || null,
      savePendienteUpload(body.adjunto_file, 'adjunto')?.archivo_url || sanitizeText(body.adjunto_url) || null,
      body.con_subtareas ? 1 : 0,
      tipo === 'COLABORATIVA' ? normalizePriority(body.prioridad, null) : normalizePriority(body.prioridad, 'MEDIA'),
      id
    ]);
    const childrenResult = await syncPendienteChildren(conn, id, { ...body, tipo_pendiente: tipo }, user);
    const notificationResult = await createTaskAssignmentNotifications(conn, id, { ...body, tipo_pendiente: tipo, pendiente }, user, oldResponsables);
    await conn.commit();
    return res.json({ ok: true, source: 'aiven', message: 'Pendiente actualizado correctamente.', notificaciones_creadas: notificationResult.inserted, notificaciones_destinatarios: notificationResult.recipients, autoasignacion_bloqueada: childrenResult.blockedSelfAssignment });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: 'Error actualizando pendiente.', error: error.message });
  } finally {
    conn.release();
  }
}

async function updatePendientePrioridad(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  try {
    const [rows] = await db.query(`
      SELECT p.tipo_pendiente, p.creado_por_email, pu.iniciales_usuario
      FROM pendientes p
      LEFT JOIN pendientes_usuarios pu
        ON pu.id_pendiente = p.id_pendiente
        AND pu.tipo_relacion = 'RESPONSABLE'
        AND pu.iniciales_usuario = ?
      WHERE p.id_pendiente = ?
      LIMIT 1
    `, [user.iniciales, id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    const row = rows[0];
    const isResponsible = Boolean(row.iniciales_usuario);
    const isCreator = user.correo && row.creado_por_email === user.correo;
    if (row.tipo_pendiente === 'COLABORATIVA' && !isResponsible) {
      return res.status(403).json({ ok: false, message: 'Solo un responsable puede definir la prioridad de una tarea colaborativa.' });
    }
    if (row.tipo_pendiente !== 'COLABORATIVA' && !isCreator) {
      return res.status(403).json({ ok: false, message: 'Solo el creador puede cambiar la prioridad de una tarea personal.' });
    }
    const prioridad = normalizePriority(req.body?.prioridad, null);
    const [result] = await db.query('UPDATE pendientes SET prioridad = ? WHERE id_pendiente = ?', [prioridad, id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    return res.json({ ok: true, source: 'aiven', message: 'Prioridad actualizada correctamente.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error actualizando prioridad.', error: error.message });
  }
}

async function updatePendienteEstatus(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  if (!user.correo) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });
  try {
    const [rows] = await db.query('SELECT creado_por_email FROM pendientes WHERE id_pendiente = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    if (rows[0].creado_por_email !== user.correo) {
      return res.status(403).json({ ok: false, message: 'Solo el creador puede cambiar el estatus de la tarea.' });
    }
    const [result] = await db.query('UPDATE pendientes SET estatus = ? WHERE id_pendiente = ?', [normalizeTaskStatus(req.body?.estatus), id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    return res.json({ ok: true, source: 'aiven', message: 'Estatus actualizado correctamente.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error actualizando estatus.', error: error.message });
  }
}

async function createPendienteComentario(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  const comentario = sanitizeText(req.body?.comentario);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  if (!comentario) return res.status(400).json({ ok: false, message: 'El comentario es obligatorio.' });
  if (!user.id) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO pendientes_comentarios (id_pendiente, id_usuario, comentario) VALUES (?, ?, ?)',
      [id, user.id, comentario]
    );
    const adjuntos = [];
    const uploadedCommentFile = savePendienteUpload(req.body?.adjunto_file, 'comentario');
    if (uploadedCommentFile) adjuntos.push(uploadedCommentFile);
    if (Array.isArray(req.body?.adjuntos)) adjuntos.push(...req.body.adjuntos.slice(0, 1));
    for (const adj of adjuntos.slice(0, 1)) {
      const nombre = sanitizeText(adj.nombre_archivo || adj.nombre || 'Adjunto', 255);
      const url = sanitizeText(adj.archivo_url || adj.url, 500);
      if (!url) continue;
      await conn.query(
        'INSERT INTO pendientes_comentarios_adjuntos (id_comentario, nombre_archivo, archivo_url, tipo_archivo) VALUES (?, ?, ?, ?)',
        [result.insertId, nombre, url, sanitizeText(adj.tipo_archivo || adj.tipo, 100) || null]
      );
    }
    await conn.commit();
    return res.status(201).json({ ok: true, source: 'aiven', message: 'Comentario agregado correctamente.', id_comentario: result.insertId });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: 'Error agregando comentario.', error: error.message });
  } finally {
    conn.release();
  }
}

async function updatePendienteSubtarea(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const idSubtarea = Number.parseInt(req.params.idSubtarea, 10);
  if (!id || !idSubtarea) return res.status(400).json({ ok: false, message: 'No se recibio id de subtarea.' });
  const estatus = String(req.body?.estatus || '').trim() === 'Cerrado' ? 'Cerrado' : 'Pendiente';
  try {
    const [result] = await db.query(
      'UPDATE pendientes_subtareas SET estatus = ? WHERE id_pendiente = ? AND id_subtarea = ?',
      [estatus, id, idSubtarea]
    );
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Subtarea no encontrada.' });
    return res.json({ ok: true, source: 'aiven', message: 'Subtarea actualizada correctamente.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error actualizando subtarea.', error: error.message });
  }
}

async function deletePendiente(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const user = currentUserRef(req);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de pendiente.' });
  if (!user.correo) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT creado_por_email FROM pendientes WHERE id_pendiente = ? LIMIT 1', [id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: 'Pendiente no encontrado.' });
    }
    if (rows[0].creado_por_email !== user.correo) {
      await conn.rollback();
      return res.status(403).json({ ok: false, message: 'Solo el creador puede eliminar la tarea.' });
    }

    const [commentRows] = await conn.query('SELECT id_comentario FROM pendientes_comentarios WHERE id_pendiente = ?', [id]);
    const commentIds = commentRows.map(row => row.id_comentario).filter(Boolean);
    if (commentIds.length) {
      const placeholders = commentIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM pendientes_comentarios_adjuntos WHERE id_comentario IN (${placeholders})`, commentIds);
    }
    await conn.query('DELETE FROM pendientes_comentarios WHERE id_pendiente = ?', [id]);
    await conn.query('DELETE FROM pendientes_subtareas WHERE id_pendiente = ?', [id]);
    await conn.query('DELETE FROM pendientes_usuarios WHERE id_pendiente = ?', [id]);
    await conn.query('DELETE FROM sup_notificaciones WHERE id_referencia = ? AND accion_notificacion = ?', [id, 'ABRIR_TAREA']);
    await conn.query('DELETE FROM pendientes WHERE id_pendiente = ?', [id]);

    await conn.commit();
    return res.json({ ok: true, source: 'aiven', message: 'Tarea eliminada correctamente.' });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: 'Error eliminando tarea.', error: error.message });
  } finally {
    conn.release();
  }
}

async function getNotificaciones(req, res) {
  const user = currentUserRef(req);
  try {
    const params = [];
    let where = 'WHERE n.activo = 1';
    if (user.id) {
      where += ' AND n.id_usuario = ?';
      params.push(user.id);
    }

    const leido = notificationStateFilter(req.query.estado || req.query.status || req.query.tipo_vista);
    if (leido !== null) {
      where += ' AND n.leido = ?';
      params.push(leido);
    }

    const order = leido === 1
      ? 'ORDER BY COALESCE(n.fecha_lectura, n.fecha_creacion) DESC, n.fecha_creacion DESC'
      : 'ORDER BY n.fecha_creacion DESC';

    const limit = positiveInt(req.query.limit, leido === 1 ? 80 : 30, 1, 200);
    const [rows] = await db.query(`
      SELECT *
      FROM sup_notificaciones n
      ${where}
      ${order}
      LIMIT ?
    `, [...params, limit]);
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando notificaciones.', error: error.message });
  }
}

async function abrirNotificacion(req, res) {
  const user = currentUserRef(req);
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de notificacion.' });
  if (!user.id) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });
  try {
    const [result] = await db.query(`
      UPDATE sup_notificaciones
      SET leido = 1,
          fecha_lectura = COALESCE(fecha_lectura, NOW()),
          fecha_actualizacion = NOW()
      WHERE id_notificacion = ?
        AND id_usuario = ?
        AND activo = 1
    `, [id, user.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Notificacion no encontrada.' });
    return res.json({ ok: true, source: 'aiven', message: 'Notificacion marcada como abierta.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error abriendo notificacion.', error: error.message });
  }
}


async function marcarNotificacionNueva(req, res) {
  const user = currentUserRef(req);
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, message: 'No se recibio id de notificacion.' });
  if (!user.id) return res.status(401).json({ ok: false, message: 'Sesion sin usuario valido.' });
  try {
    const [result] = await db.query(`
      UPDATE sup_notificaciones
      SET leido = 0,
          fecha_lectura = NULL,
          fecha_actualizacion = NOW()
      WHERE id_notificacion = ?
        AND id_usuario = ?
        AND activo = 1
    `, [id, user.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Notificacion no encontrada.' });
    return res.json({ ok: true, source: 'aiven', message: 'Notificacion marcada como nueva.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error marcando notificacion como nueva.', error: error.message });
  }
}

async function getHomeBootstrap(req, res) {
  const user = currentUserRef(req);
  try {
    const allowedEmpresas = await resolveAllowedEmpresas(user);
    const empresa = (allowedEmpresas.length === 1 ? allowedEmpresas[0] : (user.empresa || null));

    const [pendientes] = await db.query(`
      SELECT
        p.*,
        COALESCE(st.total_subtareas, 0) AS total_subtareas,
        COALESCE(st.subtareas_cerradas, 0) AS subtareas_cerradas,
        COALESCE(cm.total_comentarios, 0) AS total_comentarios,
        COALESCE(rel.responsables, '') AS responsables,
        COALESCE(rel.seguimiento, '') AS seguimiento
      FROM pendientes p
      LEFT JOIN (
        SELECT id_pendiente,
               COUNT(*) AS total_subtareas,
               SUM(CASE WHEN estatus = 'Cerrado' THEN 1 ELSE 0 END) AS subtareas_cerradas
        FROM pendientes_subtareas
        GROUP BY id_pendiente
      ) st ON st.id_pendiente = p.id_pendiente
      LEFT JOIN (
        SELECT id_pendiente, COUNT(*) AS total_comentarios
        FROM pendientes_comentarios
        GROUP BY id_pendiente
      ) cm ON cm.id_pendiente = p.id_pendiente
      LEFT JOIN (
        SELECT id_pendiente,
               GROUP_CONCAT(CASE WHEN tipo_relacion = 'RESPONSABLE' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS responsables,
               GROUP_CONCAT(CASE WHEN tipo_relacion = 'SEGUIMIENTO' THEN iniciales_usuario END ORDER BY iniciales_usuario SEPARATOR ', ') AS seguimiento
        FROM pendientes_usuarios
        GROUP BY id_pendiente
      ) rel ON rel.id_pendiente = p.id_pendiente
      ORDER BY
        CASE p.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAJA' THEN 4 ELSE 5 END,
        CASE p.estatus WHEN 'Pendiente' THEN 1 WHEN 'En proceso' THEN 2 WHEN 'Cerrado' THEN 3 ELSE 4 END,
        CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
        p.due_date ASC,
        p.updated_at DESC
      LIMIT 200
    `);

    const notifParams = [];
    let notifWhere = 'WHERE activo = 1';
    if (user.id) { notifWhere += ' AND id_usuario = ?'; notifParams.push(user.id); }

    const [notificacionesNuevas] = await db.query(`
      SELECT * FROM sup_notificaciones
      ${notifWhere} AND leido = 0
      ORDER BY fecha_creacion DESC
      LIMIT 30
    `, notifParams);

    const [notificacionesAbiertas] = await db.query(`
      SELECT * FROM sup_notificaciones
      ${notifWhere} AND leido = 1
      ORDER BY COALESCE(fecha_lectura, fecha_creacion) DESC, fecha_creacion DESC
      LIMIT 80
    `, notifParams);

    const [actividades] = await db.query(`
      SELECT * FROM (
        SELECT
          p.id_pendiente AS id,
          'tareas' AS modulo,
          p.pendiente AS titulo,
          CONCAT('Pendiente ', LOWER(p.estatus), ' · ', p.tipo_pendiente) AS descripcion,
          p.updated_at AS fecha_creacion,
          '✅' AS icono,
          p.id_pendiente AS id_referencia
        FROM pendientes p
        UNION ALL
        SELECT
          pc.id_comentario AS id,
          'tareas' AS modulo,
          p.pendiente AS titulo,
          CONCAT(COALESCE(u.iniciales, 'Usuario'), ' agregó comentario') AS descripcion,
          pc.fecha AS fecha_creacion,
          '💬' AS icono,
          p.id_pendiente AS id_referencia
        FROM pendientes_comentarios pc
        INNER JOIN pendientes p ON p.id_pendiente = pc.id_pendiente
        LEFT JOIN usuarios u ON u.id_SB = pc.id_usuario
      ) x
      ORDER BY fecha_creacion DESC
      LIMIT 20
    `);

    const [areasRows] = await db.query(`
      SELECT DISTINCT area AS value
      FROM usuarios
      WHERE estado = 1 AND area IS NOT NULL AND area <> ''
      ORDER BY area ASC
    `);

    const usuariosParams = [];
    let usuariosWhere = 'estado = 1';
    if (empresa) { usuariosWhere += ' AND empresa = ?'; usuariosParams.push(empresa); }
    const [usuarios] = await db.query(`
      SELECT id_SB, nombre, iniciales, correo, area, puesto, empresa
      FROM usuarios
      WHERE ${usuariosWhere}
      ORDER BY nombre ASC
    `, usuariosParams);

    const proyectosParams = [];
    let proyectosWhere = "estado_registro = 1 AND proyecto IS NOT NULL AND proyecto <> ''";
    if (empresa) { proyectosWhere += ' AND proyecto_cc_x_port = ?'; proyectosParams.push(empresa); }
    const [proyectos] = await db.query(`
      SELECT DISTINCT proyecto
      FROM portafolio
      WHERE ${proyectosWhere}
      ORDER BY proyecto ASC
      LIMIT 250
    `, proyectosParams);

    return res.json({
      ok: true,
      source: 'aiven',
      data: {
        pendientes,
        notificaciones_nuevas: notificacionesNuevas,
        notificaciones_abiertas: notificacionesAbiertas,
        actividad_reciente: actividades,
        catalogos: {
          areas: areasRows.map(r => r.value).filter(Boolean),
          empresas: allowedEmpresas,
          usuarios,
          proyectos: proyectos.map(r => decorateProyectoRow({ proyecto: r.proyecto })).filter(r => r.proyecto_codigo),
          equipos: []
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando bootstrap de Home.', error: error.message });
  }
}

async function getActividadReciente(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        p.id_pendiente AS id,
        'tareas' AS modulo,
        p.pendiente AS titulo,
        CONCAT('Pendiente ', LOWER(p.estatus), ' · ', p.tipo_pendiente) AS descripcion,
        p.updated_at AS fecha_creacion,
        '✅' AS icono,
        p.id_pendiente AS id_referencia
      FROM pendientes p
      UNION ALL
      SELECT
        pc.id_comentario AS id,
        'tareas' AS modulo,
        p.pendiente AS titulo,
        CONCAT(COALESCE(u.iniciales, 'Usuario'), ' agregó comentario') AS descripcion,
        pc.fecha AS fecha_creacion,
        '💬' AS icono,
        p.id_pendiente AS id_referencia
      FROM pendientes_comentarios pc
      INNER JOIN pendientes p ON p.id_pendiente = pc.id_pendiente
      LEFT JOIN usuarios u ON u.id_SB = pc.id_usuario
      ORDER BY fecha_creacion DESC
      LIMIT 20
    `);
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando actividad reciente.', error: error.message });
  }
}

async function getUsuarios(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.puesto,
        u.area,
        u.empresa,
        u.rol_id,
        r.rol,
        r.descripcion AS rol_descripcion,
        u.correo,
        u.reporta_a,
        jefe.nombre AS reporta_a_nombre,
        u.estado,
        u.id_pregunta,
        ps.pregunta AS pregunta_seguridad,
        u.ultimo_acceso,
        u.created_at,
        u.updated_at,
        COALESCE(
          JSON_ARRAYAGG(
            CASE
              WHEN r2.id_rol IS NULL THEN NULL
              ELSE JSON_OBJECT(
                'id_rol', r2.id_rol,
                'rol', r2.rol,
                'principal', ur.principal,
                'activo', ur.activo
              )
            END
          ),
          JSON_ARRAY()
        ) AS roles_detalle
      FROM usuarios u
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
      LEFT JOIN usuarios jefe
        ON jefe.id_SB = u.reporta_a
      LEFT JOIN preguntas_seguridad ps
        ON ps.id_pregunta = u.id_pregunta
      LEFT JOIN usuario_roles ur
        ON ur.id_usuario = u.id_SB
       AND ur.activo = 1
      LEFT JOIN roles r2
        ON r2.id_rol = ur.id_rol
       AND r2.estado = 1
      GROUP BY
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.puesto,
        u.area,
        u.empresa,
        u.rol_id,
        r.rol,
        r.descripcion,
        u.correo,
        u.reporta_a,
        jefe.nombre,
        u.estado,
        u.id_pregunta,
        ps.pregunta,
        u.ultimo_acceso,
        u.created_at,
        u.updated_at
      ORDER BY
        CASE r.rol
          WHEN 'Director General' THEN 1
          WHEN 'Director Mantenimiento' THEN 2
          WHEN 'Director Finanzas' THEN 3
          WHEN 'Director Instalaciones' THEN 4
          WHEN 'Director Ventas' THEN 5

          WHEN 'Programador' THEN 10
          WHEN 'Auxiliar Direccion' THEN 11
          WHEN 'Jefe de Calidad' THEN 12

          WHEN 'Superintendente Mantenimiento Zonas OCC01-02 y NOR01-03' THEN 20
          WHEN 'Superintendente Mantenimiento Zonas CNA01-04' THEN 21
          WHEN 'Superintendente Mantenimiento Zonas CNB01-03' THEN 22

          WHEN 'Jefe Juridico' THEN 30
          WHEN 'Auxiliar Legal' THEN 31
          WHEN 'Especialista IMSS' THEN 32
          WHEN 'Recursos Humanos' THEN 33
          WHEN 'Auxiliar Adminitrativo' THEN 34
          WHEN 'Jefe de Contratos' THEN 35
          WHEN 'Jefa de Atencion a Cliente' THEN 36
          WHEN 'Coordinador de Soporte' THEN 37
          WHEN 'Sistemas Digitales Soporte' THEN 38
          WHEN 'Almacen y Cobranza Proyectos' THEN 39
          WHEN 'Costumer Experience (CX)' THEN 40
          WHEN 'Whatsapp Pagina' THEN 41

          WHEN 'Supervisor Mantenimiento Zona CNA04' THEN 50
          WHEN 'Supervisor Mantenimiento Zona CNB01' THEN 51
          WHEN 'Supervisor Mantenimiento Zona CNB02' THEN 52
          WHEN 'Supervisor Mantenimiento Zona CNB03' THEN 53
          WHEN 'Supervisor Mantenimiento Zona CNA01' THEN 54
          WHEN 'Supervisor Mantenimiento Zona CNA02' THEN 55
          WHEN 'Supervisor Mantenimiento Zona CNA03' THEN 56
          WHEN 'Supervisor Mantenimiento Zona NOR01 y NOR02' THEN 57
          WHEN 'Supervisor Mantenimiento Zona NOR03' THEN 58
          WHEN 'Supervisor de Soporte' THEN 59
          WHEN 'Supervisora Administrativa de Mantenimiento' THEN 60
          WHEN 'Supervisor Mantenimiento Zona OCC01 y OCC02' THEN 61

          ELSE 999
        END,
        u.nombre ASC
    `);

    return res.json({ ok: true, source: 'usuarios', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando usuarios.',
      error: error.message
    });
  }
}

async function getPermisos(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        p.*,
        r.rol
      FROM permisos p
      LEFT JOIN roles r
        ON r.id_rol = p.rol_id
      ORDER BY p.rol_id ASC
    `);

    return res.json({ ok: true, source: 'permisos', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando permisos.',
      error: error.message
    });
  }
}

async function getRoles(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM roles
      WHERE estado = 1
      ORDER BY id_rol ASC
    `);

    return res.json({ ok: true, source: 'roles', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando roles.',
      error: error.message
    });
  }
}

async function getZonas(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM z_op
      WHERE estado = 1
      ORDER BY zona ASC
    `);

    return res.json({ ok: true, source: 'z_op', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando zonas operativas.',
      error: error.message
    });
  }
}

async function getUsuarioZop(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        uz.id_usuario_zop,
        uz.usuario_id,
        u.nombre AS usuario_nombre,
        uz.zona_id,
        z.zona,
        z.nombre AS zona_nombre,
        uz.estado
      FROM usuario_zop uz
      LEFT JOIN usuarios u
        ON u.id_SB = uz.usuario_id
      LEFT JOIN z_op z
        ON z.id_zona = uz.zona_id
      ORDER BY u.nombre ASC, z.zona ASC
    `);

    return res.json({ ok: true, source: 'usuario_zop', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando relación usuario-zona.',
      error: error.message
    });
  }
}


function proyectosFilters(req, alias) {
  const a = alias || 'p';
  const clauses = [
    `${a}.estado_registro = 1`,
    `(${a}.inactivo IS NULL OR UPPER(${a}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`,
    `${a}.proyecto IS NOT NULL`,
    `TRIM(${a}.proyecto) <> ''`
  ];
  const params = [];
  const zona = likeParam(req.query.zona);
  const estado = likeParam(req.query.estado);
  const supervisor = likeParam(req.query.supervisor);
  const search = likeParam(req.query.search || req.query.buscar);

  if (zona) { clauses.push(`${a}.zona_operativa LIKE ?`); params.push(zona); }
  if (estado) { clauses.push(`${a}.estado LIKE ?`); params.push(estado); }
  if (supervisor) { clauses.push(`${a}.supervisor_zona LIKE ?`); params.push(supervisor); }
  if (search) {
    clauses.push(`(
      ${a}.proyecto LIKE ?
      OR ${a}.ciudad LIKE ?
      OR ${a}.estado LIKE ?
      OR ${a}.zona_operativa LIKE ?
      OR ${a}.supervisor_zona LIKE ?
    )`);
    params.push(search, search, search, search, search);
  }

  return { where: clauses.join(' AND '), params };
}

async function getProyectosFiltros(req, res) {
  try {
    const [zonas] = await db.query(`
      SELECT DISTINCT zona_operativa AS value
      FROM portafolio
      WHERE estado_registro = 1 AND zona_operativa IS NOT NULL AND zona_operativa <> ''
      ORDER BY zona_operativa ASC
    `);
    const [estados] = await db.query(`
      SELECT DISTINCT estado AS value
      FROM portafolio
      WHERE estado_registro = 1 AND estado IS NOT NULL AND estado <> ''
      ORDER BY estado ASC
    `);
    const [supervisores] = await db.query(`
      SELECT DISTINCT supervisor_zona AS value
      FROM portafolio
      WHERE estado_registro = 1 AND supervisor_zona IS NOT NULL AND supervisor_zona <> ''
      ORDER BY supervisor_zona ASC
    `);

    return res.json({
      ok: true,
      source: 'aiven',
      filters: {
        zonas: zonas.map(r => r.value).filter(Boolean),
        estados: estados.map(r => r.value).filter(Boolean),
        supervisores: supervisores.map(r => r.value).filter(Boolean)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando filtros de proyectos.', error: error.message });
  }
}

async function getProyectos(req, res) {
  // Compatibilidad: el frontend usa esta ruta base porque /api/proyectos ya esta validada.
  // Si se pide detalle=1, resolvemos el detalle del proyecto desde el mismo handler.
  if (String(req.query.detalle || '').trim() === '1' && String(req.query.proyecto || '').trim()) {
    return getProyectoDetalle(req, res);
  }

  const filters = proyectosFilters(req, 'p');
  try {
    const [rows] = await db.query(`
      SELECT
        p.proyecto,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        MAX(p.zona_operativa) AS zona,
        MAX(p.supervisor_zona) AS supervisor,
        COUNT(*) AS equipos,
        SUM(CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 1 ELSE 0 END) AS parados,
        SUM(COALESCE(t35.tickets_35d, 0)) AS tickets_35d,
        SUM(COALESCE(blt.blt_365d, 0)) AS fallas_blt_365d,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(AVG(
            CASE
              WHEN COALESCE(blt.blt_365d, 0) = 0 THEN 365
              ELSE 365 / COALESCE(blt.blt_365d, 1)
            END
          ), 0)
          ELSE NULL
        END AS mtbc_365
      FROM portafolio p
      ${latestTicketJoin}
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS tickets_35d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
        GROUP BY codigo_equipo
      ) t35 ON t35.codigo_equipo = p.numero_equipo
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS blt_365d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
          AND UPPER(COALESCE(responsabilidad,'')) = 'BLT'
        GROUP BY codigo_equipo
      ) blt ON blt.codigo_equipo = p.numero_equipo
      WHERE ${filters.where}
      GROUP BY p.proyecto
      ORDER BY parados DESC, tickets_35d DESC, p.proyecto ASC
    `, filters.params);

    const summary = rows.reduce((acc, row) => {
      acc.proyectos += 1;
      acc.equipos += Number(row.equipos || 0);
      acc.parados += Number(row.parados || 0);
      if (row.mtbc_365 !== null && row.mtbc_365 !== undefined) {
        acc.mtbc_sum += Number(row.mtbc_365 || 0);
        acc.mtbc_count += 1;
      }
      return acc;
    }, { proyectos: 0, equipos: 0, parados: 0, mtbc_sum: 0, mtbc_count: 0 });
    summary.mtbc_promedio = summary.mtbc_count ? Math.round(summary.mtbc_sum / summary.mtbc_count) : null;
    delete summary.mtbc_sum;
    delete summary.mtbc_count;

    return res.json({ ok: true, source: 'aiven', summary, data: rows.map(decorateProyectoRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando proyectos desde Aiven.', error: error.message });
  }
}

async function getProyectoDetalle(req, res) {
  const proyecto = String(req.params.proyecto || req.query.proyecto || '').trim();
  if (!proyecto) return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });

  try {
    const [proyectos] = await db.query(`
      SELECT
        p.proyecto,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        MAX(p.zona_operativa) AS zona,
        MAX(p.supervisor_zona) AS supervisor,
        COUNT(*) AS equipos,
        SUM(CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 1 ELSE 0 END) AS parados,
        SUM(COALESCE(t35.tickets_35d, 0)) AS tickets_35d,
        SUM(COALESCE(blt.blt_365d, 0)) AS fallas_blt_365d,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(AVG(
            CASE
              WHEN COALESCE(blt.blt_365d, 0) = 0 THEN 365
              ELSE 365 / COALESCE(blt.blt_365d, 1)
            END
          ), 0)
          ELSE NULL
        END AS mtbc_365
      FROM portafolio p
      ${latestTicketJoin}
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS tickets_35d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
        GROUP BY codigo_equipo
      ) t35 ON t35.codigo_equipo = p.numero_equipo
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS blt_365d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
          AND UPPER(COALESCE(responsabilidad,'')) = 'BLT'
        GROUP BY codigo_equipo
      ) blt ON blt.codigo_equipo = p.numero_equipo
      WHERE p.estado_registro = 1
        AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
        AND p.proyecto = ?
      GROUP BY p.proyecto
    `, [proyecto]);

    if (!proyectos.length) return res.status(404).json({ ok: false, message: 'Proyecto no encontrado en portafolio activo.' });

    const [equipos] = await db.query(`
      SELECT ${portafolioBaseSelect}
      FROM portafolio p
      ${latestTicketJoin}
      WHERE p.estado_registro = 1
        AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
        AND p.proyecto = ?
      ORDER BY p.numero_equipo ASC
    `, [proyecto]);

    const [tickets] = await db.query(`
      SELECT
        t.ticket, t.codigo_equipo, t.equipo, t.folio, t.estado_ticket, t.estado, t.fecha_reporte, t.fecha_cierre,
        t.responsabilidad, t.causa_falla, t.causa, t.tiempo_llegada, t.tiempo_solucion, t.estatus_equipo_final
      FROM tickets t
      WHERE t.proyecto = ?
         OR t.codigo_equipo IN (
          SELECT numero_equipo
          FROM portafolio
          WHERE estado_registro = 1
            AND (inactivo IS NULL OR UPPER(inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
            AND proyecto = ?
        )
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 300
    `, [proyecto, proyecto]);

    const [monthlyCurrent] = await db.query(`
      SELECT DATE_FORMAT(t.fecha_reporte, '%Y-%m') AS mes, COUNT(*) AS total
      FROM tickets t
      WHERE YEAR(t.fecha_reporte) = YEAR(CURDATE())
        AND (t.proyecto = ? OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE estado_registro = 1 AND proyecto = ?
        ))
      GROUP BY DATE_FORMAT(t.fecha_reporte, '%Y-%m')
      ORDER BY mes ASC
    `, [proyecto, proyecto]);

    const [monthlyPrevious] = await db.query(`
      SELECT DATE_FORMAT(t.fecha_reporte, '%Y-%m') AS mes, COUNT(*) AS total
      FROM tickets t
      WHERE YEAR(t.fecha_reporte) = YEAR(CURDATE()) - 1
        AND (t.proyecto = ? OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE estado_registro = 1 AND proyecto = ?
        ))
      GROUP BY DATE_FORMAT(t.fecha_reporte, '%Y-%m')
      ORDER BY mes ASC
    `, [proyecto, proyecto]);

    const [responsabilidad] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(t.responsabilidad),''),'Sin dato') AS responsabilidad, COUNT(*) AS total
      FROM tickets t
      WHERE t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND (t.proyecto = ? OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE estado_registro = 1 AND proyecto = ?
        ))
      GROUP BY COALESCE(NULLIF(TRIM(t.responsabilidad),''),'Sin dato')
      ORDER BY total DESC
    `, [proyecto, proyecto]);

    return res.json({
      ok: true,
      source: 'aiven',
      proyecto: decorateProyectoRow(proyectos[0]),
      equipos,
      tickets,
      monthly_current: monthlyCurrent,
      monthly_previous: monthlyPrevious,
      responsabilidad
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de proyecto.', error: error.message });
  }
}

async function syncTickets(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar.'
    });
  }

  try {
    let insertedOrUpdated = 0;

    for (const row of rows) {
      await db.query(
        `
        INSERT INTO tickets (
          ticket,
          id_interno,
          folio,
          estado_ticket,
          estado,
          ciudad,
          proyecto,
          codigo_equipo,
          referencia_en_zona_operativa,
          zona,
          descripcion,
          fecha_reporte,
          h_reporte,
          estatus_equipo_ir,
          fecha_llegada,
          h_llegada,
          persona_que_atiende,
          fecha_cierre,
          h_solucion,
          tecnico,
          estatus_equipo_final,
          causa,
          accion_en_cierre,
          responsabilidad,
          causa_falla,
          tiempo_llegada,
          tiempo_solucion,
          tipo_equipo,
          prioridad,
          ejecutivo_call,
          tiempo_llegada_ii,
          tiempo_solucion_ii,
          blt_empleado,
          ticket_excede,
          zona_administrativa,
          zona_de_falla,
          mes_reporte,
          proyecto_padre
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id_interno = VALUES(id_interno),
          folio = VALUES(folio),
          estado_ticket = VALUES(estado_ticket),
          estado = VALUES(estado),
          ciudad = VALUES(ciudad),
          proyecto = VALUES(proyecto),
          codigo_equipo = VALUES(codigo_equipo),
          referencia_en_zona_operativa = VALUES(referencia_en_zona_operativa),
          zona = VALUES(zona),
          descripcion = VALUES(descripcion),
          fecha_reporte = VALUES(fecha_reporte),
          h_reporte = VALUES(h_reporte),
          estatus_equipo_ir = VALUES(estatus_equipo_ir),
          fecha_llegada = VALUES(fecha_llegada),
          h_llegada = VALUES(h_llegada),
          persona_que_atiende = VALUES(persona_que_atiende),
          fecha_cierre = VALUES(fecha_cierre),
          h_solucion = VALUES(h_solucion),
          tecnico = VALUES(tecnico),
          estatus_equipo_final = VALUES(estatus_equipo_final),
          causa = VALUES(causa),
          accion_en_cierre = VALUES(accion_en_cierre),
          responsabilidad = VALUES(responsabilidad),
          causa_falla = VALUES(causa_falla),
          tiempo_llegada = VALUES(tiempo_llegada),
          tiempo_solucion = VALUES(tiempo_solucion),
          tipo_equipo = VALUES(tipo_equipo),
          prioridad = VALUES(prioridad),
          ejecutivo_call = VALUES(ejecutivo_call),
          tiempo_llegada_ii = VALUES(tiempo_llegada_ii),
          tiempo_solucion_ii = VALUES(tiempo_solucion_ii),
          blt_empleado = VALUES(blt_empleado),
          ticket_excede = VALUES(ticket_excede),
          zona_administrativa = VALUES(zona_administrativa),
          zona_de_falla = VALUES(zona_de_falla),
          mes_reporte = VALUES(mes_reporte),
          proyecto_padre = VALUES(proyecto_padre)
        `,
        [
          row.ticket || null,
          row.id_interno || null,
          row.folio || null,
          row.estado_ticket || null,
          row.estado || null,
          row.ciudad || null,
          row.proyecto || null,
          row.codigo_equipo || null,
          row.referencia_en_zona_operativa || null,
          row.zona || null,
          row.descripcion || null,
          row.fecha_reporte || null,
          row.h_reporte || null,
          row.estatus_equipo_ir || null,
          row.fecha_llegada || null,
          row.h_llegada || null,
          row.persona_que_atiende || null,
          row.fecha_cierre || null,
          row.h_solucion || null,
          row.tecnico || null,
          row.estatus_equipo_final || null,
          row.causa || null,
          row.accion_en_cierre || null,
          row.responsabilidad || null,
          row.causa_falla || null,
          row.tiempo_llegada || null,
          row.tiempo_solucion || null,
          row.tipo_equipo || null,
          row.prioridad || null,
          row.ejecutivo_call || null,
          row.tiempo_llegada_ii || null,
          row.tiempo_solucion_ii || null,
          row.blt_empleado || null,
          row.ticket_excede || null,
          row.zona_administrativa || null,
          row.zona_de_falla || null,
          row.mes_reporte || null,
          row.proyecto_padre || null
        ]
      );

      insertedOrUpdated++;
    }

    return res.json({
      ok: true,
      message: 'Tickets sincronizados correctamente.',
      total: insertedOrUpdated
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando tickets.',
      error: error.message
    });
  }
}
async function syncPortafolio(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar portafolio.'
    });
  }

  try {
    const [columnsResult] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'portafolio'
    `);

    const validColumns = columnsResult.map(c => c.COLUMN_NAME);
    const ignoredColumns = ['ID_SB', 'id_SB', 'created_at', 'updated_at'];

    let insertedOrUpdated = 0;

    for (const row of rows) {
      const cleanRow = {};

      Object.keys(row).forEach(key => {
        if (
          validColumns.includes(key) &&
          !ignoredColumns.includes(key) &&
          row[key] !== undefined
        ) {
          cleanRow[key] = row[key];
        }
      });

      if (!cleanRow.numero_equipo) continue;

      const columns = Object.keys(cleanRow);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => cleanRow[col]);

      const updateClause = columns
        .filter(col => col !== 'numero_equipo')
        .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
        .join(', ');

      const sql = `
        INSERT INTO portafolio (${columns.map(col => `\`${col}\``).join(', ')})
        VALUES (${placeholders})
        ON DUPLICATE KEY UPDATE
        ${updateClause || '`numero_equipo` = VALUES(`numero_equipo`)'}
      `;

      await db.query(sql, values);
      insertedOrUpdated++;
    }

    return res.json({
      ok: true,
      message: 'Portafolio sincronizado correctamente.',
      total: insertedOrUpdated
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando portafolio.',
      error: error.message
    });
  }
}

module.exports = {
  getTickets,
  saveTicketVobo,
  getPortafolio,
  getProyectosFiltros,
  getProyectoDetalle,
  getPortafolioFiltros,
  getPortafolioDashboard,
  getPortafolioEquipos,
  getPortafolioEquipoDetalle,
  getEquipos,
  getPendientesCatalogos,
  getPendientes,
  getPendienteDetalle,
  createPendiente,
  updatePendiente,
  deletePendiente,
  updatePendienteEstatus,
  updatePendientePrioridad,
  createPendienteComentario,
  updatePendienteSubtarea,
  getNotificaciones,
  abrirNotificacion,
  marcarNotificacionNueva,
  getHomeBootstrap,
  getActividadReciente,
  getUsuarios,
  getPermisos,
  getRoles,
  getZonas,
  getUsuarioZop,
  getProyectos,
  syncTickets,
  syncPortafolio
};