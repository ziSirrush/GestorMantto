'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 2 CUSTOMER EXPERIENCE ENCUESTAS V001]

const repository = require('./customer-experience.repository');

const PERMISSIONS_COR = Object.freeze({
  dashboard_acceso_visual: 'CUSTOMER_EXPERIENCE_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  encuestas_acceso_visual: 'CUSTOMER_EXPERIENCE_ENCUESTAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});

const AREAS_COR = new Set(['ambas', 'venta_instalacion', 'mantenimiento']);

function text_cor(value, max = 300) {
  const valueText = value == null ? '' : String(value).trim();
  return valueText ? valueText.slice(0, max) : null;
}

function number_cor(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1_cor(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function average_cor(rows, field) {
  const values = rows.map(row => number_cor(row[field])).filter(value => value !== null);
  if (!values.length) return null;
  return round1_cor(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function distinctSorted_cor(rows, field) {
  return [...new Set(rows.map(row => text_cor(row[field])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function npsClassification_cor(rows, field) {
  const counts = { PROMOTOR: 0, PASIVO: 0, DETRACTOR: 0 };

  rows.forEach(row => {
    const valueText = text_cor(row[field]);
    const number = number_cor(row[field]);
    let classification = null;

    if (valueText && /PROMOTOR/i.test(valueText)) classification = 'PROMOTOR';
    else if (valueText && /PASIVO/i.test(valueText)) classification = 'PASIVO';
    else if (valueText && /DETRACTOR/i.test(valueText)) classification = 'DETRACTOR';
    else if (number !== null) classification = number >= 9 ? 'PROMOTOR' : (number >= 7 ? 'PASIVO' : 'DETRACTOR');

    if (classification) counts[classification] += 1;
  });

  return counts;
}

function filtersVentaInstalacion_cor(query) {
  const source = query || {};
  return {
    tipo_encuesta: text_cor(source.tipo_encuesta, 160),
    vendedor: text_cor(source.vendedor, 160),
    supervisor: text_cor(source.supervisor, 160)
  };
}

function filtersMantenimiento_cor(query) {
  const source = query || {};
  return {
    estado: text_cor(source.estado, 160),
    z_general: text_cor(source.z_general, 160),
    z_operativa: text_cor(source.z_operativa, 160),
    z_administrativa: text_cor(source.z_administrativa, 160),
    superintendente: text_cor(source.superintendente, 160),
    supervisor_operativo: text_cor(source.supervisor_operativo, 160),
    categoria: text_cor(source.categoria, 160),
    prioridad: text_cor(source.prioridad, 160)
  };
}

function ventaInstalacionDashboard_cor(rows) {
  const tipos = distinctSorted_cor(rows, 'tipo_encuesta');
  const vendedores = distinctSorted_cor(rows, 'vendedor');

  const porTipo = tipos.map(tipo => {
    const subset = rows.filter(row => text_cor(row.tipo_encuesta) === tipo);
    return { tipo_encuesta: tipo, total: subset.length, nps_promedio: average_cor(subset, 'nps') };
  }).sort((a, b) => b.total - a.total || String(a.tipo_encuesta).localeCompare(String(b.tipo_encuesta), 'es'));

  const porVendedor = vendedores.map(vendedor => {
    const subset = rows.filter(row => text_cor(row.vendedor) === vendedor);
    return { vendedor, total: subset.length, nps_promedio: average_cor(subset, 'nps') };
  }).sort((a, b) => b.total - a.total || String(a.vendedor).localeCompare(String(b.vendedor), 'es'));

  return {
    total: rows.length,
    nps_promedio: average_cor(rows, 'nps'),
    clasificacion: npsClassification_cor(rows, 'calificacion_nps'),
    por_tipo_encuesta: porTipo,
    por_vendedor: porVendedor.slice(0, 15)
  };
}

function mantenimientoDashboard_cor(rows) {
  const estados = distinctSorted_cor(rows, 'estado');
  const superintendentes = distinctSorted_cor(rows, 'superintendente');

  const porEstado = estados.map(estado => {
    const subset = rows.filter(row => text_cor(row.estado) === estado);
    return { estado, total: subset.length, nps_promedio: average_cor(subset, 'indice_de_recomendacion') };
  }).sort((a, b) => b.total - a.total || String(a.estado).localeCompare(String(b.estado), 'es'));

  const porSuperintendente = superintendentes.map(superintendente => {
    const subset = rows.filter(row => text_cor(row.superintendente) === superintendente);
    return { superintendente, total: subset.length, nps_promedio: average_cor(subset, 'indice_de_recomendacion') };
  }).sort((a, b) => b.total - a.total || String(a.superintendente).localeCompare(String(b.superintendente), 'es'));

  return {
    total: rows.length,
    nps_promedio: average_cor(rows, 'indice_de_recomendacion'),
    clasificacion: npsClassification_cor(rows, 'tipo_de_cliente'),
    indice_confianza: average_cor(rows, 'indice_de_confianza'),
    percepcion_valor: average_cor(rows, 'percepcion_de_valor'),
    indice_riesgo_churn: average_cor(rows, 'indice_de_riesgo_churn'),
    csat: {
      mantenimiento: average_cor(rows, 'csat_mantenimiento'),
      atencion_fallas: average_cor(rows, 'csat_atencion_de_fallas'),
      seguimiento_supervisor: average_cor(rows, 'csat_seguimiento_de_supervisor'),
      cotizaciones: average_cor(rows, 'csat_cotizaciones_suministros_y_reparaci'),
      facturacion: average_cor(rows, 'csat_facturacion'),
      atencion_cliente: average_cor(rows, 'csat_atencion_al_cliente'),
      general: average_cor(rows, 'csat_general')
    },
    por_estado: porEstado.slice(0, 15),
    por_superintendente: porSuperintendente.slice(0, 15)
  };
}

async function options_cor() {
  const [ventaInstalacionRows, mantenimientoRows] = await Promise.all([
    repository.optionsVentaInstalacion_cor(),
    repository.optionsMantenimiento_cor()
  ]);

  return {
    venta_instalacion: {
      tipos_encuesta: distinctSorted_cor(ventaInstalacionRows, 'tipo_encuesta'),
      vendedores: distinctSorted_cor(ventaInstalacionRows, 'vendedor'),
      supervisores: distinctSorted_cor(ventaInstalacionRows, 'supervisor')
    },
    mantenimiento: {
      estados: distinctSorted_cor(mantenimientoRows, 'estado'),
      zonas_generales: distinctSorted_cor(mantenimientoRows, 'z_general'),
      zonas_operativas: distinctSorted_cor(mantenimientoRows, 'z_operativa'),
      zonas_administrativas: distinctSorted_cor(mantenimientoRows, 'z_administrativa'),
      superintendentes: distinctSorted_cor(mantenimientoRows, 'superintendente'),
      supervisores_operativos: distinctSorted_cor(mantenimientoRows, 'supervisor_operativo'),
      categorias: distinctSorted_cor(mantenimientoRows, 'categoria'),
      prioridades: distinctSorted_cor(mantenimientoRows, 'prioridad')
    }
  };
}

async function dashboard_cor(query) {
  const source = query || {};
  const area = (text_cor(source.area, 40) || 'ambas').toLowerCase();

  if (!AREAS_COR.has(area)) {
    const error = new Error('El area solicitada para Dashboard CX no es valida.');
    error.code = 'CX_DASHBOARD_AREA_INVALIDA';
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }

  const filtrosVi = filtersVentaInstalacion_cor(source);
  const filtrosMt = filtersMantenimiento_cor(source);
  const result = { area, criterio: { ...filtrosVi, ...filtrosMt } };
  const tasks = [];

  if (area === 'ambas' || area === 'venta_instalacion') {
    tasks.push(repository.dashboardVentaInstalacion_cor(filtrosVi).then(rows => {
      result.venta_instalacion = ventaInstalacionDashboard_cor(rows);
    }));
  }
  if (area === 'ambas' || area === 'mantenimiento') {
    tasks.push(repository.dashboardMantenimiento_cor(filtrosMt).then(rows => {
      result.mantenimiento = mantenimientoDashboard_cor(rows);
    }));
  }

  await Promise.all(tasks);
  return result;
}

async function listVentaInstalacion_cor(query) {
  const filters = filtersVentaInstalacion_cor(query || {});
  const rows = await repository.listVentaInstalacion_cor(filters);
  return { total: rows.length, encuestas: rows };
}

async function listMantenimiento_cor(query) {
  const filters = filtersMantenimiento_cor(query || {});
  const rows = await repository.listMantenimiento_cor(filters);
  return { total: rows.length, encuestas: rows };
}

const CLOSED_QUESTIONS_COR = Object.freeze([
  { campo:'1_en_una_escala_del_1_al_10_que_tan_prob', etiqueta:'NPS — ¿Qué tan probable es que recomiendes los servicios de BLT?', multi:false },
  { campo:'csat_mantenimiento', etiqueta:'CSAT — Mantenimiento preventivo', multi:false },
  { campo:'csat_atencion_de_fallas', etiqueta:'CSAT — Atención de fallas', multi:false },
  { campo:'csat_seguimiento_de_supervisor', etiqueta:'CSAT — Seguimiento de supervisor', multi:false },
  { campo:'csat_cotizaciones_suministros_y_reparaci', etiqueta:'CSAT — Cotizaciones, suministros y reparaciones', multi:false },
  { campo:'csat_facturacion', etiqueta:'CSAT — Facturación', multi:false },
  { campo:'csat_atencion_al_cliente', etiqueta:'CSAT — Atención al cliente', multi:false },
  { campo:'3_1_mantenimiento_preventivo_oportunidad', etiqueta:'3.1 Mantenimiento preventivo — Oportunidad de mejora', multi:true },
  { campo:'3_2_atencion_de_fallas_oportunidad_de_me', etiqueta:'3.2 Atención de fallas — Oportunidad de mejora', multi:true },
  { campo:'3_3_seguimiento_de_supervisor_oportunida', etiqueta:'3.3 Seguimiento de supervisor — Oportunidad de mejora', multi:true },
  { campo:'3_4_cotizaciones_suministros_y_reparacio', etiqueta:'3.4 Cotizaciones, suministros y reparaciones — Oportunidad de mejora', multi:true },
  { campo:'3_5_facturacion_oportunidad_de_mejora', etiqueta:'3.5 Facturación — Oportunidad de mejora', multi:true },
  { campo:'3_6_atencion_al_cliente_oportunidad_de_m', etiqueta:'3.6 Atención al cliente — Oportunidad de mejora', multi:true },
  { campo:'4_tengo_confianza_en_blt_para_la_operaci', etiqueta:'4. Tengo confianza en BLT para la operación de los equipos', multi:false },
  { campo:'5_el_servicio_recibido_justifica_el_cost', etiqueta:'5. El servicio recibido justifica el costo del mantenimiento', multi:false },
  { campo:'6_pensando_en_el_futuro_que_tan_probable', etiqueta:'6. ¿Qué tan probable sería considerar un cambio de proveedor?', multi:false }
]);

function multiOptions_cor(value) {
  const text = text_cor(value, 2000);
  return text ? String(text).split(',').map(item => item.trim()).filter(Boolean) : [];
}

function closedQuestionAnalysis_cor(definition, rows) {
  const counts = new Map();
  let totalResponses = 0;

  rows.forEach(row => {
    const raw = row[definition.campo];
    if (raw == null || String(raw).trim() === '') return;
    totalResponses += 1;
    const values = definition.multi ? multiOptions_cor(raw) : [text_cor(raw)];
    values.forEach(value => {
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });

  const opciones = [...counts.entries()]
    .map(([valor, cantidad]) => ({
      valor,
      cantidad,
      porcentaje: totalResponses ? Math.round(100 * cantidad / totalResponses) : 0
    }))
    .sort((a, b) => b.cantidad - a.cantidad || String(a.valor).localeCompare(String(b.valor), 'es'));

  return {
    campo: definition.campo,
    etiqueta: definition.etiqueta,
    multi: definition.multi,
    total_respuestas: totalResponses,
    opciones
  };
}

async function closedQuestionsAnalysis_cor(query) {
  const rows = await repository.listMantenimiento_cor(filtersMantenimiento_cor(query || {}));
  return {
    total_encuestas: rows.length,
    preguntas: CLOSED_QUESTIONS_COR.map(definition => closedQuestionAnalysis_cor(definition, rows))
  };
}

function badRequest_cor(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  error.statusCode = 400;
  return error;
}

async function closedQuestionDetail_cor(query) {
  const source = query || {};
  const field = text_cor(source.campo, 160);
  const definition = CLOSED_QUESTIONS_COR.find(item => item.campo === field);
  if (!definition) throw badRequest_cor('CX_ENCUESTAS_CAMPO_INVALIDO', 'Pregunta cerrada no reconocida.');

  const value = text_cor(source.valor, 500);
  if (!value) throw badRequest_cor('CX_ENCUESTAS_VALOR_REQUERIDO', 'Falta el valor a buscar.');

  let rows = await repository.listMantenimiento_cor(filtersMantenimiento_cor(source));
  rows = rows.filter(row => {
    const raw = row[definition.campo];
    if (raw == null) return false;
    return definition.multi ? multiOptions_cor(raw).includes(value) : text_cor(raw, 500) === value;
  });

  return { campo: definition.campo, etiqueta: definition.etiqueta, valor: value, total: rows.length, encuestas: rows };
}

const THEME_FIELDS_COR = Object.freeze([
  { campo:'aspectos_destacables', etiqueta:'Aspectos destacables' },
  { campo:'areas_de_oportunidad', etiqueta:'Áreas de oportunidad' },
  { campo:'temas_operativos', etiqueta:'Temas Operativos' },
  { campo:'temas_administrativos', etiqueta:'Temas Administrativos' },
  { campo:'valor_agregado', etiqueta:'Valor Agregado' }
]);

function normalizeWord_cor(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const STOPWORDS_COR = new Set([
  'para','esto','esta','este','estos','estas','como','pero','mas','con','los','las','del','por','que','una','uno','unos','unas','sus','sin','son','fue','ser','hay','muy','poco','mucho','cuando','donde','tiene','tienen','tener','hace','hacen','entre','desde','sobre','cada','todo','toda','todos','todas','otro','otra','otros','otras','algo','algun','alguna','algunos','algunas','nos','les','etc','tiempo'
].map(normalizeWord_cor));

function themeFieldAnalysis_cor(definition, rows, topN = 15) {
  const counts = new Map();
  let totalComments = 0;

  rows.forEach(row => {
    const raw = row[definition.campo];
    if (raw == null || String(raw).trim() === '') return;
    totalComments += 1;
    const seen = new Set();

    String(raw).split(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ0-9]+/).forEach(original => {
      const normalized = normalizeWord_cor(original);
      if (normalized.length < 5 || STOPWORDS_COR.has(normalized) || /^\d+$/.test(normalized) || seen.has(normalized)) return;
      seen.add(normalized);
      if (!counts.has(normalized)) counts.set(normalized, { original: original.toLowerCase(), ids: new Set() });
      counts.get(normalized).ids.add(String(row.id));
    });
  });

  const palabras = [...counts.values()]
    .map(item => ({
      palabra: item.original,
      menciones: item.ids.size,
      porcentaje: totalComments ? Math.round(100 * item.ids.size / totalComments) : 0
    }))
    .filter(item => item.menciones >= 2)
    .sort((a, b) => b.menciones - a.menciones || String(a.palabra).localeCompare(String(b.palabra), 'es'))
    .slice(0, topN);

  return { campo: definition.campo, etiqueta: definition.etiqueta, total_comentarios: totalComments, palabras };
}

async function themesAnalysis_cor(query) {
  const rows = await repository.listMantenimiento_cor(filtersMantenimiento_cor(query || {}));
  return {
    total_encuestas: rows.length,
    campos: THEME_FIELDS_COR.map(definition => themeFieldAnalysis_cor(definition, rows, 15))
  };
}

async function themeDetail_cor(query) {
  const source = query || {};
  const field = text_cor(source.campo, 160);
  const definition = THEME_FIELDS_COR.find(item => item.campo === field);
  if (!definition) throw badRequest_cor('CX_ENCUESTAS_CAMPO_INVALIDO', 'Campo de tema no reconocido.');

  const originalWord = text_cor(source.palabra, 160);
  const word = normalizeWord_cor(originalWord);
  if (!word) throw badRequest_cor('CX_ENCUESTAS_VALOR_REQUERIDO', 'Falta la palabra a buscar.');

  let rows = await repository.listMantenimiento_cor(filtersMantenimiento_cor(source));
  rows = rows.filter(row => {
    const raw = row[definition.campo];
    if (raw == null) return false;
    return String(raw)
      .split(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ0-9]+/)
      .some(candidate => normalizeWord_cor(candidate) === word);
  });

  return { campo: definition.campo, etiqueta: definition.etiqueta, palabra: originalWord, total: rows.length, encuestas: rows };
}

module.exports = Object.freeze({
  PERMISSIONS_COR,
  options_cor,
  dashboard_cor,
  listVentaInstalacion_cor,
  listMantenimiento_cor,
  closedQuestionsAnalysis_cor,
  closedQuestionDetail_cor,
  themesAnalysis_cor,
  themeDetail_cor
});
