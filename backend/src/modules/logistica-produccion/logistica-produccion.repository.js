'use strict';

const db = require('../../config/db');

const BASE_SELECT = `
  SELECT p.*, l.id_ppns, l.proyecto, l.pvo AS fecha_pvo, l.estatus AS estatus_logistica,
         cg.articulo AS estatus_produccion,
         COALESCE(a.cpvo_count,0) AS cpvo_count, COALESCE(a.gm_count,0) AS gm_count,
         COALESCE(a.archivos_count,0) AS archivos_count,
         fl.supervisores, fl.asesores, fl.fechas_pvo_fl, fl.fechas_cubos,
         fl.supervisores_count, fl.asesores_count, fl.pvo_fl_count, fl.cubos_count,
         v.fechas_venta, v.ventas_count,
         (SELECT c.comentario FROM logistica_produccion_comentarios c
           WHERE c.id_produccion=p.id_produccion AND c.activo=1
           ORDER BY c.created_at DESC,c.id_comentario DESC LIMIT 1) AS comentario_reciente
    FROM logistica_produccion p
    LEFT JOIN log_ops l ON l.id_log_ops=p.id_log_ops
    LEFT JOIN catalogo_general cg ON cg.id_catalogo=p.id_estatus_produccion
    LEFT JOIN (
      SELECT id_produccion,
             SUM(tipo_archivo='CPVO') cpvo_count, SUM(tipo_archivo='GM') gm_count, COUNT(*) archivos_count
        FROM logistica_produccion_archivos WHERE activo=1 GROUP BY id_produccion
    ) a ON a.id_produccion=p.id_produccion
    LEFT JOIN (
      SELECT i.id_proyecto,
             GROUP_CONCAT(DISTINCT us.iniciales ORDER BY us.iniciales SEPARATOR ', ') supervisores,
             GROUP_CONCAT(DISTINCT ua.iniciales ORDER BY ua.iniciales SEPARATOR ', ') asesores,
             GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_visita),'') ORDER BY i.fecha_visita SEPARATOR ', ') fechas_pvo_fl,
             GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_posible_recepcion_cubo),'') ORDER BY i.fecha_posible_recepcion_cubo SEPARATOR ', ') fechas_cubos,
             COUNT(DISTINCT NULLIF(TRIM(us.iniciales),'')) supervisores_count,
             COUNT(DISTINCT NULLIF(TRIM(ua.iniciales),'')) asesores_count,
             COUNT(DISTINCT NULLIF(TRIM(i.fecha_visita),'')) pvo_fl_count,
             COUNT(DISTINCT NULLIF(TRIM(i.fecha_posible_recepcion_cubo),'')) cubos_count
        FROM ins_fl i
        LEFT JOIN usuarios us ON us.id_SB=i.id_sup
        LEFT JOIN usuarios ua ON ua.id_SB=i.id_asesor
       WHERE i.activo=1 GROUP BY i.id_proyecto
    ) fl ON TRIM(fl.id_proyecto)=TRIM(COALESCE(l.id_ppns,p.ppns_referencia))
    LEFT JOIN (
      SELECT TRIM(id_equipo_vendido) ppns,
             GROUP_CONCAT(DISTINCT NULLIF(TRIM(fecha_cierre),'') ORDER BY fecha_cierre SEPARATOR ', ') fechas_venta,
             COUNT(DISTINCT NULLIF(TRIM(fecha_cierre),'')) ventas_count
        FROM ventas_cotizaciones_cor
       WHERE activo=1 AND TRIM(estatus_proyecto)='Vendido' AND NULLIF(TRIM(fecha_cierre),'') IS NOT NULL
       GROUP BY TRIM(id_equipo_vendido)
    ) v ON v.ppns=TRIM(COALESCE(l.id_ppns,p.ppns_referencia))`;

async function list(filters = {}) {
  const where = ['p.activo=1'];
  const params = [];
  if (String(filters.sin_fecha_pvo || '') === '1') where.push("(l.pvo IS NULL OR TRIM(l.pvo)='' OR STR_TO_DATE(l.pvo,'%Y-%m-%d') IS NULL)");
  if (filters.q) {
    where.push('(l.proyecto LIKE ? OR l.id_ppns LIKE ? OR p.proyecto_referencia LIKE ? OR p.ppns_referencia LIKE ?)');
    const q = `%${String(filters.q).trim()}%`; params.push(q,q,q,q);
  }
  const [rows] = await db.query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC,p.id_produccion DESC`, params);
  return rows;
}

async function byId(id, connection = db) {
  const [rows] = await connection.query(`${BASE_SELECT} WHERE p.id_produccion=? AND p.activo=1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function ppnsOptions(q = '') {
  const term = String(q).trim();
  const params = [];
  let filter = "WHERE l.id_ppns IS NOT NULL AND TRIM(l.id_ppns)<>''";
  if (term) { filter += ' AND (l.id_ppns LIKE ? OR l.proyecto LIKE ?)'; params.push(`%${term}%`,`%${term}%`); }
  const [rows] = await db.query(`SELECT l.id_log_ops,l.id_ppns,l.proyecto,l.pvo,l.estatus,
      (SELECT GROUP_CONCAT(DISTINCT us.iniciales ORDER BY us.iniciales SEPARATOR ', ') FROM ins_fl i LEFT JOIN usuarios us ON us.id_SB=i.id_sup WHERE i.activo=1 AND TRIM(i.id_proyecto)=TRIM(l.id_ppns)) supervisores,
      (SELECT GROUP_CONCAT(DISTINCT ua.iniciales ORDER BY ua.iniciales SEPARATOR ', ') FROM ins_fl i LEFT JOIN usuarios ua ON ua.id_SB=i.id_asesor WHERE i.activo=1 AND TRIM(i.id_proyecto)=TRIM(l.id_ppns)) asesores,
      (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_visita),'') ORDER BY i.fecha_visita SEPARATOR ', ') FROM ins_fl i WHERE i.activo=1 AND TRIM(i.id_proyecto)=TRIM(l.id_ppns)) fechas_pvo_fl,
      (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_posible_recepcion_cubo),'') ORDER BY i.fecha_posible_recepcion_cubo SEPARATOR ', ') FROM ins_fl i WHERE i.activo=1 AND TRIM(i.id_proyecto)=TRIM(l.id_ppns)) fechas_cubos,
      EXISTS(SELECT 1 FROM logistica_produccion p WHERE p.id_log_ops=l.id_log_ops AND p.activo=1) AS ya_registrado
    FROM log_ops l ${filter} ORDER BY l.id_ppns,l.proyecto,l.id_log_ops LIMIT 100`, params);
  return rows;
}

async function validStatus(id, connection = db) {
  if (id == null || id === '') return true;
  const [rows] = await connection.query(`SELECT id_catalogo FROM catalogo_general
    WHERE id_catalogo=? AND activo=1 AND area='Logistica' AND elemento='Estatus Produccion' LIMIT 1`, [id]);
  return rows.length === 1;
}

async function create(input, userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [logRows] = await connection.query('SELECT id_log_ops,id_ppns,proyecto FROM log_ops WHERE id_log_ops=? LIMIT 1 FOR UPDATE', [input.id_log_ops]);
    if (!logRows.length) { const e=new Error('La fila logística seleccionada ya no existe.');e.status=404;throw e; }
    if (!(await validStatus(input.id_estatus_produccion, connection))) { const e=new Error('El Estatus Producción no pertenece al catálogo activo.');e.status=400;throw e; }
    const log = logRows[0];
    const [result] = await connection.query(`INSERT INTO logistica_produccion
      (id_log_ops,ppns_referencia,proyecto_referencia,id_estatus_produccion,semana_registro,anio_registro,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?)`, [log.id_log_ops,log.id_ppns,log.proyecto,input.id_estatus_produccion||null,input.semana,input.anio,userId,userId]);
    if (input.comentario) await connection.query(`INSERT INTO logistica_produccion_comentarios
      (id_produccion,id_usuario,comentario,origen) VALUES (?,?,?,'USUARIO')`, [result.insertId,userId,input.comentario]);
    await connection.commit();
    return result.insertId;
  } catch (error) { await connection.rollback(); if (error.code==='ER_DUP_ENTRY') error.status=409; throw error; }
  finally { connection.release(); }
}

async function update(id, input, userId) {
  if (!(await validStatus(input.id_estatus_produccion))) { const e=new Error('El Estatus Producción no pertenece al catálogo activo.');e.status=400;throw e; }
  const [result] = await db.query(`UPDATE logistica_produccion SET id_estatus_produccion=?,fecha_envio_docs_fabrica=?,
    fecha_envio_pago_fabrica=?,updated_by=? WHERE id_produccion=? AND activo=1`,
  [input.id_estatus_produccion||null,input.fecha_envio_docs_fabrica||null,input.fecha_envio_pago_fabrica||null,userId,id]);
  return result.affectedRows;
}

async function files(id) {
  const [rows] = await db.query(`SELECT a.*,u.iniciales usuario_iniciales FROM logistica_produccion_archivos a
    LEFT JOIN usuarios u ON u.id_SB=a.id_usuario WHERE a.id_produccion=? AND a.activo=1 ORDER BY a.tipo_archivo,a.numero_archivo`, [id]);
  return rows;
}

async function fileById(id, fileId) {
  const [rows] = await db.query('SELECT * FROM logistica_produccion_archivos WHERE id_produccion=? AND id_archivo=? LIMIT 1',[id,fileId]);
  return rows[0]||null;
}

async function upsertFile(id, type, slot, metadata, userId) {
  await db.query(`INSERT INTO logistica_produccion_archivos
    (id_produccion,tipo_archivo,numero_archivo,nombre_archivo,nombre_original,extension,mime_type,tamanio_bytes,storage_provider,storage_container,storage_blob_name,storage_url,origen_archivo,id_usuario,activo,eliminado_por,eliminado_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'NUEVO',?,1,NULL,NULL)
    ON DUPLICATE KEY UPDATE nombre_archivo=VALUES(nombre_archivo),nombre_original=VALUES(nombre_original),extension=VALUES(extension),
      mime_type=VALUES(mime_type),tamanio_bytes=VALUES(tamanio_bytes),storage_provider=VALUES(storage_provider),storage_container=VALUES(storage_container),
      storage_blob_name=VALUES(storage_blob_name),storage_url=VALUES(storage_url),origen_archivo='NUEVO',id_usuario=VALUES(id_usuario),activo=1,eliminado_por=NULL,eliminado_at=NULL`,
  [id,type,slot,metadata.nombre_archivo,metadata.nombre_original,metadata.extension,metadata.mime_type,metadata.tamanio_bytes,
   metadata.storage_provider,metadata.storage_container,metadata.storage_blob_name,metadata.storage_url,userId]);
}

async function deactivateFile(id, fileId, userId) {
  const [result] = await db.query(`UPDATE logistica_produccion_archivos SET activo=0,eliminado_por=?,eliminado_at=NOW()
    WHERE id_produccion=? AND id_archivo=? AND activo=1`,[userId,id,fileId]);
  return result.affectedRows;
}

async function comments(id) {
  const [rows] = await db.query(`SELECT c.*,COALESCE(u.iniciales,c.autor_legacy,'—') autor FROM logistica_produccion_comentarios c
    LEFT JOIN usuarios u ON u.id_SB=c.id_usuario WHERE c.id_produccion=? AND c.activo=1 ORDER BY c.created_at,c.id_comentario`,[id]);
  return rows;
}

async function addComment(id, text, parentId, userId) {
  const [result]=await db.query(`INSERT INTO logistica_produccion_comentarios
    (id_produccion,id_usuario,comentario,id_comentario_padre,origen) VALUES (?,?,?,?, 'USUARIO')`,[id,userId,text,parentId||null]);
  return result.insertId;
}

async function updateComment(id, commentId, text, userId) {
  const [result]=await db.query(`UPDATE logistica_produccion_comentarios SET comentario=?,editado=1
    WHERE id_produccion=? AND id_comentario=? AND id_usuario=? AND activo=1`,[text,id,commentId,userId]);
  return result.affectedRows;
}

async function deleteComment(id, commentId, userId) {
  const [result]=await db.query(`UPDATE logistica_produccion_comentarios SET activo=0
    WHERE id_produccion=? AND id_comentario=? AND id_usuario=? AND activo=1`,[id,commentId,userId]);
  return result.affectedRows;
}

async function statuses() {
  const [rows]=await db.query(`SELECT id_catalogo,articulo,descripcion,orden FROM catalogo_general
    WHERE activo=1 AND area='Logistica' AND elemento='Estatus Produccion' ORDER BY orden,articulo`);
  return rows;
}

module.exports={list,byId,ppnsOptions,create,update,files,fileById,upsertFile,deactivateFile,comments,addComment,updateComment,deleteComment,statuses};
