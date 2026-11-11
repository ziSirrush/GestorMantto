'use strict';

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 1]
// Fases 1/2/3: identidad, alta controlada e integracion incremental ins_fl.
// La sincronizacion F3 es un servicio independiente; la UI se integra en F4.
const db = require('../../config/db');
const asignaciones = require('./instalaciones-programacion-personal.asignaciones.service');

const MAX_PAGINA = 100;
const MAX_AJUSTADORES_CATALOGO = 5000;
const MAX_NOMBRES_POR_EQUIPO = 5;
const TIPO = 'AJUSTADOR';
const SIN_REFERENCIA = new Set(['', '-', 'n/a', 'na', 'sin ajustador', 'sin asignar', 'null']);

function fallo(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function nombreClave(value) {
  return String(value == null ? '' : value)
    // Identidad: conservar acentos y ñ; NO hacer coincidencias aproximadas.
    .normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
}

function indicePersonal(rows) {
  const index = new Map();
  for (const row of rows) {
    const id = Number(row.id_personal);
    const key = nombreClave(row.nombre);
    if (!Number.isSafeInteger(id) || id < 1 || !key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({id_personal:id, nombre:String(row.nombre).trim()});
  }
  return index;
}

function resolverReferencia(raw, index) {
  const origen = String(raw == null ? '' : raw).trim();
  const key = nombreClave(origen);
  if (SIN_REFERENCIA.has(key)) return {estado:'SIN_REFERENCIA', cantidad_nombres:0, personas:[]};

  // Primero intentar el campo completo: no dividir un nombre que use '/'.
  const exactas = index.get(key);
  if (exactas?.length === 1) {
    return {estado:'IDENTIFICADO', cantidad_nombres:1, personas:exactas};
  }
  if (exactas?.length > 1) {
    return {estado:'AMBIGUO', cantidad_nombres:1, personas:[]};
  }

  // ins_fl contiene tambien 'Nombre A / Nombre B'. Nunca aceptar coincidencias parciales.
  const tokens = origen.includes('/') ? origen.split('/').map(x=>x.trim()) : [origen];
  const keys = tokens.map(nombreClave);
  if (keys.length > MAX_NOMBRES_POR_EQUIPO ||
      keys.some(x=>SIN_REFERENCIA.has(x)) || new Set(keys).size !== keys.length) {
    return {estado:'AMBIGUO', cantidad_nombres:tokens.length, personas:[]};
  }
  const matches = keys.map(x=>index.get(x) || []);
  if (matches.some(x=>x.length > 1)) {
    return {estado:'AMBIGUO', cantidad_nombres:tokens.length, personas:[]};
  }
  if (matches.some(x=>x.length !== 1)) {
    return {estado:'SIN_COINCIDENCIA', cantidad_nombres:tokens.length, personas:[]};
  }
  const personas=matches.map(x=>x[0]);
  if (new Set(personas.map(x=>x.id_personal)).size !== personas.length) {
    return {estado:'AMBIGUO', cantidad_nombres:tokens.length, personas:[]};
  }
  return {estado:'IDENTIFICADO', cantidad_nombres:tokens.length, personas};
}

function enteroOpcional(value, campo) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw fallo(400,'INT9_FILTRO_INVALIDO',`${campo} debe ser un entero positivo.`);
  }
  return n;
}

function limitePagina(value) {
  if (value == null || value === '') return 50;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_PAGINA) {
    throw fallo(400,'INT9_LIMITE_INVALIDO',`El límite permitido es de 1 a ${MAX_PAGINA}.`);
  }
  return n;
}

// Diagnostico de FL: identidad y fechas se evalúan de forma independiente.
// No modifica asignaciones ni oculta causas cuando faltan varios campos.
function incidenciasEquipo(row, referencia, ventana) {
  if (String(row.estatus??'').trim()!=='06-A') return [];
  const issues=[];
  if (referencia.estado!=='IDENTIFICADO') issues.push(referencia.estado);
  const empty=value=>value==null || String(value).trim()==='';
  if (!ventana.inicio) issues.push(empty(row.fecha_inicio_ajuste)?'INICIO_FALTANTE':'INICIO_INVALIDO');
  if (!ventana.fin) {
    const endings=['real','modificado','planeado'].map(source=>row['fecha_fin_ajuste_'+source]);
    issues.push(endings.every(empty)?'FIN_FALTANTE':'FIN_INVALIDO');
  } else if (ventana.inicio && ventana.fin<ventana.inicio) {
    issues.push('FECHAS_INVERTIDAS');
  }
  return issues;
}
function presentarEquipo(row, index) {
  const idEquipo = Number(row.id_ins_fl);
  if (!Number.isSafeInteger(idEquipo) || idEquipo < 1) {
    throw fallo(422,'INT9_EQUIPO_ID_FUERA_RANGO','Identificador del equipo no representable sin pérdida.');
  }
  const referencia = resolverReferencia(row.ajustador, index);
  // Misma prioridad de fechas (real, modificada, planeada) que el calendario actual.
  const ventana = asignaciones._read.windowEquipo(TIPO, row);
  const estado = String(row.estatus??'').trim()!=='06-A' ? 'ESTATUS_NO_ELEGIBLE' :
    (referencia.estado === 'IDENTIFICADO'
      ? (ventana.valida ? 'VINCULABLE' : 'SIN_FECHAS_VALIDAS')
      : referencia.estado);
  return {
    id_ins_fl:idEquipo,
    proyecto:row.proyecto || row.id_proyecto || '',
    referencia_sitio:row.referencia_sitio || '',
    ajustador_origen:String(row.ajustador || '').trim(),
    inicio:ventana.inicio, fin:ventana.fin, fuente_fin:ventana.fuente_fin,
    fechas_validas:ventana.valida,
    incidencias:incidenciasEquipo(row,referencia,ventana),
    estado, cantidad_nombres:referencia.cantidad_nombres,
    // Solo exponer IDs para una referencia completa e inequívoca.
    personas:referencia.estado === 'IDENTIFICADO' ? referencia.personas : []
  };
}

async function catalogoAjustadores() {
  const [people]=await db.query(
    `SELECT id_personal,nombre FROM instalaciones_personal
       WHERE activo=1 AND tipo_personal=? ORDER BY id_personal ASC
       LIMIT ${MAX_AJUSTADORES_CATALOGO+1}`,[TIPO]);
  if (people.length>MAX_AJUSTADORES_CATALOGO)
    throw fallo(422,'INT9_CATALOGO_EXCESIVO','Demasiados ajustadores; no es seguro resolver coincidencias.');
  return indicePersonal(people);
}

async function vinculaciones(req) {
  const query = req.query || {};
  const id = enteroOpcional(query.id_ins_fl, 'id_ins_fl');
  const cursor = enteroOpcional(query.cursor, 'cursor');
  const limit = limitePagina(query.limit);
  if (id != null && cursor != null) {
    throw fallo(400,'INT9_FILTROS_EXCLUYENTES','Usa id_ins_fl o cursor, no ambos.');
  }
  // Guard CORELLIAN aplica sesion, permiso, puerta y usuario efectivo.
  // La capa de datos impone nuevamente el alcance por registro sobre ins_fl.
  const access = asignaciones._read.scope(req);
  const where = [
    'f.activo=1', `(${access.sql})`,
    // Los equipos 06-A sin ajustador tambien deben figurar como pendientes de FL.
    `(TRIM(f.estatus)='06-A' OR (f.ajustador IS NOT NULL AND TRIM(f.ajustador)<>''
      AND LOWER(TRIM(f.ajustador)) NOT IN ('-','n/a','na','sin ajustador','sin asignar','null')))`
  ];
  const params = [...access.params];
  if (id != null) { where.push('f.id_ins_fl=?'); params.push(id); }
  if (cursor != null) { where.push('f.id_ins_fl>?'); params.push(cursor); }
  const [fetched] = await db.query(
    `SELECT f.id_ins_fl,f.proyecto,f.id_proyecto,f.referencia_sitio,f.ajustador,f.estatus,
            f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
            f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_planeado
       FROM ins_fl f
      WHERE ${where.join(' AND ')}
      ORDER BY f.id_ins_fl ASC LIMIT ${id == null ? limit + 1 : 1}`,
    params
  );
  const hasMore = id == null && fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  if (page.length === 0) {
    return {registros:[],total_pagina:0,limite:limit,hay_mas:false,siguiente_cursor:null,resumen_pagina:{}};
  }

  // Catalogo existente y mismo resolvedor de identidad para todas las consultas.
  const index=await catalogoAjustadores();
  const registros=page.map(row=>presentarEquipo(row,index));
  const resumen_pagina={};
  for (const x of registros) resumen_pagina[x.estado]=(resumen_pagina[x.estado] || 0) + 1;
  return {
    registros, total_pagina:registros.length, limite:limit,
    hay_mas:hasMore, siguiente_cursor:hasMore?registros[registros.length-1].id_ins_fl:null,
    resumen_pagina
  };
}

// Incidencias vigentes de equipos 06-A. Recorre por cursor solo equipos
// dentro del alcance, y retorna unicamente las filas que necesitan correccion.
// Se limita el recorrido por consulta para proteger la API frente a cargas grandes.
async function incidenciasFL(req) {
  const query=req.query||{};
  const cursor=enteroOpcional(query.cursor,'cursor');
  const limit=limitePagina(query.limit);
  const access=asignaciones._read.scope(req);
  const index=await catalogoAjustadores();
  const batchSize=150,maxScanned=1500;
  const registros=[],resumen_pagina={};
  let last=cursor||0,scanned=0,hay_mas=false,finished=false;
  while(scanned<maxScanned && !finished && registros.length<limit){
    const size=Math.min(batchSize,maxScanned-scanned);
    const [batch]=await db.query(
      `SELECT f.id_ins_fl,f.proyecto,f.id_proyecto,f.referencia_sitio,f.ajustador,f.estatus,
              f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
              f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_planeado
         FROM ins_fl f
        WHERE f.activo=1 AND TRIM(f.estatus)='06-A' AND (${access.sql})
          AND f.id_ins_fl>?
        ORDER BY f.id_ins_fl ASC LIMIT ${size}`,
      [...access.params,last]);
    if(!batch.length){finished=true;break;}
    for(let i=0;i<batch.length;i++){
      const equipo=presentarEquipo(batch[i],index);
      last=equipo.id_ins_fl;scanned++;
      if(equipo.incidencias.length){
        registros.push(equipo);
        for(const issue of equipo.incidencias)
          resumen_pagina[issue]=(resumen_pagina[issue]||0)+1;
      }
      if(registros.length>=limit){
        hay_mas=i<batch.length-1 || batch.length===size;
        finished=true;break;
      }
    }
    if(!finished && batch.length<size)finished=true;
  }
  if(!finished && scanned>=maxScanned)hay_mas=true;
  return {registros,total_pagina:registros.length,limite:limit,
    hay_mas,siguiente_cursor:hay_mas?last:null,resumen_pagina};
}

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 2]
// Alta automatica SOLO bajo solicitud POST autorizada. La Fase 3 conectara
// la sincronizacion de cambios en ins_fl; la Fase 4 integrara la UI.
// No modifica filas preexistentes, fechas manuales ni el campo ins_fl.ajustador.
const NOTA_AUTO = '[BLT_NOW_INT9_AJUSTADOR_AUTO_V1] Origen: ins_fl.ajustador; fechas heredadas de ins_fl.';

function idEquipoDelBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'id_ins_fl')) {
    throw fallo(400, 'INT9_AUTO_CUERPO_INVALIDO', 'Solo se admite id_ins_fl para la asignación automática.');
  }
  const valor=body.id_ins_fl;
  if (!((typeof valor === 'number' && Number.isSafeInteger(valor)) ||
        (typeof valor === 'string' && /^[1-9]\d*$/.test(valor.trim())))) {
    throw fallo(400, 'INT9_AUTO_EQUIPO_INVALIDO', 'id_ins_fl debe ser un entero positivo.');
  }
  const n = enteroOpcional(valor, 'id_ins_fl');
  if (n == null) throw fallo(400,'INT9_AUTO_EQUIPO_REQUERIDO','Indica id_ins_fl.');
  return n;
}

function actorReal(req) {
  // El Visor no es una identidad autorizada para escrituras.
  if (req.viewerContext?.active === true) {
    throw fallo(403,'INT9_VISOR_SOLO_LECTURA','El Visor de Usuarios es de solo lectura.');
  }
  const n = Number(req.user?.id_SB || req.user?.id || 0);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw fallo(401,'INT9_SESION_INVALIDA','Se requiere sesión real para registrar asignaciones.');
  }
  return n;
}

function equipoSql(access, bloqueo) {
  // El mismo scope central se aplica antes y dentro de la transaccion.
  return `SELECT f.id_ins_fl,f.proyecto,f.id_proyecto,f.referencia_sitio,f.ajustador,
          f.fecha_inicio_ajuste,f.fecha_fin_ajuste_real,
          f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_planeado
     FROM ins_fl f
    WHERE f.id_ins_fl=? AND f.activo=1 AND (${access.sql})
    LIMIT 1${bloqueo ? ' FOR UPDATE' : ''}`;
}

function resumenAuto(candidato, estado, detalle={}) {
  return {
    id_ins_fl:candidato.id_ins_fl, estado, origen:candidato.ajustador_origen,
    inicio:candidato.inicio, fin:candidato.fin, fuente_fin:candidato.fuente_fin,
    creadas:[], existentes:[], conflictos:[], ...detalle
  };
}

async function asignarAutomaticamente(req) {
  const id=idEquipoDelBody(req.body);
  const actorId=actorReal(req);
  const access=asignaciones._read.scope(req);
  return require('./instalaciones-programacion-personal.conciliacion.service')
    .reconciliarEquipo(id,{actorId,access,tecnico:false});
}

module.exports = {
  vinculaciones,incidenciasFL,asignarAutomaticamente,
  _shared:Object.freeze({nombreClave,indicePersonal,resolverReferencia,presentarEquipo,NOTA_AUTO,MAX_AJUSTADORES_CATALOGO,fallo}),
  _test:Object.freeze({nombreClave,indicePersonal,resolverReferencia,enteroOpcional,limitePagina,presentarEquipo,incidenciasEquipo})
};
