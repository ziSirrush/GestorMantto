'use strict';

const COMMERCIAL_ROLE_IDS = [5, 39, 48, 50, 54];
const COMMERCIAL_ROLE_CODES = [
  'DIRECTOR_VENTAS',
  'ASESOR_COMERCIAL',
  'GERENTE_CUENTAS_CORPORATIVAS',
  'GERENTE_COMERCIAL_BC_SURESTE',
  'GERENTE_COMERCIAL_NORTE'
];

function commercialRoleCondition(userAlias = 'u') {
  const roleIds = COMMERCIAL_ROLE_IDS.map(() => '?').join(', ');
  const roleCodes = COMMERCIAL_ROLE_CODES.map(() => '?').join(', ');

  return {
    sql: `(
      ${userAlias}.rol_id IN (${roleIds})
      OR EXISTS (
        SELECT 1
          FROM usuario_roles ur
          INNER JOIN roles r
            ON r.id_rol = ur.id_rol
           AND r.estado = 1
         WHERE ur.id_usuario = ${userAlias}.id_SB
           AND ur.activo = 1
           AND (
             r.id_rol IN (${roleIds})
             OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN (${roleCodes})
           )
      )
    )`,
    params: [
      ...COMMERCIAL_ROLE_IDS,
      ...COMMERCIAL_ROLE_IDS,
      ...COMMERCIAL_ROLE_CODES
    ]
  };
}

function normalizeUserIds(values) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

// Fase 5: misma normalizacion de avance utilizada por Instalaciones > Proyectos.
function progressNumber(value) {
  const number = Number(String(value ?? '').replace('%', '').trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizedProgress(value) {
  const number = progressNumber(value);
  const percentage = number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, percentage));
}

function projectAverage(rows, field) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  return Math.round(rows.reduce((sum, row) => sum + normalizedProgress(row?.[field]), 0) / rows.length);
}

function buildActiveProjects(rows) {
  const groups = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const projectId = String(row?.id_proyecto || '').trim() || '(SIN ID)';
    if (!groups.has(projectId)) groups.set(projectId, []);
    groups.get(projectId).push(row);
  }

  const projects = [];
  for (const [projectId, equipment] of groups.entries()) {
    const oc = projectAverage(equipment, 'avance_oc');
    const m = projectAverage(equipment, 'avance_mo');
    const a = projectAverage(equipment, 'avance_aj');
    const general = Math.round((oc * 0.4) + (m * 0.4) + (a * 0.2));
    const projectName = equipment.map((row) => String(row?.proyecto || '').trim()).find(Boolean) || projectId;
    projects.push({
      id_proyecto: projectId === '(SIN ID)' ? null : projectId,
      proyecto: projectName,
      cantidad_equipos: equipment.length,
      porcentaje_oc: oc,
      porcentaje_m: m,
      porcentaje_a: a,
      porcentaje_general: general
    });
  }

  // El usuario pidio orden por avance general. Se conserva el criterio propuesto:
  // mayor avance primero; empate estable por nombre de proyecto.
  return projects.sort((left, right) =>
    Number(right.porcentaje_general || 0) - Number(left.porcentaje_general || 0)
    || String(left.proyecto || '').localeCompare(String(right.proyecto || ''), 'es', { sensitivity: 'base' })
  );
}

function emptyCommercialTables() {
  return {
    cotizaciones: [],
    ventas: [],
    perdido: [],
    clientes: [],
    redes: [],
    prospeccion: []
  };
}

function emptyOperationalTables() {
  return {
    instalaciones: [],
    logistica: [],
    tareas_asignadas: [],
    tareas_creadas: []
  };
}

async function listCommercialUsers(connection) {
  const condition = commercialRoleCondition('u');
  const [rows] = await connection.query(
    `SELECT DISTINCT
       u.id_SB AS id_usuario,
       u.nombre,
       u.iniciales,
       u.puesto,
       CASE
         WHEN u.rol_id = 5
           OR EXISTS (
             SELECT 1
               FROM usuario_roles ur_d
              WHERE ur_d.id_usuario = u.id_SB
                AND ur_d.id_rol = 5
                AND ur_d.activo = 1
           ) THEN 'Director de Ventas'
         WHEN u.rol_id IN (48, 50, 54)
           OR EXISTS (
             SELECT 1
               FROM usuario_roles ur_g
              WHERE ur_g.id_usuario = u.id_SB
                AND ur_g.id_rol IN (48, 50, 54)
                AND ur_g.activo = 1
           ) THEN 'Gerente'
         ELSE 'Asesor'
       END AS tipo_perfil
     FROM usuarios u
     WHERE u.estado = 1
       AND UPPER(TRIM(COALESCE(u.area, ''))) = 'VENTAS'
       AND UPPER(TRIM(COALESCE(u.empresa, ''))) LIKE '%CORELLIAN%'
       AND ${condition.sql}
     ORDER BY
       FIELD(tipo_perfil, 'Director de Ventas', 'Gerente', 'Asesor'),
       u.nombre ASC`,
    condition.params
  );

  return rows;
}

async function isCommercialUser(connection, userId) {
  const condition = commercialRoleCondition('u');
  const [rows] = await connection.query(
    `SELECT u.id_SB
       FROM usuarios u
      WHERE u.id_SB = ?
        AND u.estado = 1
        AND UPPER(TRIM(COALESCE(u.area, ''))) = 'VENTAS'
        AND UPPER(TRIM(COALESCE(u.empresa, ''))) LIKE '%CORELLIAN%'
        AND ${condition.sql}
      LIMIT 1`,
    [userId, ...condition.params]
  );

  return rows.length > 0;
}

function normalizeCommercialYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2200
    ? year
    : new Date().getFullYear();
}

function commercialOriginDateSql(alias = 'c') {
  return `COALESCE(NULLIF(TRIM(${alias}.fecha_solicitud), ''), NULLIF(TRIM(${alias}.fecha_cotizacion), ''))`;
}

async function listCommercialYears(connection, userIds) {
  const ids = normalizeUserIds(userIds);
  if (!ids.length) return [];

  const [rows] = await connection.query(
    `SELECT DISTINCT y.anio
       FROM (
         SELECT LEFT(${commercialOriginDateSql('c1')}, 4) AS anio
           FROM ventas_cotizaciones_cor c1
          WHERE c1.id_asesor IN (?)
            AND COALESCE(c1.activo, 1) = 1
            AND ${commercialOriginDateSql('c1')} IS NOT NULL
         UNION
         SELECT LEFT(NULLIF(TRIM(c2.fecha_cierre), ''), 4) AS anio
           FROM ventas_cotizaciones_cor c2
          WHERE c2.id_asesor IN (?)
            AND COALESCE(c2.activo, 1) = 1
            AND NULLIF(TRIM(c2.fecha_cierre), '') IS NOT NULL
         UNION
         SELECT LEFT(NULLIF(TRIM(c3.fecha_cambio_estatus), ''), 4) AS anio
           FROM ventas_cotizaciones_cor c3
          WHERE c3.id_asesor IN (?)
            AND COALESCE(c3.activo, 1) = 1
            AND NULLIF(TRIM(c3.fecha_cambio_estatus), '') IS NOT NULL
       ) y
      WHERE y.anio REGEXP '^[0-9]{4}$'
      ORDER BY y.anio DESC`,
    [ids, ids, ids]
  );

  return rows
    .map((row) => Number(row.anio))
    .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200);
}

async function getCommercialKpis(connection, userIds, requestedYear) {
  const ids = normalizeUserIds(userIds);
  const year = normalizeCommercialYear(requestedYear);
  if (!ids.length) {
    return {
      cotizados_cotizaciones: 0,
      cotizados_equipos: 0,
      vendidos_cotizaciones: 0,
      vendidos_equipos: 0,
      perdidos_cotizaciones: 0,
      perdidos_equipos: 0
    };
  }

  const originDate = commercialOriginDateSql('c');
  const [rows] = await connection.query(
    `SELECT
       SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')
              AND LEFT(${originDate}, 4) = ?
             THEN 1 ELSE 0
           END) AS cotizados_cotizaciones,
       COALESCE(SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')
              AND LEFT(${originDate}, 4) = ?
             THEN COALESCE(c.numero_equipos, 0) ELSE 0
           END), 0) AS cotizados_equipos,
       SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'VENDIDO'
              AND LEFT(NULLIF(TRIM(c.fecha_cierre), ''), 4) = ?
             THEN 1 ELSE 0
           END) AS vendidos_cotizaciones,
       COALESCE(SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'VENDIDO'
              AND LEFT(NULLIF(TRIM(c.fecha_cierre), ''), 4) = ?
             THEN COALESCE(c.numero_equipos, 0) ELSE 0
           END), 0) AS vendidos_equipos,
       SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'PERDIDO'
              AND LEFT(NULLIF(TRIM(c.fecha_cambio_estatus), ''), 4) = ?
             THEN 1 ELSE 0
           END) AS perdidos_cotizaciones,
       COALESCE(SUM(CASE
             WHEN UPPER(TRIM(COALESCE(c.estatus_proyecto, ''))) = 'PERDIDO'
              AND LEFT(NULLIF(TRIM(c.fecha_cambio_estatus), ''), 4) = ?
             THEN COALESCE(c.numero_equipos, 0) ELSE 0
           END), 0) AS perdidos_equipos
     FROM ventas_cotizaciones_cor c
     WHERE c.id_asesor IN (?)
       AND COALESCE(c.activo, 1) = 1`,
    [String(year), String(year), String(year), String(year), String(year), String(year), ids]
  );

  return rows[0] || {};
}

async function getCommercialTables(connection, userIds, requestedYear) {
  const ids = normalizeUserIds(userIds);
  if (!ids.length) return emptyCommercialTables();
  const year = normalizeCommercialYear(requestedYear);

  const quoteAdvisor = `COALESCE(NULLIF(TRIM(q.asesor), ''), NULLIF(TRIM(uq.iniciales), ''), uq.nombre)`;
  const quoteOriginDate = commercialOriginDateSql('q');
  const [openQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.id_cliente, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.estatus_proyecto, q.numero_equipos, q.fecha_cotizacion,
            q.fecha_solicitud, ${quoteOriginDate} AS fecha_efectiva,
            q.ciudad, q.estado
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor IN (?)
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')
      ORDER BY ${quoteOriginDate} DESC,
               q.id_cotizacion DESC`,
    [ids]
  );

  const [soldQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.fecha_cierre, q.numero_equipos, q.fecha_cotizacion,
            q.fecha_solicitud, q.ciudad, q.estado, q.estatus_proyecto
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor IN (?)
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO'
        AND LEFT(NULLIF(TRIM(q.fecha_cierre), ''), 4) = ?
      ORDER BY NULLIF(TRIM(q.fecha_cierre), '') DESC, q.id_cotizacion DESC`,
    [ids, String(year)]
  );

  const [lostQuotes] = await connection.query(
    `SELECT q.id_cotizacion, q.nombre_proyecto, q.cliente,
            ${quoteAdvisor} AS asesor,
            q.razon_perdido, q.empresa_vs_perdido, q.numero_equipos,
            q.fecha_cotizacion, q.fecha_solicitud, q.fecha_cambio_estatus,
            q.ciudad, q.estado, q.estatus_proyecto
       FROM ventas_cotizaciones_cor q
       LEFT JOIN usuarios uq ON uq.id_SB = q.id_asesor
      WHERE q.id_asesor IN (?)
        AND COALESCE(q.activo, 1) = 1
        AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'PERDIDO'
        AND LEFT(NULLIF(TRIM(q.fecha_cambio_estatus), ''), 4) = ?
      ORDER BY NULLIF(TRIM(q.fecha_cambio_estatus), '') DESC,
               q.id_cotizacion DESC`,
    [ids, String(year)]
  );

  const quoteRelationSql = `
    q.activo = 1
    AND (
      (q.id_cliente IS NOT NULL AND q.id_cliente = vc.id_cliente)
      OR UPPER(TRIM(COALESCE(q.cliente, ''))) = UPPER(TRIM(COALESCE(vc.nombre_empresa, '')))
    )
    AND (
      (
        q.id_asesor IS NOT NULL
        AND q.id_asesor = (
          SELECT MIN(uqa.id_SB)
            FROM usuarios uqa
           WHERE uqa.estado = 1
             AND UPPER(TRIM(COALESCE(uqa.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
        )
      )
      OR UPPER(TRIM(COALESCE(q.asesor, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
    )`;

  const [clients] = await connection.query(
    `SELECT vc.id_cliente, vc.nombre_empresa, vc.razon_social, vc.iniciales,
            vc.ciudad, vc.estado, vc.tipo_cliente,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}) AS cotizaciones,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) NOT IN ('VENDIDO', 'PERDIDO')) AS en_proceso,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO') AS vendidas,
            (SELECT COUNT(*) FROM ventas_cotizaciones_cor q WHERE ${quoteRelationSql}
              AND UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'PERDIDO') AS perdidas
       FROM ventas_clientes vc
      WHERE vc.activo = 1
        AND (
          vc.created_by IN (?)
          OR EXISTS (
            SELECT 1 FROM usuarios uc
             WHERE uc.id_SB IN (?)
               AND uc.estado = 1
               AND UPPER(TRIM(COALESCE(uc.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
          )
        )
      ORDER BY vc.nombre_empresa ASC, vc.id_cliente DESC`,
    [ids, ids]
  );

  const [networks] = await connection.query(
    `SELECT vr.id_redes, vr.nombre_contacto, vr.nombre_empresa, vr.nombre_proyecto,
            contacto.articulo AS contacto_via, solicitud.articulo AS solicitud,
            estatus.articulo AS estatus, u.nombre AS asignado_a,
            vr.id_cotizacion,
            COALESCE(NULLIF(TRIM(q.nombre_proyecto), ''), CONCAT('MX', LPAD(q.id_cotizacion, 6, '0'))) AS cotizacion
       FROM ventas_redes vr
       LEFT JOIN catalogo_general solicitud ON solicitud.id_catalogo = vr.id_solicitud
       LEFT JOIN catalogo_general contacto ON contacto.id_catalogo = vr.id_contacto_via
       LEFT JOIN catalogo_general estatus ON estatus.id_catalogo = vr.id_estatus
       LEFT JOIN usuarios u ON u.id_SB = vr.id_usuario_asignado
       LEFT JOIN ventas_cotizaciones_cor q ON q.id_cotizacion = vr.id_cotizacion AND COALESCE(q.activo, 1) = 1
      WHERE vr.activo = 1
        AND (vr.id_usuario_asignado IN (?) OR vr.created_by IN (?))
      ORDER BY vr.created_at DESC, vr.id_redes DESC`,
    [ids, ids]
  );

  const [prospecting] = await connection.query(
    `SELECT p.id_pros, p.empresa, p.proyecto,
            COALESCE(NULLIF(TRIM(p.estatus), ''), pe.nombre) AS estatus,
            COALESCE(NULLIF(TRIM(up.iniciales), ''), up.nombre) AS asesor,
            p.ciudad, p.estado, p.fecha_visita
       FROM ventas_prospecciones p
       LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
       LEFT JOIN usuarios up ON up.id_SB = p.id_usuario
      WHERE p.activo = 1
        AND p.id_usuario IN (?)
      ORDER BY p.fecha_visita DESC, p.id_pros DESC`,
    [ids]
  );

  return {
    cotizaciones: openQuotes,
    ventas: soldQuotes,
    perdido: lostQuotes,
    clientes: clients,
    redes: networks,
    prospeccion: prospecting
  };
}

async function getOperationalTables(connection, userIds) {
  const ids = normalizeUserIds(userIds);
  if (!ids.length) return emptyOperationalTables();

  const [userRows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, correo
       FROM usuarios
      WHERE id_SB IN (?)
        AND estado = 1`,
    [ids]
  );

  const selectedUsers = Array.isArray(userRows) ? userRows : [];
  if (!selectedUsers.length) return emptyOperationalTables();

  const initials = [...new Set(selectedUsers.map((row) => String(row.iniciales || '').trim()).filter(Boolean))];
  const emails = [...new Set(selectedUsers.map((row) => String(row.correo || '').trim()).filter(Boolean))];
  const advisorTokens = [...new Set(selectedUsers.flatMap((row) => [row.iniciales, row.nombre]).map((value) => String(value || '').trim()).filter(Boolean))];
  const safeInitials = initials.length ? initials : ['__SIN_INICIALES__'];
  const safeEmails = emails.length ? emails : ['__SIN_CORREO__'];
  const safeAdvisorTokens = advisorTokens.length ? advisorTokens : ['__SIN_ASESOR__'];

  // ACTIVO = una fila por equipo en ins_fl. El resumen por proyecto replica exactamente
  // la formula del modulo Instalaciones > Proyectos: promedio por equipo de OC/MO/AJ,
  // redondeo de cada promedio y Avance General = 40% OC + 40% M + 20% A.
  const [installationEquipment] = await connection.query(
    `SELECT
       f.id_ins_fl,
       f.id_proyecto,
       f.proyecto,
       f.referencia_sitio,
       f.avance_oc,
       f.avance_mo,
       f.avance_aj
     FROM ins_fl f
     WHERE f.activo = 1
       AND f.id_asesor IN (?)
     ORDER BY f.id_proyecto ASC, f.id_ins_fl ASC`,
    [ids]
  );
  const installations = buildActiveProjects(installationEquipment);

  // LOGISTICA = las 12 etapas confirmadas en el Reporte de Logistica.
  // ENTREGADO conserva la regla del reporte: solo registros cuya Entrega real en obra
  // pertenece al anio en curso. No se corrigen ni rellenan datos faltantes del origen.
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric' }).format(new Date()));
  const [logistics] = await connection.query(
    `SELECT
       l.id_log_ops,
       l.id_ppns,
       l.ph_ns,
       CASE UPPER(TRIM(COALESCE(l.estatus, '')))
         WHEN 'SIN PRODUCCIÓN / DOCUMENTACIÓN PENDIENTE' THEN 'SIN PRODUCCIÓN / Documentación Pendiente'
         WHEN 'SIN PRODUCCION / DOCUMENTACION PENDIENTE' THEN 'SIN PRODUCCIÓN / Documentación Pendiente'
         WHEN 'SIN PRODUCCIÓN / PRIMERA VISITA A OBRA' THEN 'SIN PRODUCCIÓN / Primera Visita a Obra'
         WHEN 'SIN PRODUCCION / PRIMERA VISITA A OBRA' THEN 'SIN PRODUCCIÓN / Primera Visita a Obra'
         WHEN 'SIN PRODUCCIÓN / PENDIENTE LIBERACIÓN POR PARTE DEL CLIENTE' THEN 'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente'
         WHEN 'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE' THEN 'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente'
         WHEN 'SIN PRODUCCIÓN / PROGRAMADOS A PRODUCCIÓN' THEN 'SIN PRODUCCIÓN / Programados a Producción'
         WHEN 'SIN PRODUCCION / PROGRAMADOS A PRODUCCION' THEN 'SIN PRODUCCIÓN / Programados a Producción'
         WHEN 'EN PRODUCCIÓN' THEN 'EN PRODUCCION'
         WHEN 'EN PRODUCCION' THEN 'EN PRODUCCION'
         WHEN 'PARADOS POR CLIENTE' THEN 'PARADOS POR CLIENTE'
         WHEN 'PENDIENTE PAGO LIBERACIÓN' THEN 'PENDIENTE PAGO LIBERACIÓN'
         WHEN 'PENDIENTE PAGO LIBERACION' THEN 'PENDIENTE PAGO LIBERACIÓN'
         WHEN 'PROGRAMADO' THEN 'PROGRAMADO'
         WHEN 'EN TRÁNSITO' THEN 'EN TRANSITO'
         WHEN 'EN TRANSITO' THEN 'EN TRANSITO'
         WHEN 'PROGRAMA ENTREGA' THEN 'PROGRAMA ENTREGA'
         WHEN 'ENTREGADA' THEN 'ENTREGADO'
         WHEN 'ENTREGADO' THEN 'ENTREGADO'
         WHEN 'ALMACENADOS' THEN 'ALMACENADOS'
         ELSE TRIM(COALESCE(l.estatus, ''))
       END AS estatus,
       l.marca,
       l.no_control,
       l.cantidad,
       l.proyecto,
       l.supervisor,
       l.asesor,
       l.ict,
       l.incoterm,
       l.proveedor,
       l.carpeta,
       l.pvo,
       l.pago_cliente,
       l.pago_liberacion,
       l.fecha_produccion,
       l.fecha_estimada_obra,
       l.fecha_exw,
       l.puerto_origen,
       l.fecha_salida_estimada,
       l.fecha_salida_real,
       l.tiempo_transito,
       l.puerto_destino,
       l.fecha_llegada_estimada,
       l.fecha_llegada_real,
       l.fecha_pago_pedimento,
       l.fecha_carga_transporte_nacional,
       l.tiempo_aduana,
       l.lugar_entrega,
       l.fecha_entrega_programada,
       l.fecha_entrega_real_obra,
       l.fecha_entrada_almacen,
       l.fecha_salida_almacen,
       l.fecha_termino_aditiva,
       l.diferencia_dias,
       l.tiempo_total,
       l.comentarios
     FROM log_ops l
     WHERE (
       EXISTS (
         SELECT 1
           FROM ins_fl f_scope
          WHERE f_scope.activo = 1
            AND f_scope.id_asesor IN (?)
            AND TRIM(COALESCE(f_scope.id_proyecto, '')) = TRIM(COALESCE(l.id_ppns, ''))
       )
       OR UPPER(TRIM(COALESCE(l.asesor, ''))) IN (?)
     )
       AND UPPER(TRIM(COALESCE(l.estatus, ''))) IN (
         'SIN PRODUCCIÓN / DOCUMENTACIÓN PENDIENTE',
         'SIN PRODUCCION / DOCUMENTACION PENDIENTE',
         'SIN PRODUCCIÓN / PRIMERA VISITA A OBRA',
         'SIN PRODUCCION / PRIMERA VISITA A OBRA',
         'SIN PRODUCCIÓN / PENDIENTE LIBERACIÓN POR PARTE DEL CLIENTE',
         'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE',
         'SIN PRODUCCIÓN / PROGRAMADOS A PRODUCCIÓN',
         'SIN PRODUCCION / PROGRAMADOS A PRODUCCION',
         'EN PRODUCCIÓN',
         'EN PRODUCCION',
         'PARADOS POR CLIENTE',
         'PENDIENTE PAGO LIBERACIÓN',
         'PENDIENTE PAGO LIBERACION',
         'PROGRAMADO',
         'EN TRÁNSITO',
         'EN TRANSITO',
         'PROGRAMA ENTREGA',
         'ENTREGADO',
         'ENTREGADA',
         'ALMACENADOS'
       )
       AND (
         UPPER(TRIM(COALESCE(l.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')
         OR LEFT(TRIM(COALESCE(l.fecha_entrega_real_obra, '')), 4) = ?
       )
     ORDER BY
       CASE UPPER(TRIM(COALESCE(l.estatus, '')))
         WHEN 'SIN PRODUCCIÓN / DOCUMENTACIÓN PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCION / DOCUMENTACION PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCIÓN / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCION / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCIÓN / PENDIENTE LIBERACIÓN POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCIÓN / PROGRAMADOS A PRODUCCIÓN' THEN 4
         WHEN 'SIN PRODUCCION / PROGRAMADOS A PRODUCCION' THEN 4
         WHEN 'EN PRODUCCION' THEN 5
         WHEN 'EN PRODUCCIÓN' THEN 5
         WHEN 'PARADOS POR CLIENTE' THEN 6
         WHEN 'PENDIENTE PAGO LIBERACIÓN' THEN 7
         WHEN 'PENDIENTE PAGO LIBERACION' THEN 7
         WHEN 'PROGRAMADO' THEN 8
         WHEN 'EN TRANSITO' THEN 9
         WHEN 'EN TRÁNSITO' THEN 9
         WHEN 'PROGRAMA ENTREGA' THEN 10
         WHEN 'ENTREGADO' THEN 11
         WHEN 'ENTREGADA' THEN 11
         WHEN 'ALMACENADOS' THEN 12
         ELSE 99
       END,
       l.proyecto ASC,
       l.id_log_ops ASC`,
    [ids, safeAdvisorTokens.map((value) => value.toUpperCase()), String(currentYear)]
  );

  const taskSelect = `SELECT
       p.id_pendiente,
       p.pendiente,
       p.descripcion,
       p.prioridad,
       p.estatus,
       p.tipo_pendiente,
       p.area,
       p.proyecto,
       p.equipo,
       p.due_date,
       p.creado_por_email,
       p.updated_at,
       COALESCE(rel.responsables, '') AS responsables
     FROM pendientes p
     LEFT JOIN (
       SELECT id_pendiente,
              GROUP_CONCAT(
                CASE WHEN tipo_relacion = 'RESPONSABLE' THEN iniciales_usuario END
                ORDER BY iniciales_usuario SEPARATOR ', '
              ) AS responsables
         FROM pendientes_usuarios
        GROUP BY id_pendiente
     ) rel ON rel.id_pendiente = p.id_pendiente`;

  const taskOrder = `ORDER BY
       CASE p.prioridad
         WHEN 'CRITICA' THEN 1
         WHEN 'ALTA' THEN 2
         WHEN 'MEDIA' THEN 3
         WHEN 'BAJA' THEN 4
         ELSE 5
       END,
       CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
       p.due_date ASC,
       p.updated_at DESC`;

  const [assignedTasks] = await connection.query(
    `${taskSelect}
     WHERE UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND EXISTS (
         SELECT 1
           FROM pendientes_usuarios pu
          WHERE pu.id_pendiente = p.id_pendiente
            AND UPPER(TRIM(COALESCE(pu.tipo_relacion, ''))) = 'RESPONSABLE'
            AND UPPER(TRIM(COALESCE(pu.iniciales_usuario, ''))) IN (?)
       )
     ${taskOrder}`,
    [safeInitials.map((value) => value.toUpperCase())]
  );

  const [createdTasks] = await connection.query(
    `${taskSelect}
     WHERE UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND LOWER(TRIM(COALESCE(p.creado_por_email, ''))) IN (?)
     ${taskOrder}`,
    [safeEmails.map((value) => value.toLowerCase())]
  );

  return {
    instalaciones: installations,
    logistica: logistics,
    tareas_asignadas: assignedTasks,
    tareas_creadas: createdTasks
  };
}

async function getPdfCreatorProfile(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id_SB AS id_usuario, nombre, iniciales, correo
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getPdfSharedTasks(connection, creatorId, advisorId) {
  const creator = await getPdfCreatorProfile(connection, creatorId);
  const advisor = await getPdfCreatorProfile(connection, advisorId);
  if (!creator || !advisor || Number(creator.id_usuario) === Number(advisor.id_usuario)) return [];

  const [rows] = await connection.query(
    `SELECT DISTINCT
       p.id_pendiente,
       p.pendiente,
       p.descripcion,
       p.prioridad,
       p.estatus,
       p.tipo_pendiente,
       p.area,
       p.proyecto,
       p.equipo,
       p.due_date,
       p.updated_at,
       COALESCE(rel.responsables, '') AS responsables
     FROM pendientes p
     LEFT JOIN (
       SELECT id_pendiente,
              GROUP_CONCAT(
                CASE WHEN UPPER(TRIM(COALESCE(tipo_relacion, ''))) = 'RESPONSABLE'
                     THEN iniciales_usuario END
                ORDER BY iniciales_usuario SEPARATOR ', '
              ) AS responsables
         FROM pendientes_usuarios
        GROUP BY id_pendiente
     ) rel ON rel.id_pendiente = p.id_pendiente
     WHERE UPPER(TRIM(COALESCE(p.tipo_pendiente, ''))) = 'COLABORATIVA'
       AND UPPER(TRIM(COALESCE(p.estatus, ''))) <> 'CERRADO'
       AND (
         (
           LOWER(TRIM(COALESCE(p.creado_por_email, ''))) = LOWER(TRIM(COALESCE(?, '')))
           AND EXISTS (
             SELECT 1
               FROM pendientes_usuarios pu_advisor
              WHERE pu_advisor.id_pendiente = p.id_pendiente
                AND UPPER(TRIM(COALESCE(pu_advisor.tipo_relacion, ''))) IN ('RESPONSABLE', 'SEGUIMIENTO')
                AND UPPER(TRIM(COALESCE(pu_advisor.iniciales_usuario, ''))) = UPPER(TRIM(COALESCE(?, '')))
           )
         )
         OR
         (
           LOWER(TRIM(COALESCE(p.creado_por_email, ''))) = LOWER(TRIM(COALESCE(?, '')))
           AND EXISTS (
             SELECT 1
               FROM pendientes_usuarios pu_creator
              WHERE pu_creator.id_pendiente = p.id_pendiente
                AND UPPER(TRIM(COALESCE(pu_creator.tipo_relacion, ''))) IN ('RESPONSABLE', 'SEGUIMIENTO')
                AND UPPER(TRIM(COALESCE(pu_creator.iniciales_usuario, ''))) = UPPER(TRIM(COALESCE(?, '')))
           )
         )
       )
     ORDER BY
       CASE UPPER(TRIM(COALESCE(p.prioridad, '')))
         WHEN 'CRITICA' THEN 1
         WHEN 'ALTA' THEN 2
         WHEN 'MEDIA' THEN 3
         WHEN 'BAJA' THEN 4
         ELSE 5
       END,
       CASE WHEN p.due_date IS NULL THEN 1 ELSE 0 END,
       p.due_date ASC,
       p.updated_at DESC`,
    [creator.correo, advisor.iniciales, advisor.correo, creator.iniciales]
  );

  return rows;
}

async function getPdfAdvisorData(connection, userId) {
  const [profileRows] = await connection.query(
    `SELECT id_SB AS id_usuario, nombre, iniciales, puesto
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );
  const asesor = profileRows[0] || null;
  if (!asesor) return null;

  const equipmentJoin = `LEFT JOIN (
      SELECT id_cotizacion, SUM(COALESCE(cantidad, 0)) AS equipos_hijos
        FROM ventas_cotizaciones_equipos_cor
       WHERE activo = 1
       GROUP BY id_cotizacion
    ) eq ON eq.id_cotizacion = q.id_cotizacion`;
  const totalEquipment = `(COALESCE(q.numero_equipos, 0) + COALESCE(eq.equipos_hijos, 0))`;

  const [quotes] = await connection.query(
    `SELECT
       q.id_cotizacion,
       q.nombre_proyecto,
       q.estatus_proyecto,
       q.cliente,
       ${totalEquipment} AS numero_equipos,
       q.ciudad,
       q.estado,
       q.fecha_solicitud,
       q.fecha_cotizacion,
       q.fecha_cambio_estatus,
       q.fecha_cierre,
       q.razon_perdido,
       q.empresa_vs_perdido,
       COALESCE(com.comentarios, '') AS comentarios
     FROM ventas_cotizaciones_cor q
     ${equipmentJoin}
     LEFT JOIN (
       SELECT vc.id_cotizacion,
              GROUP_CONCAT(
                CONCAT(
                  DATE_FORMAT(vc.created_at, '%d/%m/%Y'),
                  ' - ',
                  COALESCE(NULLIF(TRIM(u.iniciales), ''), u.nombre, 'Usuario'),
                  ': ',
                  vc.comentario
                )
                ORDER BY vc.created_at ASC
                SEPARATOR '\\n'
              ) AS comentarios
         FROM ventas_cotizaciones_comentarios vc
         LEFT JOIN usuarios u ON u.id_SB = vc.id_usuario
        WHERE vc.activo = 1
        GROUP BY vc.id_cotizacion
     ) com ON com.id_cotizacion = q.id_cotizacion
     WHERE q.id_asesor = ?
       AND COALESCE(q.activo, 1) = 1
     ORDER BY q.id_cotizacion ASC`,
    [userId]
  );

  const [prospecting] = await connection.query(
    `SELECT p.id_pros, p.empresa, p.proyecto, p.contacto, p.ciudad, p.estado,
            COALESCE(NULLIF(TRIM(p.estatus), ''), pe.nombre) AS estatus,
            p.fecha_visita
       FROM ventas_prospecciones p
       LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
      WHERE p.activo = 1
        AND p.id_usuario = ?
      ORDER BY p.fecha_visita DESC, p.id_pros DESC`,
    [userId]
  );

  const [networks] = await connection.query(
    `SELECT vr.id_redes, vr.nombre_contacto, vr.ciudad,
            contacto.articulo AS contacto_via,
            vr.nombre_empresa, vr.nombre_proyecto
       FROM ventas_redes vr
       LEFT JOIN catalogo_general contacto ON contacto.id_catalogo = vr.id_contacto_via
      WHERE vr.activo = 1
        AND (vr.id_usuario_asignado = ? OR vr.created_by = ?)
      ORDER BY vr.nombre_contacto ASC, vr.id_redes ASC`,
    [userId, userId]
  );

  const [installations] = await connection.query(
    `SELECT
       f.id_proyecto,
       MAX(f.proyecto) AS proyecto,
       MAX(f.supervisor_fl) AS supervisor,
       MAX(f.cliente) AS cliente,
       MAX(f.estatus) AS estatus,
       MAX(f.estado) AS estado,
       COUNT(*) AS total_equipos,
       MAX(f.avance_oc) AS avance_oc,
       MAX(f.avance_mo) AS avance_mo,
       MAX(f.avance_aj) AS avance_aj,
       COALESCE(mat.material, '') AS material
     FROM ins_fl f
     LEFT JOIN (
       SELECT id_ppns,
              GROUP_CONCAT(
                CONCAT_WS(' - ',
                  NULLIF(TRIM(estatus), ''),
                  CASE WHEN cantidad IS NULL THEN NULL ELSE CONCAT(cantidad, ' equipo(s)') END,
                  NULLIF(TRIM(marca), '')
                )
                ORDER BY id_log_ops ASC SEPARATOR '\\n'
              ) AS material
         FROM log_ops
        GROUP BY id_ppns
     ) mat ON TRIM(COALESCE(mat.id_ppns, '')) = TRIM(COALESCE(f.id_proyecto, ''))
     WHERE f.activo = 1
       AND f.id_asesor = ?
     GROUP BY f.id_proyecto, mat.material
     ORDER BY proyecto ASC`,
    [userId]
  );

  const [logistics] = await connection.query(
    `SELECT
       l.id_log_ops,
       l.id_ppns,
       l.proyecto,
       l.supervisor,
       l.estatus,
       l.fecha_exw,
       l.fecha_llegada_estimada AS eta,
       l.fecha_salida_estimada AS etd,
       COALESCE(NULLIF(TRIM(l.fecha_entrega_real_obra), ''), NULLIF(TRIM(l.fecha_estimada_obra), ''), 'SIN FECHA') AS obra_real_estimada,
       COALESCE(NULLIF(TRIM(l.pago_cliente), ''), 'SIN FECHA') AS pago_cliente
     FROM log_ops l
     WHERE UPPER(TRIM(COALESCE(l.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')
       AND (
         EXISTS (
           SELECT 1
             FROM ins_fl fs
            WHERE fs.activo = 1
              AND fs.id_asesor = ?
              AND TRIM(COALESCE(fs.id_proyecto, '')) = TRIM(COALESCE(l.id_ppns, ''))
         )
         OR UPPER(TRIM(COALESCE(l.asesor, ''))) IN (
           UPPER(TRIM(COALESCE(?, ''))),
           UPPER(TRIM(COALESCE(?, '')))
         )
       )
     ORDER BY
       CASE UPPER(TRIM(COALESCE(l.estatus, '')))
         WHEN 'SIN PRODUCCIÓN / DOCUMENTACIÓN PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCION / DOCUMENTACION PENDIENTE' THEN 1
         WHEN 'SIN PRODUCCIÓN / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCION / PRIMERA VISITA A OBRA' THEN 2
         WHEN 'SIN PRODUCCIÓN / PENDIENTE LIBERACIÓN POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE' THEN 3
         WHEN 'SIN PRODUCCIÓN / PROGRAMADOS A PRODUCCIÓN' THEN 4
         WHEN 'SIN PRODUCCION / PROGRAMADOS A PRODUCCION' THEN 4
         WHEN 'EN PRODUCCION' THEN 5
         WHEN 'EN PRODUCCIÓN' THEN 5
         WHEN 'PARADOS POR CLIENTE' THEN 6
         WHEN 'PENDIENTE PAGO LIBERACIÓN' THEN 7
         WHEN 'PENDIENTE PAGO LIBERACION' THEN 7
         WHEN 'PROGRAMADO' THEN 8
         WHEN 'EN TRANSITO' THEN 9
         WHEN 'EN TRÁNSITO' THEN 9
         WHEN 'PROGRAMA ENTREGA' THEN 10
         WHEN 'ALMACENADOS' THEN 11
         ELSE 99
       END,
       l.proyecto ASC,
       l.id_log_ops ASC`,
    [userId, asesor.iniciales, asesor.nombre]
  );

  const [clients] = await connection.query(
    `SELECT
       vc.id_cliente,
       vc.nombre_empresa AS empresa,
       vc.ciudad,
       COALESCE(NULLIF(TRIM(vc.estatus_cliente), ''), NULLIF(TRIM(vc.tipo_cliente), ''), '') AS estatus_cliente,
       COALESCE(qs.proyectos_vendidos, NULLIF(TRIM(vc.proyecto_vendido), ''), '') AS proyecto_vendido,
       COALESCE(qs.cotizaciones_sistema, 0) AS cotizaciones_sistema,
       COALESCE(ins.contratos_activos, 0) AS contratos_activos
     FROM ventas_clientes vc
     LEFT JOIN (
       SELECT
         q.id_cliente,
         COUNT(*) AS cotizaciones_sistema,
         GROUP_CONCAT(
           DISTINCT CASE
             WHEN UPPER(TRIM(COALESCE(q.estatus_proyecto, ''))) = 'VENDIDO'
             THEN q.nombre_proyecto END
           ORDER BY q.nombre_proyecto SEPARATOR '\\n'
         ) AS proyectos_vendidos
       FROM ventas_cotizaciones_cor q
       WHERE q.activo = 1
         AND q.id_asesor = ?
       GROUP BY q.id_cliente
     ) qs ON qs.id_cliente = vc.id_cliente
     LEFT JOIN (
       SELECT UPPER(TRIM(COALESCE(cliente, ''))) AS cliente_normalizado,
              COUNT(DISTINCT id_proyecto) AS contratos_activos
         FROM ins_fl
        WHERE activo = 1
          AND id_asesor = ?
        GROUP BY UPPER(TRIM(COALESCE(cliente, '')))
     ) ins ON ins.cliente_normalizado = UPPER(TRIM(COALESCE(vc.nombre_empresa, '')))
     WHERE vc.activo = 1
       AND (
         vc.created_by = ?
         OR EXISTS (
           SELECT 1
             FROM usuarios uc
            WHERE uc.id_SB = ?
              AND uc.estado = 1
              AND UPPER(TRIM(COALESCE(uc.iniciales, ''))) = UPPER(TRIM(COALESCE(vc.iniciales, '')))
         )
         OR qs.id_cliente IS NOT NULL
       )
     ORDER BY vc.nombre_empresa ASC, vc.id_cliente ASC`,
    [userId, userId, userId, userId]
  );

  return {
    asesor,
    cotizaciones: quotes,
    prospeccion: prospecting,
    redes: networks,
    proyectos_activos: installations,
    logistica: logistics,
    clientes: clients
  };
}

module.exports = {
  listCommercialUsers,
  isCommercialUser,
  getCommercialKpis,
  listCommercialYears,
  getCommercialTables,
  getOperationalTables,
  getPdfCreatorProfile,
  getPdfSharedTasks,
  getPdfAdvisorData
};
