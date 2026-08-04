const db = require('../../config/db');

function getConnection() {
  return db.getConnection();
}

async function findExistingUserIds(connection, userIds) {
  const ids = [...new Set(userIds.filter(Number.isInteger))];
  if (!ids.length) return new Set();

  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE id_SB IN (${ids.map(() => '?').join(', ')})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_SB)));
}

async function findExistingProspectionIds(connection, prospectionIds) {
  const ids = [...new Set(prospectionIds.filter(Number.isInteger))];
  if (!ids.length) return new Set();

  const [rows] = await connection.query(
    `SELECT id_pros
       FROM ventas_prospecciones
      WHERE id_pros IN (${ids.map(() => '?').join(', ')})`,
    ids
  );

  return new Set(rows.map((row) => Number(row.id_pros)));
}

async function findStatusIdByName(connection, statusName) {
  if (!statusName) return null;
  const [rows] = await connection.query(
    `SELECT id_estatus
       FROM ventas_prospeccion_estatus
      WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(?))
        AND activo = 1
      ORDER BY id_estatus ASC
      LIMIT 1`,
    [statusName]
  );
  return rows[0] ? Number(rows[0].id_estatus) : null;
}

async function upsertProspection(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospecciones (
       id_pros, empresa, proyecto, ubicacion, latitud, longitud,
       contacto, correo, telefono, comentario, id_usuario,
       ciudad, estado, tipo_proyecto, fecha_visita,
       id_estatus, estatus, fecha_cam_estatus,
       nuevo, proyecto_activo, proyecto_cotizado, activo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 1)
     ON DUPLICATE KEY UPDATE
       empresa = VALUES(empresa),
       proyecto = VALUES(proyecto),
       ubicacion = VALUES(ubicacion),
       latitud = VALUES(latitud),
       longitud = VALUES(longitud),
       contacto = VALUES(contacto),
       correo = VALUES(correo),
       telefono = VALUES(telefono),
       comentario = VALUES(comentario),
       id_usuario = VALUES(id_usuario),
       ciudad = VALUES(ciudad),
       estado = VALUES(estado),
       tipo_proyecto = VALUES(tipo_proyecto),
       fecha_visita = VALUES(fecha_visita),
       id_estatus = VALUES(id_estatus),
       estatus = VALUES(estatus),
       fecha_cam_estatus = VALUES(fecha_cam_estatus),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      record.id_pros,
      record.empresa,
      record.proyecto,
      record.ubicacion,
      record.latitud,
      record.longitud,
      record.contacto,
      record.correo,
      record.telefono,
      record.comentario,
      record.id_usuario,
      record.ciudad,
      record.estado,
      record.tipo_proyecto,
      record.fecha_visita,
      record.id_estatus,
      record.estatus,
      record.fecha_cam_estatus
    ]
  );
}

async function replaceVisitFiles(connection, idPros, files) {
  await connection.query(
    `DELETE FROM ventas_prospeccion_archivos
      WHERE id_pros = ?
        AND tipo_relacion = 'VISITA'
        AND UPPER(COALESCE(storage_provider, 'GLIDE')) = 'GLIDE'`,
    [idPros]
  );

  for (const file of files) {
    await connection.query(
      `INSERT INTO ventas_prospeccion_archivos (
         id_pros, id_com_pors, tipo_relacion,
         nombre_archivo, nombre_original, mime_type, extension,
         storage_provider, storage_url, orden, es_imagen, activo
       ) VALUES (?, NULL, 'VISITA', ?, ?, ?, ?, 'GLIDE', ?, ?, 1, 1)`,
      [
        idPros,
        file.nombre_archivo,
        file.nombre_original,
        file.mime_type,
        file.extension,
        file.storage_url,
        file.orden
      ]
    );
  }
}

async function upsertComment(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospeccion_comentarios (
       id_com_pors, id_pros, id_usuario, comentario,
       fecha_hora, editado, activo, created_at
     ) VALUES (?, ?, ?, ?, ?, 0, 1, COALESCE(?, CURRENT_TIMESTAMP(3)))
     ON DUPLICATE KEY UPDATE
       id_pros = VALUES(id_pros),
       id_usuario = VALUES(id_usuario),
       comentario = VALUES(comentario),
       fecha_hora = VALUES(fecha_hora),
       activo = 1,
       created_at = CASE
         WHEN VALUES(fecha_hora) IS NOT NULL THEN VALUES(fecha_hora)
         ELSE created_at
       END,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      record.id_com_pors,
      record.id_pros,
      record.id_usuario,
      record.comentario,
      record.fecha_hora,
      record.fecha_hora
    ]
  );
}

async function replaceCommentFile(connection, record) {
  await connection.query(
    `DELETE FROM ventas_prospeccion_archivos
      WHERE id_com_pors = ?
        AND tipo_relacion = 'COMENTARIO'
        AND UPPER(COALESCE(storage_provider, 'GLIDE')) = 'GLIDE'`,
    [record.id_com_pors]
  );

  if (!record.file) return;

  await connection.query(
    `INSERT INTO ventas_prospeccion_archivos (
       id_pros, id_com_pors, tipo_relacion,
       nombre_archivo, nombre_original, mime_type, extension,
       storage_provider, storage_url, orden, es_imagen, activo,
       created_at
     ) VALUES (?, ?, 'COMENTARIO', ?, ?, ?, ?, 'GLIDE', ?, 1, ?, 1,
       COALESCE(?, CURRENT_TIMESTAMP(3)))`,
    [
      record.id_pros,
      record.id_com_pors,
      record.file.nombre_archivo,
      record.file.nombre_original,
      record.file.mime_type,
      record.file.extension,
      record.file.storage_url,
      record.file.es_imagen,
      record.fecha_hora
    ]
  );
}



function buildScope(scope, params) {
  if (scope.mode === 'ALL') return '';
  const ids = Array.isArray(scope.advisorIds) ? scope.advisorIds.filter(Number.isInteger) : [];
  if (!ids.length) return ' AND 1 = 0';
  params.push(...ids);
  return ` AND p.id_usuario IN (${ids.map(() => '?').join(', ')})`;
}

function buildFilters(filters, params, options = {}) {
  let sql = '';
  if (filters.q) {
    const like = `%${filters.q}%`;
    sql += ' AND (p.empresa LIKE ? OR p.proyecto LIKE ? OR p.contacto LIKE ? OR p.ciudad LIKE ?)';
    params.push(like, like, like, like);
  }
  if (filters.year) { sql += ' AND YEAR(p.fecha_visita) = ?'; params.push(filters.year); }
  if (filters.status) { sql += ' AND COALESCE(p.estatus, pe.nombre) = ?'; params.push(filters.status); }
  if (filters.userId) { sql += ' AND p.id_usuario = ?'; params.push(filters.userId); }
  if (filters.state) { sql += ' AND p.estado = ?'; params.push(filters.state); }
  if (options.requireCoordinates) sql += ' AND p.latitud IS NOT NULL AND p.longitud IS NOT NULL';
  return sql;
}

const BASE_SELECT = `SELECT
  p.id_pros, p.empresa, p.proyecto, p.ubicacion, p.latitud, p.longitud,
  p.contacto, p.puesto_contacto, p.correo, p.telefono, p.comentario, p.id_usuario,
  u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales, u.correo AS usuario_correo,
  p.ciudad, p.estado, p.tipo_proyecto, p.fecha_visita,
  p.id_estatus, COALESCE(p.estatus, pe.nombre) AS estatus,
  p.fecha_cam_estatus, p.nuevo, p.proyecto_activo, p.proyecto_cotizado,
  p.id_proyecto_instalacion, p.id_cotizacion, p.id_cliente, p.id_contacto,
  p.activo, p.created_at, p.updated_at
FROM ventas_prospecciones p
LEFT JOIN usuarios u ON u.id_SB = p.id_usuario
LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus`;

async function listProspections(connection, filters, scope) {
  const params = [];
  const where = ` WHERE p.activo = 1${buildScope(scope, params)}${buildFilters(filters, params)}`;
  const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM ventas_prospecciones p LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus=p.id_estatus${where}`, params);
  const offset = (filters.page - 1) * filters.pageSize;
  const [rows] = await connection.query(`${BASE_SELECT}${where} ORDER BY p.fecha_visita DESC, p.id_pros DESC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]);
  return { rows, total: Number(countRows[0]?.total || 0) };
}

async function getKpis(connection, filters, scope) {
  const params = [];
  const where = ` WHERE p.activo = 1${buildScope(scope, params)}${buildFilters(filters, params)}`;
  const [rows] = await connection.query(`SELECT
      COUNT(*) AS visitas,
      SUM(CASE WHEN p.latitud IS NOT NULL AND p.longitud IS NOT NULL THEN 1 ELSE 0 END) AS con_ubicacion,
      SUM(CASE WHEN YEAR(p.fecha_visita) = YEAR(CURRENT_DATE()) THEN 1 ELSE 0 END) AS este_anio,
      COUNT(DISTINCT NULLIF(TRIM(COALESCE(p.estatus, pe.nombre)), '')) AS estatus_activos
    FROM ventas_prospecciones p
    LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus=p.id_estatus${where}`, params);
  const row = rows[0] || {};
  return { visitas:Number(row.visitas||0), con_ubicacion:Number(row.con_ubicacion||0), este_anio:Number(row.este_anio||0), estatus_activos:Number(row.estatus_activos||0) };
}

async function getCatalogs(connection, scope) {
  async function values(expression, alias) {
    const params=[];
    const where=` WHERE p.activo=1${buildScope(scope, params)} AND ${expression} IS NOT NULL AND TRIM(${expression})<>''`;
    const [rows]=await connection.query(`SELECT DISTINCT ${expression} AS value FROM ventas_prospecciones p LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus=p.id_estatus${where} ORDER BY value`,params);
    return rows.map(r=>r.value);
  }
  const params=[];
  const scopeSql=buildScope(scope,params);
  const [users]=await connection.query(`SELECT DISTINCT p.id_usuario, u.nombre, u.iniciales, u.correo FROM ventas_prospecciones p LEFT JOIN usuarios u ON u.id_SB=p.id_usuario WHERE p.activo=1${scopeSql} ORDER BY u.nombre, u.correo`,params);
  return {
    anios: (await values('YEAR(p.fecha_visita)','anio')).map(Number).sort((a,b)=>b-a),
    estatus: await values('COALESCE(p.estatus, pe.nombre)','estatus'),
    estados: await values('p.estado','estado'),
    usuarios: users.map(r=>({id_usuario:Number(r.id_usuario), nombre:r.nombre||r.correo||`Usuario ${r.id_usuario}`, iniciales:r.iniciales||null, correo:r.correo||null}))
  };
}

async function getMap(connection, filters, scope) {
  const params=[];
  const where=` WHERE p.activo=1${buildScope(scope,params)}${buildFilters(filters,params,{requireCoordinates:true})}`;
  const [rows]=await connection.query(`${BASE_SELECT}${where} ORDER BY p.fecha_visita DESC, p.id_pros DESC LIMIT 5000`,params);
  return rows;
}

async function getProspectionById(connection,idPros,scope){
  const params=[idPros];
  const where=` WHERE p.id_pros=? AND p.activo=1${buildScope(scope,params)}`;
  const [rows]=await connection.query(`SELECT
    p.id_pros, p.empresa, p.proyecto, p.ubicacion, p.latitud, p.longitud,
    p.contacto, p.puesto_contacto, p.correo, p.telefono, p.comentario, p.id_usuario,
    u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales, u.correo AS usuario_correo,
    p.ciudad, p.estado, p.tipo_proyecto, p.fecha_visita,
    p.id_estatus, COALESCE(p.estatus, pe.nombre) AS estatus,
    p.fecha_cam_estatus, p.nuevo, p.proyecto_activo, p.proyecto_cotizado,
    p.id_proyecto_instalacion, p.id_cotizacion, p.id_cliente, p.id_contacto,
    vc.nombre_empresa AS cliente_nombre,
    vcc.nombre_contacto AS contacto_catalogo_nombre,
    vcc.puesto_contacto AS contacto_catalogo_puesto,
    vcc.email AS contacto_catalogo_correo,
    vcc.telefono AS contacto_catalogo_telefono,
    cot.nombre_proyecto AS cotizacion_proyecto,
    cot.cliente AS cotizacion_cliente,
    p.activo, p.created_at, p.updated_at
  FROM ventas_prospecciones p
  LEFT JOIN usuarios u ON u.id_SB = p.id_usuario
  LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
  LEFT JOIN ventas_clientes vc ON vc.id_cliente = p.id_cliente
  LEFT JOIN ventas_clientes_contactos vcc ON vcc.id_contacto = p.id_contacto
  LEFT JOIN ventas_cotizaciones_cor cot ON cot.id_cotizacion = p.id_cotizacion
  ${where} LIMIT 1`,params);
  return rows[0]||null;
}

async function listCommentsByProspection(connection,idPros){
  const [rows]=await connection.query(`SELECT c.id_com_pors,c.id_pros,c.id_usuario,u.nombre AS usuario_nombre,u.iniciales AS usuario_iniciales,c.comentario,c.fecha_hora,c.created_at,c.updated_at FROM ventas_prospeccion_comentarios c LEFT JOIN usuarios u ON u.id_SB=c.id_usuario WHERE c.id_pros=? AND c.activo=1 ORDER BY COALESCE(c.fecha_hora,c.created_at),c.id_com_pors`,[idPros]);
  return rows;
}
async function listFilesByProspection(connection,idPros){
  const [rows]=await connection.query(`SELECT id_archivo,id_pros,id_com_pors,tipo_relacion,nombre_archivo,nombre_original,mime_type,extension,tamano_bytes,storage_provider,storage_url,storage_container,storage_blob_name,thumbnail_url,orden,es_imagen,activo,created_at,updated_at FROM ventas_prospeccion_archivos WHERE id_pros=? AND activo=1 ORDER BY tipo_relacion,COALESCE(id_com_pors,0),orden,id_archivo`,[idPros]);
  return rows;
}

async function findFileById(connection,idPros,idArchivo,options={}){
  const lock=options.forUpdate===true?' FOR UPDATE':'';
  const [rows]=await connection.query(`SELECT id_archivo,id_pros,id_com_pors,tipo_relacion,nombre_archivo,nombre_original,mime_type,extension,tamano_bytes,storage_provider,storage_url,storage_container,storage_blob_name,thumbnail_url,orden,es_imagen,activo,created_at,updated_at FROM ventas_prospeccion_archivos WHERE id_pros=? AND id_archivo=? AND activo=1 LIMIT 1${lock}`,[idPros,idArchivo]);
  return rows[0]||null;
}

async function deactivateFile(connection,idPros,idArchivo){
  const [result]=await connection.query(`UPDATE ventas_prospeccion_archivos SET activo=0,updated_at=CURRENT_TIMESTAMP(3) WHERE id_pros=? AND id_archivo=? AND activo=1`,[idPros,idArchivo]);
  return Number(result.affectedRows||0);
}

function buildSourceScope(scope, alias, params) {
  if (!scope || scope.mode === 'ALL') return '';
  const ids = Array.isArray(scope.advisorIds) ? scope.advisorIds.filter(Number.isInteger) : [];
  if (!ids.length) return ' AND 1 = 0';
  params.push(...ids);
  return ` AND ${alias}.id_asesor IN (${ids.map(() => '?').join(', ')})`;
}

async function searchInstallationProjects(connection, q, limit = 30, scope = null) {
  const like = `%${q || ''}%`;
  const params=[q || '', like, like, like, like];
  const scopeSql=buildSourceScope(scope,'f',params);
  params.push(limit);
  const [rows] = await connection.query(
    `SELECT
       f.id_proyecto,
       MAX(f.proyecto) AS proyecto,
       COALESCE(MAX(c.cliente), MAX(f.cliente)) AS empresa,
       COALESCE(MAX(c.ciudad), MAX(f.ciudad)) AS ciudad,
       COALESCE(MAX(c.estado), MAX(f.estado)) AS estado,
       MAX(c.tipo_proyecto) AS tipo_proyecto,
       MAX(c.id_cotizacion) AS id_cotizacion,
       COALESCE(MAX(c.id_cliente), MAX(vc.id_cliente)) AS id_cliente,
       MAX(c.id_contacto) AS id_contacto,
       MAX(c.contacto) AS contacto,
       MAX(vccq.puesto_contacto) AS puesto_contacto,
       MAX(c.correo) AS correo,
       MAX(c.telefono) AS telefono
     FROM ins_fl f
     LEFT JOIN ventas_cotizaciones_cor c
       ON c.id_cotizacion = (
         SELECT MAX(c2.id_cotizacion)
           FROM ventas_cotizaciones_cor c2
          WHERE c2.activo = 1
            AND c2.id_equipo_vendido = f.id_proyecto
       )
     LEFT JOIN ventas_clientes_contactos vccq
       ON vccq.id_contacto = c.id_contacto
      AND vccq.activo = 1
     LEFT JOIN ventas_clientes vc
       ON vc.activo = 1
      AND TRIM(LOWER(vc.nombre_empresa)) = TRIM(LOWER(f.cliente))
     WHERE f.activo = 1
       AND f.id_proyecto IS NOT NULL
       AND TRIM(f.id_proyecto) <> ''
       AND (? = '' OR f.id_proyecto LIKE ? OR f.proyecto LIKE ? OR f.cliente LIKE ? OR f.ciudad LIKE ?)${scopeSql}
     GROUP BY f.id_proyecto
     ORDER BY MAX(f.proyecto), f.id_proyecto
     LIMIT ?`,
    params
  );
  return rows;
}

async function findInstallationProject(connection, idProyecto, scope = null) {
  const params=[idProyecto];
  const scopeSql=buildSourceScope(scope,'f',params);
  const [rows] = await connection.query(
    `SELECT
       f.id_proyecto,
       MAX(f.proyecto) AS proyecto,
       COALESCE(MAX(c.cliente), MAX(f.cliente)) AS empresa,
       COALESCE(MAX(c.ciudad), MAX(f.ciudad)) AS ciudad,
       COALESCE(MAX(c.estado), MAX(f.estado)) AS estado,
       MAX(c.tipo_proyecto) AS tipo_proyecto,
       MAX(c.id_cotizacion) AS id_cotizacion,
       COALESCE(MAX(c.id_cliente), MAX(vc.id_cliente)) AS id_cliente,
       MAX(c.id_contacto) AS id_contacto,
       MAX(c.contacto) AS contacto,
       MAX(vccq.puesto_contacto) AS puesto_contacto,
       MAX(c.correo) AS correo,
       MAX(c.telefono) AS telefono
     FROM ins_fl f
     LEFT JOIN ventas_cotizaciones_cor c
       ON c.id_cotizacion = (
         SELECT MAX(c2.id_cotizacion)
           FROM ventas_cotizaciones_cor c2
          WHERE c2.activo = 1
            AND c2.id_equipo_vendido = f.id_proyecto
       )
     LEFT JOIN ventas_clientes_contactos vccq
       ON vccq.id_contacto = c.id_contacto
      AND vccq.activo = 1
     LEFT JOIN ventas_clientes vc
       ON vc.activo = 1
      AND TRIM(LOWER(vc.nombre_empresa)) = TRIM(LOWER(f.cliente))
     WHERE f.activo = 1 AND f.id_proyecto = ?${scopeSql}
     GROUP BY f.id_proyecto
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function quotationClientIdSql(alias = 'c') {
  return `COALESCE(
    ${alias}.id_cliente,
    (SELECT vcc0.id_cliente
       FROM ventas_clientes_contactos vcc0
      WHERE vcc0.id_contacto = ${alias}.id_contacto
        AND vcc0.activo = 1
      LIMIT 1),
    (SELECT vc0.id_cliente
       FROM ventas_clientes vc0
      WHERE vc0.activo = 1
        AND TRIM(LOWER(vc0.nombre_empresa)) = TRIM(LOWER(${alias}.cliente))
      ORDER BY vc0.id_cliente
      LIMIT 1)
  )`;
}

function quotationContactIdSql(alias = 'c') {
  const clientId = quotationClientIdSql(alias);
  return `COALESCE(
    ${alias}.id_contacto,
    (SELECT vcc1.id_contacto
       FROM ventas_clientes_contactos vcc1
      WHERE vcc1.activo = 1
        AND vcc1.id_cliente = ${clientId}
        AND (
          (${alias}.contacto IS NOT NULL AND TRIM(LOWER(vcc1.nombre_contacto)) = TRIM(LOWER(${alias}.contacto)))
          OR (${alias}.correo IS NOT NULL AND TRIM(LOWER(vcc1.email)) = TRIM(LOWER(${alias}.correo)))
          OR (${alias}.telefono IS NOT NULL AND REPLACE(REPLACE(REPLACE(vcc1.telefono, ' ', ''), '-', ''), '.', '') = REPLACE(REPLACE(REPLACE(${alias}.telefono, ' ', ''), '-', ''), '.', ''))
        )
      ORDER BY vcc1.contacto_principal DESC, vcc1.id_contacto
      LIMIT 1)
  )`;
}

async function searchQuotations(connection, q, limit = 30, scope = null) {
  const like = `%${q || ''}%`;
  const scopeParams=[];
  const scopeSql=buildSourceScope(scope,'c',scopeParams);
  const resolvedClientId = quotationClientIdSql('c');
  const resolvedContactId = quotationContactIdSql('c');
  const [rows] = await connection.query(
    `SELECT c.id_cotizacion, c.nombre_proyecto AS proyecto, c.cliente AS empresa,
            c.ciudad, c.estado, c.tipo_proyecto,
            ${resolvedClientId} AS id_cliente,
            ${resolvedContactId} AS id_contacto,
            c.contacto, vccq.puesto_contacto, c.correo, c.telefono, c.mx, c.estatus_proyecto
       FROM ventas_cotizaciones_cor c
       LEFT JOIN ventas_clientes_contactos vccq
         ON vccq.id_contacto = c.id_contacto
        AND vccq.activo = 1
      WHERE c.activo = 1
        AND (? = '' OR c.nombre_proyecto LIKE ? OR c.cliente LIKE ? OR c.mx LIKE ? OR c.contacto LIKE ?)${scopeSql}
      ORDER BY c.updated_at DESC, c.id_cotizacion DESC
      LIMIT ?`,
    [q || '', like, like, like, like, ...scopeParams, limit]
  );
  return rows;
}

async function findQuotation(connection, idCotizacion, scope = null) {
  const params=[idCotizacion];
  const scopeSql=buildSourceScope(scope,'c',params);
  const resolvedClientId = quotationClientIdSql('c');
  const resolvedContactId = quotationContactIdSql('c');
  const [rows] = await connection.query(
    `SELECT c.id_cotizacion, c.nombre_proyecto AS proyecto, c.cliente AS empresa,
            c.ciudad, c.estado, c.tipo_proyecto,
            ${resolvedClientId} AS id_cliente,
            ${resolvedContactId} AS id_contacto,
            c.contacto, vccq.puesto_contacto, c.correo, c.telefono, c.mx, c.estatus_proyecto
       FROM ventas_cotizaciones_cor c
       LEFT JOIN ventas_clientes_contactos vccq
         ON vccq.id_contacto = c.id_contacto
        AND vccq.activo = 1
      WHERE c.id_cotizacion = ? AND c.activo = 1${scopeSql}
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function listClientContacts(connection, idCliente) {
  if (!idCliente) return [];
  const [rows] = await connection.query(
    `SELECT id_contacto, id_cliente, nombre_contacto AS contacto, puesto_contacto, email AS correo, telefono, contacto_principal
       FROM ventas_clientes_contactos
      WHERE id_cliente = ? AND activo = 1
      ORDER BY contacto_principal DESC, nombre_contacto`,
    [idCliente]
  );
  return rows;
}


async function createClientContact(connection, data) {
  const [result] = await connection.query(
    `INSERT INTO ventas_clientes_contactos
      (id_cliente, nombre_contacto, puesto_contacto, email, telefono, contacto_principal, activo, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    [data.id_cliente, data.nombre_contacto, data.puesto_contacto, data.email, data.telefono, data.id_usuario, data.id_usuario]
  );
  return Number(result.insertId);
}

async function updateQuotationContact(connection, idCotizacion, contact) {
  if (!idCotizacion) return;
  await connection.query(
    `UPDATE ventas_cotizaciones_cor
        SET id_contacto = ?, contacto = ?, correo = ?, telefono = ?, updated_by = ?
      WHERE id_cotizacion = ? AND activo = 1`,
    [contact.id_contacto, contact.contacto, contact.correo, contact.telefono, contact.id_usuario, idCotizacion]
  );
}

async function getCaptureCatalogs(connection) {
  const [states] = await connection.query(
    `SELECT articulo AS value
       FROM catalogo_general
      WHERE activo = 1
        AND LOWER(TRIM(area)) = 'general'
        AND LOWER(TRIM(elemento)) = 'estado'
        AND articulo IS NOT NULL
        AND TRIM(articulo) <> ''
      ORDER BY orden, articulo`
  );
  const [types] = await connection.query(
    `SELECT articulo AS value
       FROM catalogo_general
      WHERE activo = 1
        AND LOWER(TRIM(area)) = 'ventas'
        AND LOWER(TRIM(elemento)) = 'tipo de proyecto'
        AND articulo IS NOT NULL
        AND TRIM(articulo) <> ''
      ORDER BY orden, articulo`
  );
  return {
    estados: states.map((row) => row.value),
    tipos_proyecto: types.map((row) => row.value)
  };
}

async function createProspection(connection, record) {
  const [result] = await connection.query(
    `INSERT INTO ventas_prospecciones (
       empresa, proyecto, ubicacion, latitud, longitud, contacto, puesto_contacto, correo, telefono, comentario,
       id_usuario, ciudad, estado, tipo_proyecto, fecha_visita, id_estatus, estatus, fecha_cam_estatus,
       nuevo, proyecto_activo, proyecto_cotizado, id_proyecto_instalacion, id_cotizacion, id_cliente, id_contacto, activo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [record.empresa, record.proyecto, record.ubicacion, record.latitud, record.longitud, record.contacto,
     record.puesto_contacto, record.correo, record.telefono, record.comentario, record.id_usuario, record.ciudad, record.estado,
     record.tipo_proyecto, record.fecha_visita, record.id_estatus, record.estatus, record.fecha_cam_estatus,
     record.nuevo, record.proyecto_activo, record.proyecto_cotizado, record.id_proyecto_instalacion,
     record.id_cotizacion, record.id_cliente, record.id_contacto]
  );
  return Number(result.insertId);
}

async function insertVisitFiles(connection, idPros, files) {
  for (const file of files) {
    await connection.query(
      `INSERT INTO ventas_prospeccion_archivos (
         id_pros, id_com_pors, tipo_relacion, nombre_archivo, nombre_original, mime_type, extension,
         tamano_bytes, storage_provider, storage_url, storage_container, storage_blob_name, thumbnail_url, orden, es_imagen, activo
       ) VALUES (?, NULL, 'VISITA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [idPros, file.nombre_archivo, file.nombre_original, file.mime_type, file.extension, file.tamano_bytes,
       file.storage_provider, file.storage_url, file.storage_container, file.storage_blob_name, file.thumbnail_url, file.orden]
    );
  }
}

async function insertHistory(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospeccion_historial
       (id_pros, id_usuario, tipo_evento, campo, valor_anterior, valor_nuevo, comentario, fecha_evento, ip_origen)
     VALUES (?, ?, 'CREACION', NULL, NULL, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
    [record.id_pros, record.id_usuario, JSON.stringify(record.valor_nuevo || {}), record.comentario || null, record.ip || null]
  );
}

async function listProspectionStatuses(connection) {
  const [rows] = await connection.query(
    `SELECT articulo AS estatus
       FROM catalogo_general
      WHERE activo = 1
        AND TRIM(LOWER(area)) = 'ventas'
        AND TRIM(LOWER(elemento)) = 'estatus pros'
      ORDER BY orden ASC, articulo ASC`
  );
  return rows.map((row) => row.estatus).filter(Boolean);
}

async function findProspectionStatus(connection, statusName) {
  const [catalogRows] = await connection.query(
    `SELECT articulo AS estatus
       FROM catalogo_general
      WHERE activo = 1
        AND TRIM(LOWER(area)) = 'ventas'
        AND TRIM(LOWER(elemento)) = 'estatus pros'
        AND TRIM(LOWER(articulo)) = TRIM(LOWER(?))
      LIMIT 1`,
    [statusName]
  );
  if (!catalogRows.length) return null;
  const [statusRows] = await connection.query(
    `SELECT id_estatus
       FROM ventas_prospeccion_estatus
      WHERE activo = 1
        AND TRIM(LOWER(nombre)) = TRIM(LOWER(?))
      LIMIT 1`,
    [catalogRows[0].estatus]
  );
  return { estatus: catalogRows[0].estatus, id_estatus: statusRows[0]?.id_estatus || null };
}

async function updateProspectionStatus(connection, idPros, status) {
  await connection.query(
    `UPDATE ventas_prospecciones
        SET id_estatus = ?, estatus = ?, fecha_cam_estatus = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_pros = ? AND activo = 1`,
    [status.id_estatus, status.estatus, idPros]
  );
}

async function createProspectionComment(connection, data) {
  const [result] = await connection.query(
    `INSERT INTO ventas_prospeccion_comentarios
       (id_pros, id_usuario, comentario, fecha_hora, editado, activo)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), 0, 1)`,
    [data.id_pros, data.id_usuario, data.comentario || '']
  );
  return Number(result.insertId);
}

async function insertCommentFiles(connection, idPros, idComment, files) {
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    await connection.query(
      `INSERT INTO ventas_prospeccion_archivos (
         id_pros, id_com_pors, tipo_relacion, nombre_archivo, nombre_original, mime_type, extension,
         tamano_bytes, storage_provider, storage_url, storage_container, storage_blob_name, thumbnail_url, orden, es_imagen, activo
       ) VALUES (?, ?, 'COMENTARIO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [idPros, idComment, file.nombre_archivo, file.nombre_original, file.mime_type, file.extension,
       file.tamano_bytes, file.storage_provider, file.storage_url, file.storage_container, file.storage_blob_name, file.thumbnail_url, index + 1, file.es_imagen ? 1 : 0]
    );
  }
}

async function insertProspectionHistory(connection, record) {
  await connection.query(
    `INSERT INTO ventas_prospeccion_historial
       (id_pros, id_usuario, tipo_evento, campo, valor_anterior, valor_nuevo, comentario, fecha_evento, ip_origen)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
    [record.id_pros, record.id_usuario || null, record.tipo_evento, record.campo || null,
     record.valor_anterior == null ? null : JSON.stringify(record.valor_anterior),
     record.valor_nuevo == null ? null : JSON.stringify(record.valor_nuevo),
     record.comentario || null, record.ip || null]
  );
}

module.exports = {
  getConnection,
  findExistingUserIds,
  findExistingProspectionIds,
  findStatusIdByName,
  upsertProspection,
  replaceVisitFiles,
  upsertComment,
  replaceCommentFile,
  listProspections,
  getKpis,
  getCatalogs,
  getMap,
  getProspectionById,
  listCommentsByProspection,
  listFilesByProspection,
  findFileById,
  deactivateFile,
  searchInstallationProjects,
  findInstallationProject,
  searchQuotations,
  findQuotation,
  listClientContacts,
  createClientContact,
  updateQuotationContact,
  getCaptureCatalogs,
  createProspection,
  insertVisitFiles,
  insertHistory,
  listProspectionStatuses,
  findProspectionStatus,
  updateProspectionStatus,
  createProspectionComment,
  insertCommentFiles,
  insertProspectionHistory
};
