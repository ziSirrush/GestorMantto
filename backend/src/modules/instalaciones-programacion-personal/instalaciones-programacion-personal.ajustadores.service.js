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

function presentarEquipo(row, index) {
  const idEquipo = Number(row.id_ins_fl);
  if (!Number.isSafeInteger(idEquipo) || idEquipo < 1) {
    throw fallo(422,'INT9_EQUIPO_ID_FUERA_RANGO','Identificador del equipo no representable sin pérdida.');
  }
  const referencia = resolverReferencia(row.ajustador, index);
  // Misma prioridad de fechas (real, modificada, planeada) que el calendario actual.
  const ventana = asignaciones._read.windowEquipo(TIPO, row);
  const estado = referencia.estado === 'IDENTIFICADO'
    ? (ventana.valida ? 'VINCULABLE' : 'SIN_FECHAS_VALIDAS')
    : referencia.estado;
  return {
    id_ins_fl:idEquipo,
    proyecto:row.proyecto || row.id_proyecto || '',
    referencia_sitio:row.referencia_sitio || '',
    ajustador_origen:String(row.ajustador || '').trim(),
    inicio:ventana.inicio, fin:ventana.fin, fuente_fin:ventana.fuente_fin,
    fechas_validas:ventana.valida,
    estado, cantidad_nombres:referencia.cantidad_nombres,
    // Solo exponer IDs para una referencia completa e inequívoca.
    personas:referencia.estado === 'IDENTIFICADO' ? referencia.personas : []
  };
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
    'f.ajustador IS NOT NULL', "TRIM(f.ajustador)<>''",
    "LOWER(TRIM(f.ajustador)) NOT IN ('-','n/a','na','sin ajustador','sin asignar','null')"
  ];
  const params = [...access.params];
  if (id != null) { where.push('f.id_ins_fl=?'); params.push(id); }
  if (cursor != null) { where.push('f.id_ins_fl>?'); params.push(cursor); }
  const [fetched] = await db.query(
    `SELECT f.id_ins_fl,f.proyecto,f.id_proyecto,f.referencia_sitio,f.ajustador,
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

  // Catalogo de ajustadores existente: no hay nuevas tablas, columnas ni escrituras.
  const [people] = await db.query(
    `SELECT id_personal,nombre FROM instalaciones_personal
      WHERE activo=1 AND tipo_personal=? ORDER BY id_personal ASC
      LIMIT ${MAX_AJUSTADORES_CATALOGO + 1}`, [TIPO]
  );
  if (people.length > MAX_AJUSTADORES_CATALOGO) {
    throw fallo(422,'INT9_CATALOGO_EXCESIVO','Demasiados ajustadores; no es seguro resolver coincidencias.');
  }
  const index=indicePersonal(people);
  const registros=page.map(row=>presentarEquipo(row,index));
  const resumen_pagina={};
  for (const x of registros) resumen_pagina[x.estado]=(resumen_pagina[x.estado] || 0) + 1;
  return {
    registros, total_pagina:registros.length, limite:limit,
    hay_mas:hasMore, siguiente_cursor:hasMore?registros[registros.length-1].id_ins_fl:null,
    resumen_pagina
  };
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
  const idEquipo = idEquipoDelBody(req.body);
  const uid = actorReal(req);
  const access = asignaciones._read.scope(req); // Motor central CORELLIAN, falla cerrado.
  const [equipos] = await db.query(equipoSql(access,false),[idEquipo,...access.params]);
  if (equipos.length !== 1) {
    throw fallo(404,'INT9_EQUIPO_NO_ENCONTRADO','Equipo no encontrado o fuera de alcance.');
  }

  const [people] = await db.query(
    `SELECT id_personal,nombre FROM instalaciones_personal
      WHERE activo=1 AND tipo_personal=? ORDER BY id_personal ASC
      LIMIT ${MAX_AJUSTADORES_CATALOGO+1}`, [TIPO]
  );
  if (people.length > MAX_AJUSTADORES_CATALOGO) {
    throw fallo(422,'INT9_CATALOGO_EXCESIVO','Demasiados ajustadores para resolver identidades de forma segura.');
  }
  const indice = indicePersonal(people);
  const candidato = presentarEquipo(equipos[0],indice);
  if (candidato.estado !== 'VINCULABLE') {
    return resumenAuto(candidato,'REQUIERE_REVISION',{motivo:candidato.estado});
  }

  const seleccion = [...candidato.personas].sort((a,b)=>a.id_personal-b.id_personal);
  const ids = seleccion.map(p=>p.id_personal);
  const connection = await db.getConnection();
  let transaccion = false;
  try {
    await connection.beginTransaction();
    transaccion=true;
    // Mismo orden que las asignaciones manuales: PERSONAS (ordenadas) -> EQUIPO.
    // Serializa altas para evitar reservas concurrentes del mismo ajustador.
    const [lockedPeople] = await connection.query(
      `SELECT p.id_personal,p.nombre FROM instalaciones_personal p
        WHERE p.tipo_personal=? AND p.activo=1
          AND p.id_personal IN (${ids.map(()=>'?').join(',')})
        ORDER BY p.id_personal FOR UPDATE`, [TIPO,...ids]
    );
    if (lockedPeople.length !== ids.length || lockedPeople.some((p,i)=>
        Number(p.id_personal)!==ids[i] || nombreClave(p.nombre)!==nombreClave(seleccion[i].nombre))) {
      throw fallo(409,'INT9_AUTO_IDENTIDAD_CAMBIO','Cambió el catálogo de ajustadores. Revisa la vinculación.');
    }
    const [lockedEquipos] = await connection.query(equipoSql(access,true),[idEquipo,...access.params]);
    if (lockedEquipos.length !== 1) {
      throw fallo(409,'INT9_AUTO_ALCANCE_CAMBIO','Equipo no disponible o fuera de alcance durante el guardado.');
    }
    const actual = presentarEquipo(lockedEquipos[0],indice);
    const mismosIds = actual.personas.map(p=>p.id_personal).sort((a,b)=>a-b);
    if (actual.estado!=='VINCULABLE' || actual.ajustador_origen!==candidato.ajustador_origen ||
        actual.inicio!==candidato.inicio || actual.fin!==candidato.fin ||
        actual.fuente_fin!==candidato.fuente_fin ||
        mismosIds.length!==ids.length || mismosIds.some((n,i)=>n!==ids[i])) {
      throw fallo(409,'INT9_AUTO_INS_FL_CAMBIO','Cambió ins_fl mientras se preparaba la asignación. Reintenta la vinculación.');
    }

    // Consulta incluso las ocupaciones de equipos FUERA del alcance sin exponer
    // identidad de esos equipos. Se usa el servicio compartido para las fechas.
    const ocupaciones = await asignaciones._read.fetchAssignmentRows(connection,TIPO,ids,req);
    const existentes=[];
    const pendientes=[];
    const conflictos=[];
    for (const persona of seleccion) {
      const prev = ocupaciones.filter(a=>a.id_personal===persona.id_personal);
      if (prev.some(a=>a.id_ins_fl===idEquipo)) {
        existentes.push({id_personal:persona.id_personal,nombre:persona.nombre});
        continue; // Asignacion manual o automatica preexistente: no tocar.
      }
      const otras = prev.filter(a=>a.id_ins_fl!==idEquipo);
      const inciertas = otras.some(a=>!a.valida);
      const solapadas = otras.some(a=>a.valida &&
        asignaciones._read.intersect(a.inicio,a.fin,actual.inicio,actual.fin));
      if (inciertas || solapadas) {
        conflictos.push({id_personal:persona.id_personal,nombre:persona.nombre,
          motivo:inciertas?'OTRA_ASIGNACION_SIN_FECHAS':'TRASLAPE'});
      } else {
        pendientes.push(persona);
      }
    }
    if (conflictos.length) {
      // Por equipo es TODO O NADA: no generar un grupo parcialmente asignado.
      await connection.rollback();transaccion=false;
      return resumenAuto(actual,'CONFLICTO',{existentes,conflictos});
    }

    const creadas=[];
    for (const persona of pendientes) {
      // NULL deja las fechas ligadas a ins_fl, en vez de copiar valores fijos.
      const [insert] = await connection.execute(
        `INSERT INTO instalaciones_programacion_asignaciones
         (id_personal,id_ins_fl,fecha_desde,fecha_hasta,notas,activo,created_by,updated_by)
         VALUES(?,?,NULL,NULL,?,1,?,?)`,
        [persona.id_personal,idEquipo,NOTA_AUTO,uid,uid]
      );
      const idAsignacion = Number(insert.insertId);
      if (!Number.isSafeInteger(idAsignacion) || idAsignacion < 1) {
        throw fallo(422,'INT9_AUTO_ASIGNACION_ID_INVALIDO','No se obtuvo un identificador seguro de asignación.');
      }
      creadas.push({id_asignacion:idAsignacion,id_personal:persona.id_personal,nombre:persona.nombre});
    }
    await connection.commit();transaccion=false;
    return resumenAuto(actual,creadas.length?'ASIGNADO':'SIN_CAMBIOS',{creadas,existentes});
  } catch (error) {
    if (transaccion) await connection.rollback().catch(()=>{});
    if (error?.code==='ER_DUP_ENTRY') {
      throw fallo(409,'INT9_AUTO_ASIGNACION_DUPLICADA','Ya existe una asignación para este ajustador y equipo.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  vinculaciones, asignarAutomaticamente,
  _shared:Object.freeze({nombreClave,indicePersonal,resolverReferencia,presentarEquipo,NOTA_AUTO,MAX_AJUSTADORES_CATALOGO,fallo}),
  _test:Object.freeze({nombreClave,indicePersonal,resolverReferencia,enteroOpcional,limitePagina,presentarEquipo})
};
