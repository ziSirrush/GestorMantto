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
  'estatus', 'activo', 'ajustador', 'fecha_inicio_ajuste', 'fecha_fin_ajuste_real',
  'fecha_fin_ajuste_modificado', 'fecha_fin_ajuste_planeado'
]);
const SELECT_EQUIPO = `f.id_ins_fl,f.id_proyecto,f.referencia_sitio,f.proyecto,
  f.estatus,f.activo,f.ajustador,f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
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
  return require('./instalaciones-programacion-personal.conciliacion.service')
    .reconciliarEquipo(idEquipo,opts);
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
    creadas:0,actualizadas:0,historicas:0,retiradas:0,conflictos:0,revision:0,errores:0,omitidos_por_limite:0,...extras};
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
    // Las bajas tambien deben congelar la barra azul.
    ids.push(id);
  }
  const unicos=[...new Set(ids)].sort((a,b)=>a-b);
  const limitados=unicos.slice(0,MAX_AJUSTES_POR_SYNC);
  r.omitidos_por_limite=Math.max(0,unicos.length-limitados.length);
  for(const id of limitados) {
    try {
      const item=await reconciliarPorId(id,{tecnico:true,actorId:null});
      r.procesados++;
      r.creadas+=item.creadas||0;
      r.actualizadas+=item.actualizadas||0;
      r.historicas+=item.historicas||0;
      r.retiradas+=item.retiradas||0;
      r.conflictos+=(item.conflictos||[]).length;
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
  // Sin precargas ni consultas por todas las claves de FL.
  // El controlador fuente reporta solamente los IDs relevantes tras COMMIT.
  if(!integracionVerificada(req))return originalSync(req,res);
  let capturado=null,status=200;
  const facade={
    status(code){status=code;return this;},
    json(body){capturado=body;return this;}
  };
  await originalSync(req,facade);
  if(capturado===null)throw Error('INT9_SYNC_SIN_RESPUESTA');
  if(status>=400||capturado?.ok!==true)return res.status(status).json(capturado);
  const list=Array.isArray(req.int9CommittedChanges)?req.int9CommittedChanges:[];
  const unique=[...new Set(list.filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b);
  const picked=unique.slice(0,MAX_AJUSTES_POR_SYNC);
  const report=estadoLote({estado:'SIN_CAMBIOS',claves:unique.length,
    cambios_relevantes:unique.length,
    omitidos_por_limite:Math.max(0,unique.length-picked.length)});
  for(const id of picked){
    try{
      const item=await reconciliarPorId(id,{tecnico:true,actorId:null});
      report.procesados++;
      report.creadas+=item.creadas||0;
      report.actualizadas+=item.actualizadas||0;
      report.historicas+=item.historicas||0;
      report.conflictos+=(item.conflictos||[]).length;
      if(item.estado==='REQUIERE_REVISION')report.revision++;
    }catch(error){
      report.errores++;
      console.error('[INT9_POST_SYNC_RECONCILIACION]',JSON.stringify({id_ins_fl:id,code:error?.code||'ERROR'}));
    }
  }
  report.estado=(report.errores||report.revision||report.omitidos_por_limite)?'REQUIERE_ATENCION':
    (report.procesados?'PROCESADO':'SIN_CAMBIOS');
  console.info('[INT9_AJUSTADORES_F3_SYNC]',JSON.stringify({
    estado:report.estado,cambios_relevantes:report.cambios_relevantes,
    procesados:report.procesados,creadas:report.creadas,
    actualizadas:report.actualizadas,historicas:report.historicas,
    conflictos:report.conflictos,errores:report.errores,
    omitidos_por_limite:report.omitidos_por_limite
  }));
  return res.status(status).json({...capturado,programacion_ajustadores:report});
}

module.exports={
  reconciliarManual,ejecutarSyncConAjustadores,
  _test:Object.freeze({identificador,cuerpoManual,gestionada,huellaEquipo,claveCompuesta,
    clavesDeEntrada,comparable,huboCambioRelevante,aplicarCambios,reconciliarPorId,
    consultarPorClaves,integracionVerificada,estadoLote})
};
