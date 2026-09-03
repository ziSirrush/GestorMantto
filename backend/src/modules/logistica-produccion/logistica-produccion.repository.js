'use strict';

// [Aster | 2026-09-03 | ASTER-MG | FIX PVO-PRODUCCION GUARDAR EDICION V002]

// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 2 PVO-PRODUCCION FUENTES LOG_OPS INS_FL V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 3 PVO-PRODUCCION FILTROS MAIN V001]
// [Aster | 2026-09-04 | ASTER-MG | FASE 5 PVO-PRODUCCION DETALLE SIN VENTAS V001]
// id_log_ops es la relacion operativa. Proyecto/PPNS/PVO/Estatus Logistica se leen de log_ops;
// Fecha de Visita y Fecha entrega cubos se leen de ins_fl. Las columnas snapshot existentes
// se conservan solo para compatibilidad con registros historicos sin id_log_ops.

const db = require('../../config/db');

const STATUS_CATALOG=Object.freeze({area:'Logistica',elemento:'Estatus Produccion'});

const MANUAL_SALES_ROLE_SQL = `(
  r.codigo IN ('DIRECTOR_VENTAS','ASESOR_COMERCIAL','GERENTE_CUENTAS_CORPORATIVAS')
  OR r.codigo LIKE 'GERENTE_COMERCIAL%'
)`;
const MANUAL_INSTALL_ROLE_SQL = `(
  r.codigo='SUPERVISOR_INSTALACIONES'
  OR r.codigo LIKE 'SUPERINTENDENTE_INSTALACIONES%'
)`;

const FL_AGG = `
  SELECT TRIM(i.id_proyecto) AS id_proyecto,
         CASE WHEN COUNT(DISTINCT i.id_sup)=1 THEN MAX(i.id_sup) ELSE NULL END AS id_supervisor,
         CASE WHEN COUNT(DISTINCT i.id_asesor)=1 THEN MAX(i.id_asesor) ELSE NULL END AS id_asesor,
         GROUP_CONCAT(DISTINCT us.iniciales ORDER BY us.iniciales SEPARATOR ', ') AS supervisores,
         GROUP_CONCAT(DISTINCT ua.iniciales ORDER BY ua.iniciales SEPARATOR ', ') AS asesores,
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_visita),'') ORDER BY i.fecha_visita SEPARATOR ', ') AS fechas_visita,
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(i.fecha_posible_recepcion_cubo),'') ORDER BY i.fecha_posible_recepcion_cubo SEPARATOR ', ') AS fechas_cubos,
         COUNT(DISTINCT i.id_sup) AS supervisores_count,
         COUNT(DISTINCT i.id_asesor) AS asesores_count,
         COUNT(DISTINCT NULLIF(TRIM(i.fecha_visita),'')) AS visita_count,
         COUNT(DISTINCT NULLIF(TRIM(i.fecha_posible_recepcion_cubo),'')) AS cubos_count
    FROM ins_fl i
    LEFT JOIN usuarios us ON us.id_SB=i.id_sup
    LEFT JOIN usuarios ua ON ua.id_SB=i.id_asesor
   WHERE i.activo=1
   GROUP BY TRIM(i.id_proyecto)`;

const BASE_SELECT = `
  SELECT p.*,
         cg.articulo AS estatus_produccion,
         COALESCE(a.cpvo_count,0) AS cpvo_count,
         COALESCE(a.gm_count,0) AS gm_count,
         COALESCE(a.archivos_count,0) AS archivos_count,
         ua.iniciales AS asesores,
         us.iniciales AS supervisores,
         l.id_ppns AS ppns_logistica,
         l.proyecto AS proyecto_logistica,
         l.pvo AS fecha_pvo_logistica,
         l.estatus AS estatus_logistica_fuente,
         fl.supervisores AS supervisores_fuente,
         fl.asesores AS asesores_fuente,
         fl.fechas_visita,
         fl.fechas_visita AS fechas_pvo_fl_fuente,
         fl.fechas_cubos AS fechas_cubos_fuente,
         COALESCE(fl.supervisores_count,0) AS supervisores_fuente_count,
         COALESCE(fl.asesores_count,0) AS asesores_fuente_count,
         COALESCE(fl.visita_count,0) AS visita_count,
         COALESCE(fl.cubos_count,0) AS cubos_count
    FROM logistica_produccion p
    LEFT JOIN log_ops l ON l.id_log_ops=p.id_log_ops
    LEFT JOIN (${FL_AGG}) fl ON fl.id_proyecto=TRIM(l.id_ppns)
    LEFT JOIN catalogo_general cg ON cg.id_catalogo=p.id_estatus_produccion
    LEFT JOIN usuarios ua ON ua.id_SB=p.id_asesor
    LEFT JOIN usuarios us ON us.id_SB=p.id_supervisor
    LEFT JOIN (
      SELECT id_produccion,
             SUM(tipo_archivo='CPVO') AS cpvo_count,
             SUM(tipo_archivo='GM') AS gm_count,
             COUNT(*) AS archivos_count
        FROM logistica_produccion_archivos
       WHERE activo=1
       GROUP BY id_produccion
    ) a ON a.id_produccion=p.id_produccion
`;

async function list(filters={}){
  const where=['p.activo=1'];
  const params=[];
  const vista=String(filters.vista||'').trim().toLowerCase();
  const sinPvo=vista==='sin_pvo'||String(filters.sin_fecha_pvo||'')==='1';
  const sinDocumentos=vista==='sin_documentos'||String(filters.sin_documentos||'')==='1';
  if(sinPvo){
    where.push(`(
      (p.id_log_ops IS NOT NULL AND NULLIF(TRIM(l.pvo),'') IS NULL)
      OR (p.id_log_ops IS NULL AND p.fecha_pvo IS NULL)
    )`);
  }
  if(sinDocumentos)where.push('COALESCE(a.archivos_count,0)=0');
  if(filters.q){
    where.push(`(
      CASE WHEN p.id_log_ops IS NOT NULL THEN l.proyecto ELSE p.proyecto END LIKE ?
      OR CASE WHEN p.id_log_ops IS NOT NULL THEN l.id_ppns ELSE p.ppns END LIKE ?
    )`);
    const q=`%${String(filters.q).trim()}%`;
    params.push(q,q);
  }
  const [rows]=await db.query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC,p.id_produccion DESC`,params);
  return rows;
}

async function byId(id,connection=db){
  const [rows]=await connection.query(`${BASE_SELECT} WHERE p.id_produccion=? AND p.activo=1 LIMIT 1`,[id]);
  return rows[0]||null;
}

async function ppnsOptions(q=''){
  const term=String(q||'').trim();
  const params=[];
  let filter="WHERE l.id_ppns IS NOT NULL AND TRIM(l.id_ppns)<>''";
  if(term){
    filter+=' AND (l.id_ppns LIKE ? OR l.proyecto LIKE ?)';
    params.push(`%${term}%`,`%${term}%`);
  }
  const [rows]=await db.query(`
    SELECT l.id_log_ops,l.id_ppns,l.proyecto,l.pvo,l.estatus,
           fl.id_supervisor,fl.id_asesor,fl.supervisores,fl.asesores,
           fl.fechas_visita,fl.fechas_visita AS fechas_pvo_fl,fl.fechas_cubos,
           COALESCE(fl.supervisores_count,0) AS supervisores_count,
           COALESCE(fl.asesores_count,0) AS asesores_count,
           COALESCE(fl.visita_count,0) AS visita_count,
           COALESCE(fl.visita_count,0) AS pvo_fl_count,
           COALESCE(fl.cubos_count,0) AS cubos_count,
           EXISTS(
             SELECT 1 FROM logistica_produccion p
              WHERE p.id_log_ops=l.id_log_ops AND p.activo=1
           ) AS ya_registrado
      FROM log_ops l
      LEFT JOIN (${FL_AGG}) fl ON fl.id_proyecto=TRIM(l.id_ppns)
      ${filter}
     ORDER BY l.id_ppns,l.proyecto,l.id_log_ops
     LIMIT 100`,params);
  return rows;
}

async function projectOptions(q=''){
  const term=String(q||'').trim();
  const params=[];
  let filter="WHERE l.proyecto IS NOT NULL AND TRIM(l.proyecto)<>''";
  if(term){
    filter+=' AND l.proyecto LIKE ?';
    params.push(`%${term}%`);
  }
  const [rows]=await db.query(`
    SELECT l.id_log_ops,l.proyecto,l.id_ppns,l.pvo,l.estatus,
           fl.fechas_visita,fl.fechas_cubos,
           EXISTS(
             SELECT 1 FROM logistica_produccion p
              WHERE p.id_log_ops=l.id_log_ops AND p.activo=1
           ) AS ya_registrado
      FROM log_ops l
      LEFT JOIN (${FL_AGG}) fl ON fl.id_proyecto=TRIM(l.id_ppns)
      ${filter}
     ORDER BY l.proyecto,l.id_log_ops
     LIMIT 200`,params);
  return rows;
}

async function logSnapshotById(id,connection=db,forUpdate=false){
  const lock=forUpdate?' FOR UPDATE':'';
  const [rows]=await connection.query(`
    SELECT l.id_log_ops,l.id_ppns,l.proyecto,l.pvo,l.estatus,
           fl.id_supervisor,fl.id_asesor,fl.supervisores,fl.asesores,
           fl.fechas_visita,fl.fechas_visita AS fechas_pvo_fl,fl.fechas_cubos,
           COALESCE(fl.supervisores_count,0) AS supervisores_count,
           COALESCE(fl.asesores_count,0) AS asesores_count,
           COALESCE(fl.visita_count,0) AS visita_count,
           COALESCE(fl.visita_count,0) AS pvo_fl_count,
           COALESCE(fl.cubos_count,0) AS cubos_count
      FROM log_ops l
      LEFT JOIN (${FL_AGG}) fl ON fl.id_proyecto=TRIM(l.id_ppns)
     WHERE l.id_log_ops=?
     LIMIT 1${lock}`,[id]);
  return rows[0]||null;
}

async function manualUserOptions(group,q=''){
  const term=String(q||'').trim();
  const params=[];
  const roleSql=group==='SUPERVISOR'?MANUAL_INSTALL_ROLE_SQL:MANUAL_SALES_ROLE_SQL;
  let search='';
  if(term){
    search=' AND (u.nombre LIKE ? OR u.iniciales LIKE ? OR u.puesto LIKE ? OR r.rol LIKE ?)';
    const like=`%${term}%`;
    params.push(like,like,like,like);
  }
  const [rows]=await db.query(`SELECT u.id_SB,u.nombre,u.iniciales,u.puesto,u.area,u.empresa,r.id_rol,r.rol,r.codigo
    FROM usuarios u
    INNER JOIN roles r ON r.id_rol=u.rol_id
    WHERE u.estado=1 AND r.estado=1 AND ${roleSql}${search}
    ORDER BY u.nombre,u.iniciales`,params);
  return rows;
}

async function manualUserValid(id,group,connection=db){
  const roleSql=group==='SUPERVISOR'?MANUAL_INSTALL_ROLE_SQL:MANUAL_SALES_ROLE_SQL;
  const [rows]=await connection.query(`SELECT u.id_SB
    FROM usuarios u
    INNER JOIN roles r ON r.id_rol=u.rol_id
    WHERE u.id_SB=? AND u.estado=1 AND r.estado=1 AND ${roleSql}
    LIMIT 1`,[id]);
  return rows.length===1;
}

async function validStatus(id,connection=db){
  if(id==null||id==='')return true;
  const [rows]=await connection.query(`SELECT id_catalogo FROM catalogo_general
    WHERE id_catalogo=? AND activo=1 AND area=? AND elemento=? LIMIT 1`,
    [id,STATUS_CATALOG.area,STATUS_CATALOG.elemento]);
  return rows.length===1;
}

async function validLogisticsStatus(value,connection=db){
  const status=String(value||'').trim();
  if(!status)return true;
  const [rows]=await connection.query(`SELECT id_catalogo FROM catalogo_general
    WHERE activo=1 AND area=? AND elemento=? AND UPPER(TRIM(articulo))=UPPER(TRIM(?)) LIMIT 1`,
    [STATUS_CATALOG.area,STATUS_CATALOG.elemento,status]);
  return rows.length===1;
}

async function create(input,userId){
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    if(!(await validStatus(input.id_estatus_produccion,connection))){
      const e=new Error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');e.status=400;throw e;
    }
    if(input.id_log_ops){
      const log=await logSnapshotById(input.id_log_ops,connection,true);
      if(!log){const e=new Error('La fila logística relacionada ya no existe.');e.status=404;throw e;}
    }
    const [result]=await connection.query(`INSERT INTO logistica_produccion
      (id_log_ops,modo_registro,ppns,proyecto,id_cotizacion_venta,id_asesor,id_supervisor,
       fecha_pvo,fecha_pvo_fl,fecha_cubos,estatus_logistica,id_estatus_produccion,comentario,
       fecha_envio_docs_fabrica,fecha_envio_pago_fabrica,semana_registro,anio_registro,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        input.id_log_ops||null,input.modo_registro,input.ppns||null,input.proyecto||null,input.id_cotizacion_venta||null,
        input.id_asesor||null,input.id_supervisor||null,input.fecha_pvo||null,input.fecha_pvo_fl||null,input.fecha_cubos||null,
        input.estatus_logistica||null,input.id_estatus_produccion||null,input.comentario||null,
        input.fecha_envio_docs_fabrica||null,input.fecha_envio_pago_fabrica||null,input.semana,input.anio,userId,userId
      ]);
    await connection.commit();
    return result.insertId;
  }catch(error){
    await connection.rollback();
    if(error.code==='ER_DUP_ENTRY'){
      error.status=409;
      error.message='El proyecto seleccionado ya tiene seguimiento activo de PVO-Producción.';
    }
    throw error;
  }finally{connection.release();}
}

async function update(id,input,userId){
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [currentRows]=await connection.query(`SELECT id_produccion,id_log_ops,id_estatus_produccion FROM logistica_produccion
      WHERE id_produccion=? AND activo=1 LIMIT 1 FOR UPDATE`,[id]);
    if(!currentRows.length){const e=new Error('Registro de PVO-Producción no encontrado.');e.status=404;throw e;}
    const locked=currentRows[0];
    const statusChanged=String(input.id_estatus_produccion??'')!==String(locked.id_estatus_produccion??'');
    if(statusChanged&&!(await validStatus(input.id_estatus_produccion,connection))){const e=new Error('El Estatus Producción no pertenece al catálogo activo Logistica / Estatus Produccion.');e.status=400;throw e;}
    const logChanged=String(input.id_log_ops??'')!==String(locked.id_log_ops??'');
    if(logChanged&&input.id_log_ops){
      const log=await logSnapshotById(input.id_log_ops,connection,true);
      if(!log){const e=new Error('La fila logística relacionada ya no existe.');e.status=404;throw e;}
    }
    const [result]=await connection.query(`UPDATE logistica_produccion SET
      id_log_ops=?,ppns=?,proyecto=?,id_cotizacion_venta=?,id_asesor=?,id_supervisor=?,
      fecha_pvo=?,fecha_pvo_fl=?,fecha_cubos=?,estatus_logistica=?,id_estatus_produccion=?,comentario=?,
      fecha_envio_docs_fabrica=?,fecha_envio_pago_fabrica=?,updated_by=?
      WHERE id_produccion=? AND activo=1`,[
        input.id_log_ops||null,input.ppns||null,input.proyecto||null,input.id_cotizacion_venta||null,
        input.id_asesor||null,input.id_supervisor||null,input.fecha_pvo||null,input.fecha_pvo_fl||null,input.fecha_cubos||null,
        input.estatus_logistica||null,input.id_estatus_produccion||null,input.comentario||null,
        input.fecha_envio_docs_fabrica||null,input.fecha_envio_pago_fabrica||null,userId,id
      ]);
    await connection.commit();
    return result.affectedRows;
  }catch(error){
    await connection.rollback();
    if(error.code==='ER_DUP_ENTRY'){
      error.status=409;
      error.message='El proyecto seleccionado ya tiene seguimiento activo de PVO-Producción.';
    }
    throw error;
  }finally{connection.release();}
}

async function files(id){
  const [rows]=await db.query(`SELECT a.*,u.iniciales AS usuario_iniciales
    FROM logistica_produccion_archivos a
    LEFT JOIN usuarios u ON u.id_SB=a.id_usuario
    WHERE a.id_produccion=? AND a.activo=1
    ORDER BY a.tipo_archivo,a.numero_archivo`,[id]);
  return rows;
}

async function fileById(id,fileId){
  const [rows]=await db.query('SELECT * FROM logistica_produccion_archivos WHERE id_produccion=? AND id_archivo=? LIMIT 1',[id,fileId]);
  return rows[0]||null;
}

async function upsertFile(id,type,slot,metadata,userId){
  await db.query(`INSERT INTO logistica_produccion_archivos
    (id_produccion,tipo_archivo,numero_archivo,nombre_archivo,nombre_original,extension,mime_type,tamanio_bytes,
     storage_provider,storage_container,storage_blob_name,storage_url,origen_archivo,id_usuario,activo,eliminado_por,eliminado_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'NUEVO',?,1,NULL,NULL)
    ON DUPLICATE KEY UPDATE
      nombre_archivo=VALUES(nombre_archivo),nombre_original=VALUES(nombre_original),extension=VALUES(extension),
      mime_type=VALUES(mime_type),tamanio_bytes=VALUES(tamanio_bytes),storage_provider=VALUES(storage_provider),
      storage_container=VALUES(storage_container),storage_blob_name=VALUES(storage_blob_name),storage_url=VALUES(storage_url),
      origen_archivo='NUEVO',id_usuario=VALUES(id_usuario),activo=1,eliminado_por=NULL,eliminado_at=NULL`,[
        id,type,slot,metadata.nombre_archivo,metadata.nombre_original,metadata.extension,metadata.mime_type,metadata.tamanio_bytes,
        metadata.storage_provider,metadata.storage_container,metadata.storage_blob_name,metadata.storage_url,userId
      ]);
}

async function deactivateFile(id,fileId,userId){
  const [result]=await db.query(`UPDATE logistica_produccion_archivos
    SET activo=0,eliminado_por=?,eliminado_at=NOW()
    WHERE id_produccion=? AND id_archivo=? AND activo=1`,[userId,id,fileId]);
  return result.affectedRows;
}

async function statuses(){
  const [rows]=await db.query(`SELECT id_catalogo,articulo,descripcion,orden FROM catalogo_general
    WHERE activo=1 AND area=? AND elemento=? ORDER BY orden,articulo`,[STATUS_CATALOG.area,STATUS_CATALOG.elemento]);
  return rows;
}
function statusCatalogDefinition(){return {...STATUS_CATALOG};}

module.exports={
  list,byId,ppnsOptions,projectOptions,logSnapshotById,manualUserOptions,manualUserValid,
  create,update,files,fileById,upsertFile,deactivateFile,statuses,statusCatalogDefinition,validStatus,validLogisticsStatus
};
