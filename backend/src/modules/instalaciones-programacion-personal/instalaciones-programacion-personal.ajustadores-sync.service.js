'use strict';

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 3]
// Reconciliacion incremental de ajustadores tras sync de ins_fl, SOLO cuando
// la integracion M2M fue autenticada. Cada equipo es una transaccion propia.
// La fuente oficial de identidad y fechas sigue siendo Aiven MySQL (ins_fl).
const db = require('../../config/db');
const asignaciones = require('./instalaciones-programacion-personal.asignaciones.service');
const vinculaciones = require('./instalaciones-programacion-personal.ajustadores.service');
const shared = vinculaciones._shared;

const TIPO = 'AJUSTADOR';
const CAMPOS_SEGUIDOS = Object.freeze([
  'activo', 'ajustador', 'fecha_inicio_ajuste', 'fecha_fin_ajuste_real',
  'fecha_fin_ajuste_modificado', 'fecha_fin_ajuste_planeado'
]);
const SELECT_EQUIPO = `f.id_ins_fl,f.id_proyecto,f.referencia_sitio,f.proyecto,
  f.activo,f.ajustador,f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
  f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_planeado`;
const TAM_LOTE = 40;
const MAX_CLAVES_POR_SYNC = 3000;
const MAX_AJUSTES_POR_SYNC = 80;

function identificador(valor, campo='id_ins_fl') {
  if (!((typeof valor === 'number' && Number.isSafeInteger(valor)) ||
    (typeof valor === 'string' && /^[1-9]\d*$/.test(valor.trim())))) {
    throw shared.fallo(400,'INT9_F3_ID_INVALIDO',`${campo} debe ser un entero positivo.`);
  }
  const n=Number(valor);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw shared.fallo(400,'INT9_F3_ID_INVALIDO',`${campo} debe ser un entero positivo.`);
  }
  return n;
}

function cuerpoManual(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body,'id_ins_fl')) {
    throw shared.fallo(400,'INT9_F3_CUERPO_INVALIDO','Indica exclusivamente id_ins_fl.');
  }
  return identificador(body.id_ins_fl);
}

function actorReal(req) {
  if (req.viewerContext?.active === true) {
    throw shared.fallo(403,'INT9_VISOR_SOLO_LECTURA','El Visor no puede sincronizar asignaciones.');
  }
  const uid=Number(req.user?.id_SB || req.user?.id || 0);
  if (!Number.isSafeInteger(uid) || uid < 1) {
    throw shared.fallo(401,'INT9_SESION_INVALIDA','Se requiere identidad real.');
  }
  return uid;
}

function integracionVerificada(req) {
  const expected=String(process.env.INTEGRATION_INS_FL_ID || '').trim();
  return Boolean(expected && req.integrationAuth && req.integrationAuth.integrationId === expected);
}

function sqlEquipo(access, block=false) {
  return `SELECT ${SELECT_EQUIPO} FROM ins_fl f
    WHERE f.id_ins_fl=? AND f.activo=1${access?` AND (${access.sql})`:''}
    LIMIT 1${block?' FOR UPDATE':''}`;
}

function valsEquipo(id,access) {
  return [id,...(access?.params || [])];
}

async function obtenerEquipo(conn,id,access,block=false) {
  const [rows] = await conn.query(sqlEquipo(access,block),valsEquipo(id,access));
  return rows.length===1?rows[0]:null;
}

async function catalogoActual() {
  const [rows] = await db.query(
    `SELECT id_personal,nombre FROM instalaciones_personal
      WHERE activo=1 AND tipo_personal=? ORDER BY id_personal ASC
      LIMIT ${shared.MAX_AJUSTADORES_CATALOGO+1}`, [TIPO]);
  if (rows.length > shared.MAX_AJUSTADORES_CATALOGO) {
    throw shared.fallo(422,'INT9_F3_CATALOGO_EXCESIVO','No se pudo verificar el catálogo completo.');
  }
  return shared.indicePersonal(rows);
}

function huellaEquipo(x) {
  return JSON.stringify([x.id_ins_fl,x.ajustador_origen,x.estado,x.inicio,x.fin,x.fuente_fin,
    x.personas.map(p=>[p.id_personal,shared.nombreClave(p.nombre)]).sort((a,b)=>a[0]-b[0])]);
}

function gestionada(row) {
  // Una edicion manual de notas o de fechas desactiva la gestion automatica.
  // Conservar cualquier dato editado manualmente: nunca retirarlo en F3.
  return row.notas === shared.NOTA_AUTO && row.fecha_desde == null && row.fecha_hasta == null;
}

function firmaAsignaciones(rows) {
  return rows.map(r=>`${r.id_asignacion}:${r.id_personal}`).sort().join('|');
}

async function filasEquipo(conn,id) {
  const [rows] = await conn.query(
    `SELECT a.id_asignacion,a.id_personal,a.fecha_desde,a.fecha_hasta,a.notas
       FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
      WHERE a.id_ins_fl=? AND a.activo=1 AND p.tipo_personal=?
      ORDER BY a.id_personal,a.id_asignacion`,[id,TIPO]);
  return rows.map(r=>({...r,id_asignacion:Number(r.id_asignacion),id_personal:Number(r.id_personal)}));
}

async function bloqueaPersonas(conn,ids) {
  if (!ids.length) return [];
  const [rows] = await conn.query(
    `SELECT p.id_personal,p.nombre,p.activo FROM instalaciones_personal p
      WHERE p.tipo_personal=? AND p.id_personal IN (${ids.map(()=>'?').join(',')})
      ORDER BY p.id_personal FOR UPDATE`,[TIPO,...ids]);
  return rows;
}

async function ocupaciones(conn,ids) {
  if (!ids.length) return [];
  const [rows] = await conn.query(
    `SELECT a.id_asignacion,a.id_personal,a.id_ins_fl,a.fecha_desde,a.fecha_hasta,
            f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
            f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_planeado
       FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
       JOIN ins_fl f ON f.id_ins_fl=a.id_ins_fl AND f.activo=1
      WHERE a.activo=1 AND p.tipo_personal=?
        AND a.id_personal IN (${ids.map(()=>'?').join(',')})
      ORDER BY a.id_personal,a.id_asignacion`,[TIPO,...ids]);
  return rows.map(r=>({...r,id_personal:Number(r.id_personal),id_ins_fl:Number(r.id_ins_fl),
    ...asignaciones._read.windowAsignacion(TIPO,r,r)}));
}

function resultado(id,estado,extras={}) {
  // No se exponen los identificadores de equipos ajenos, ni nombres/fechas de terceros.
  return {id_ins_fl:id,estado,creadas:0,retiradas:0,existentes:0,...extras};
}

async function reconciliarPorId(idEquipo,opts) {
  const id=identificador(idEquipo);
  const {actorId,access=null,tecnico=false}=opts;
  if (!tecnico && !access) {
    throw shared.fallo(403,'INT9_F3_ALCANCE_REQUERIDO','Se requiere alcance CORELLIAN verificado.');
  }
  if (tecnico && actorId !== null) {
    throw shared.fallo(403,'INT9_F3_IDENTIDAD_TECNICA','La ejecución técnica no suplanta usuarios.');
  }
  const equipo=await obtenerEquipo(db,id,access,false);
  if (!equipo) {
    if (tecnico) return resultado(id,'REQUIERE_REVISION',{motivo:'EQUIPO_INACTIVO_O_NO_DISPONIBLE'});
    throw shared.fallo(404,'INT9_EQUIPO_NO_ENCONTRADO','Equipo no encontrado o fuera de alcance.');
  }
  const indice=await catalogoActual();
  const original=shared.presentarEquipo(equipo,indice);
  if (original.estado!=='VINCULABLE') {
    // No retirar asignaciones en una referencia vacia, ambigua o fechas invalidas.
    return resultado(id,'REQUIERE_REVISION',{motivo:original.estado});
  }
  const idsDeseados=original.personas.map(p=>p.id_personal).sort((a,b)=>a-b);
  const prev=await filasEquipo(db,id);
  const idsPrevios=prev.map(p=>p.id_personal);
  const idsParaBloquear=[...new Set([...idsDeseados,...idsPrevios])].sort((a,b)=>a-b);
  const conn=await db.getConnection();
  let abierta=false;
  try {
    await conn.beginTransaction();abierta=true;
    // Orden compartido con altas manuales: primero personal, luego equipo.
    const locked=await bloqueaPersonas(conn,idsParaBloquear);
    if (locked.length!==idsParaBloquear.length || locked.some((p,i)=>Number(p.id_personal)!==idsParaBloquear[i])) {
      throw shared.fallo(409,'INT9_F3_PERSONAL_CAMBIO','Cambió el catálogo mientras se preparaba la sincronización.');
    }
    const byId=new Map(locked.map(p=>[Number(p.id_personal),p]));
    for(const p of original.personas) {
      const now=byId.get(p.id_personal);
      if(Number(now?.activo)!==1 || shared.nombreClave(now?.nombre)!==shared.nombreClave(p.nombre)) {
        throw shared.fallo(409,'INT9_F3_IDENTIDAD_CAMBIO','Identidad o actividad del ajustador modificada.');
      }
    }
    const actualEquipo=await obtenerEquipo(conn,id,access,true);
    if (!actualEquipo) throw shared.fallo(409,'INT9_F3_EQUIPO_CAMBIO','Equipo modificado o fuera de alcance.');
    const actual=shared.presentarEquipo(actualEquipo,indice);
    if (huellaEquipo(actual)!==huellaEquipo(original)) {
      throw shared.fallo(409,'INT9_F3_INS_FL_CAMBIO','Las fechas o la referencia cambiaron durante la sincronización.');
    }
    const current=await filasEquipo(conn,id);
    if (firmaAsignaciones(current)!==firmaAsignaciones(prev)) {
      throw shared.fallo(409,'INT9_F3_ASIGNACIONES_CAMBIO','Cambió la programación del equipo durante la sincronización.');
    }
    if (new Set(current.map(r=>r.id_personal)).size!==current.length) {
      await conn.rollback();abierta=false;
      return resultado(id,'REQUIERE_REVISION',{motivo:'ASIGNACIONES_DUPLICADAS'});
    }
    const wanted=new Set(idsDeseados);
    const ya=new Set(current.map(r=>r.id_personal));
    const nuevas=idsDeseados.filter(pid=>!ya.has(pid));
    const retirables=current.filter(r=>!wanted.has(r.id_personal)&&gestionada(r));
    const libres=await ocupaciones(conn,idsDeseados);
    const revisar=[...new Set([...nuevas,...current.filter(r=>wanted.has(r.id_personal)&&gestionada(r)).map(r=>r.id_personal)])];
    const conflicto=[];
    for (const pid of revisar) {
      const otras=libres.filter(a=>a.id_personal===pid && a.id_ins_fl!==id);
      if(otras.some(a=>!a.valida)) conflicto.push({id_personal:pid,motivo:'OTRA_ASIGNACION_SIN_FECHAS'});
      else if(otras.some(a=>asignaciones._read.intersect(a.inicio,a.fin,actual.inicio,actual.fin))) {
        conflicto.push({id_personal:pid,motivo:'TRASLAPE'});
      }
    }
    if (conflicto.length) {
      await conn.rollback();abierta=false;
      return resultado(id,'CONFLICTO',{conflictos:conflicto});
    }
    if (!nuevas.length && !retirables.length) {
      await conn.rollback();abierta=false;
      return resultado(id,'SIN_CAMBIOS',{existentes:current.length});
    }
    for(const row of retirables) {
      const [updated]=await conn.execute(
        `UPDATE instalaciones_programacion_asignaciones
            SET activo=0,updated_by=?
          WHERE id_asignacion=? AND id_personal=? AND id_ins_fl=? AND activo=1
            AND notas=? AND fecha_desde IS NULL AND fecha_hasta IS NULL`,
        [actorId,row.id_asignacion,row.id_personal,id,shared.NOTA_AUTO]);
      if (Number(updated.affectedRows)!==1) {
        throw shared.fallo(409,'INT9_F3_RETIRO_CONCURRENTE','La asignación automática fue modificada.');
      }
    }
    for(const pid of nuevas) {
      const [insert]=await conn.execute(
        `INSERT INTO instalaciones_programacion_asignaciones
          (id_personal,id_ins_fl,fecha_desde,fecha_hasta,notas,activo,created_by,updated_by)
          VALUES(?,?,NULL,NULL,?,1,?,?)`,
        [pid,id,shared.NOTA_AUTO,actorId,actorId]);
      if (!Number.isSafeInteger(Number(insert.insertId)) || Number(insert.insertId)<1) {
        throw shared.fallo(422,'INT9_F3_ID_ASIGNACION','No se obtuvo ID seguro para la asignación.');
      }
    }
    await conn.commit();abierta=false;
    return resultado(id,'SINCRONIZADO',{
      creadas:nuevas.length,retiradas:retirables.length,existentes:current.length});
  } catch(error) {
    if(abierta) await conn.rollback().catch(()=>{});
    if(error?.code==='ER_DUP_ENTRY') {
      throw shared.fallo(409,'INT9_F3_DUPLICADO','Una asignación se duplicó durante el cambio.');
    }
    throw error;
  } finally {conn.release();}
}

async function reconciliarManual(req) {
  const id=cuerpoManual(req.body);
  const actorId=actorReal(req);
  const access=asignaciones._read.scope(req);
  return reconciliarPorId(id,{actorId,access,tecnico:false});
}

function claveCompuesta(proyecto,referencia) {
  return JSON.stringify([String(proyecto ?? '').trim().toLocaleLowerCase('es-MX'),
    String(referencia ?? '').trim().toLocaleLowerCase('es-MX')]);
}

function clavesDeEntrada(rows) {
  const keys=new Map();
  for(let i=0;i<rows.length;i++) {
    const r=rows[i];
    if (!r || typeof r!=='object' || Array.isArray(r)) continue;
    const proyecto=String(r.id_proyecto??'').trim();
    const sitio=String(r.referencia_sitio??'').trim();
    if (!proyecto || !sitio) continue;
    const key=claveCompuesta(proyecto,sitio);
    if (!keys.has(key)) keys.set(key,{key,proyecto,sitio,indices:[]});
    keys.get(key).indices.push(i);
  }
  return [...keys.values()];
}

async function consultarPorClaves(keys) {
  const map=new Map();
  for(let i=0;i<keys.length;i+=TAM_LOTE) {
    const slice=keys.slice(i,i+TAM_LOTE);
    const where=slice.map(()=>'(f.id_proyecto=? AND f.referencia_sitio=?)').join(' OR ');
    const params=slice.flatMap(k=>[k.proyecto,k.sitio]);
    const [rows]=await db.query(`SELECT ${SELECT_EQUIPO}
      FROM ins_fl f WHERE ${where}`,params);
    for(const row of rows) {
      const key=claveCompuesta(row.id_proyecto,row.referencia_sitio);
      // Duplicidad o colision de claves en MySQL: no decidir a ciegas.
      if(map.has(key))map.set(key,null);
      else map.set(key,row);
    }
  }
  return map;
}

function comparable(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  return String(v).trim();
}
function huboCambioRelevante(a,b) {
  if(!b)return false;
  if(!a)return true;
  return CAMPOS_SEGUIDOS.some(campo=>comparable(a[campo])!==comparable(b[campo]));
}

function estadoLote(extras={}) {
  return {estado:'SIN_CAMBIOS',claves:0,cambios_relevantes:0,procesados:0,
    creadas:0,retiradas:0,conflictos:0,revision:0,errores:0,omitidos_por_limite:0,...extras};
}

async function aplicarCambios(req,antes,despues,keys,erroresIndices) {
  const r=estadoLote({claves:keys.length});
  if(!integracionVerificada(req))return {...r,estado:'SIN_AUTORIZACION_TECNICA'};
  if(keys.length>MAX_CLAVES_POR_SYNC)return {...r,estado:'LOTE_EXCESIVO',omitidos_por_limite:keys.length};
  const ids=[];
  for (const item of keys) {
    if(item.indices.some(idx=>erroresIndices.has(idx)))continue;
    const previo=antes.get(item.key),nuevo=despues.get(item.key);
    if(!despues.has(item.key) || (antes.has(item.key)&&previo===null) ||
        (despues.has(item.key)&&nuevo===null)) {
      // Clave no encontrada o duplicada: no inferir equivalencias textuales
      // a partir de la collation MySQL; requiere revision sin escribir.
      r.revision++;continue;
    }
    if(!huboCambioRelevante(previo,nuevo))continue;
    r.cambios_relevantes++;
    const id=Number(nuevo?.id_ins_fl);
    if(!Number.isSafeInteger(id)||id<1){r.revision++;continue;}
    if(Number(nuevo.activo)!==1){r.revision++;continue;}
    ids.push(id);
  }
  const unicos=[...new Set(ids)].sort((a,b)=>a-b);
  const limitados=unicos.slice(0,MAX_AJUSTES_POR_SYNC);
  r.omitidos_por_limite=Math.max(0,unicos.length-limitados.length);
  for(const id of limitados) {
    try {
      const item=await reconciliarPorId(id,{tecnico:true,actorId:null});
      r.procesados++;
      r.creadas+=item.creadas;
      r.retiradas+=item.retiradas;
      if(item.estado==='CONFLICTO')r.conflictos++;
      if(item.estado==='REQUIERE_REVISION')r.revision++;
    } catch(error) {
      r.errores++;
      // El sync ins_fl ya fue confirmado: comunicar fallo parcial sin falsear rollback.
      console.error('[INT9_AJUSTADORES_F3_SYNC_ERROR]',JSON.stringify({
        id_ins_fl:id,code:error?.code||'ERROR',message:'Reconciliación no aplicada'
      }));
    }
  }
  r.estado=(r.errores||r.conflictos||r.revision||r.omitidos_por_limite)?'REQUIERE_ATENCION':
    (r.procesados?'PROCESADO':'SIN_CAMBIOS');
  return r;
}

async function ejecutarSyncConAjustadores(req,res,originalSync) {
  // Este hook solo admite la identidad técnica ya comprobada por el Guard M2M.
  // Si la instalación usa AUTH_ENABLED=false, conserva el sync legacy SIN
  // añadir mutaciones de asignaciones a una ruta sin credencial verificada.
  if(!integracionVerificada(req)) {
    return originalSync(req,res);
  }
  const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
  const keys=clavesDeEntrada(rows);
  let prev=null;
  let problemaPrevio=null;
  try {
    if(keys.length<=MAX_CLAVES_POR_SYNC)prev=await consultarPorClaves(keys);
    else problemaPrevio='LOTE_EXCESIVO';
  } catch(error) {
    problemaPrevio='PRELECTURA_NO_DISPONIBLE';
    console.error('[INT9_AJUSTADORES_F3_PREFLIGHT_ERROR]',String(error?.code||'ERROR'));
  }
  // El controlador original solo usa .status(...) y .json(...). La fachada
  // conserva su resultado HTTP, pero permite completar F3 antes de responder;
  // no cambia sus validaciones, transaccion ni resguardo de sync.
  let capturado=null;
  let status=200;
  const facade={
    status(code){status=code;return this;},
    json(body){capturado=body;return this;}
  };
  await originalSync(req,facade);
  if(capturado===null)throw Error('INT9_F3_SYNC_SIN_RESPUESTA');
  if(status>=400 || capturado?.ok!==true) {
    return res.status(status).json(capturado); // nunca reconciliar un sync fallido
  }
  let report;
  if(problemaPrevio) {
    report=estadoLote({estado:problemaPrevio,claves:keys.length,
      omitidos_por_limite:problemaPrevio==='LOTE_EXCESIVO'?keys.length:0});
  } else {
    try {
      const post=await consultarPorClaves(keys);
      const failed=new Set((capturado.errors||[]).map(e=>Number(e.index)).filter(Number.isSafeInteger));
      report=await aplicarCambios(req,prev,post,keys,failed);
    } catch(error) {
      console.error('[INT9_AJUSTADORES_F3_POST_SYNC_ERROR]',String(error?.code||'ERROR'));
      report=estadoLote({estado:'ERROR_POST_SYNC',claves:keys.length,errores:1});
    }
  }
  console.info('[INT9_AJUSTADORES_F3_SYNC]',JSON.stringify({
    integration_id:req.integrationAuth.integrationId,estado:report.estado,
    claves:report.claves,cambios:report.cambios_relevantes,procesados:report.procesados,
    creadas:report.creadas,retiradas:report.retiradas,
    conflictos:report.conflictos,revision:report.revision,
    errores:report.errores,omitidos_por_limite:report.omitidos_por_limite
  }));
  return res.status(status).json({...capturado,programacion_ajustadores:report});
}

module.exports={
  reconciliarManual,ejecutarSyncConAjustadores,
  _test:Object.freeze({identificador,cuerpoManual,gestionada,huellaEquipo,claveCompuesta,
    clavesDeEntrada,comparable,huboCambioRelevante,aplicarCambios,reconciliarPorId,
    consultarPorClaves,integracionVerificada,estadoLote})
};
