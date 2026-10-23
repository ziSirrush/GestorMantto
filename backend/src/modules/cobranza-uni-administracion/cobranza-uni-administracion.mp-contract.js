'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_1_V001]
// Contrato PURO de MP. No conecta Aiven, no consulta datos, no habilita escrituras.
// Fuentes: CREATE historico de detalle_mp_2026 + ALTER confirmado por usuario,
// CREATE detalle_mp_2026_zona_1 confirmado por metadatos, headers/formulas Sheets.
// No se infieren formulas de la Zona 1 que el usuario no haya proporcionado.

const freezeRows = (rows) => Object.freeze(rows.map(item => Object.freeze(item)));

// Orden real: DDL historico + factor_monto_anual agregado AFTER iguala.
// id_dmp es AUTO_INCREMENT; a diferencia de id_pc, no se pide al usuario asignarlo.
const MP_SQL_SPEC_UNI = freezeRows([
  ['id_dmp', 'bigint', false],
  ['zona_adm', 'varchar(100)', true],
  ['proyecto', 'varchar(255)', true],
  ['id_proyecto_cobranza', 'bigint unsigned', true],
  ['idns', 'varchar(100)', true],
  ['cliente', 'varchar(255)', true],
  ['periodicidad', 'varchar(100)', true],
  ['momento_facturacion', 'varchar(150)', true],
  ['estado', 'varchar(150)', true],
  ['z_oper', 'varchar(100)', true],
  ['forma_pago', 'varchar(150)', true],
  ['iguala', 'decimal(18,2)', true],
  ['factor_monto_anual', 'smallint unsigned', true],
  ['condiciones_pago', 'varchar(150)', true],
  ['monto_anual', 'decimal(18,2)', true],
  ['pendiente_corriente', 'decimal(18,2)', true],
  ['pendiente_vencido', 'decimal(18,2)', true],
  ['pendiente', 'decimal(18,2)', true],
  ['facturas_pendientes', 'int', true],
  ['estatus_cartera', 'varchar(150)', true]
]);

// A:R en la hoja principal; la FK y el factor adicional NO vienen de Sheets.
const MP_SHEET_HEADERS_UNI = freezeRows([
  ['A', 'Consecutivo', 'id_dmp'],
  ['B', 'ZONA ADM', 'zona_adm'],
  ['C', 'PROYECTO', 'proyecto'],
  ['D', 'ID', 'idns'],
  ['E', 'CLIENTE', 'cliente'],
  ['F', 'PERIODICIDAD', 'periodicidad'],
  ['G', 'MOMENTO DE FACTURACI\u00d3N', 'momento_facturacion'],
  ['H', 'Estado', 'estado'],
  ['I', 'Z.Oper', 'z_oper'],
  ['J', 'FORMA DE PAGO', 'forma_pago'],
  ['K', 'IGUALA', 'iguala'],
  ['L', 'CONDICIONES DE PAGO', 'condiciones_pago'],
  ['M', 'MONTO ANUAL', 'monto_anual'],
  ['N', '$ PENDIENTE CORRIENTE', 'pendiente_corriente'],
  ['O', '$ PENDIENTE VENCIDO', 'pendiente_vencido'],
  ['P', '$ PENDIENTE', 'pendiente'],
  ['Q', 'N\u00b0 DE FACTURAS PENDIENTES', 'facturas_pendientes'],
  ['R', 'Activo', 'estatus_cartera']
]);

const MP_FOREIGN_KEY_UNI = Object.freeze({
  name: 'fk_dmp_cobranza_proyecto',
  field: 'id_proyecto_cobranza',
  referencesTable: 'cobranza_proyectos',
  referencesField: 'id_proyecto_cobranza',
  onDelete: 'RESTRICT', onUpdate: 'CASCADE'
});

// Fuente Sheets: B:P en DETALLE MP 2026 ZONA 1. B es PROYECTO;
// indice 9 apunta a J (IGUALA), 10 a K, 12-15 a M-P.
// En runtime solo se admite identidad validada + JOIN por id_dmp,
// NUNCA un BUSCARV textual como frontera de autorizacion.
const MP_LOOKUP_SHEET_UNI = Object.freeze({
  sourceSheet: 'DETALLE MP 2026 ZONA 1',
  sourceTable: 'detalle_mp_2026_zona_1',
  originalRange: 'B:P',
  originalKey: 'PROYECTO',
  runtimeJoinKey: 'id_dmp',
  rejectAmbiguous: true,
  rules: freezeRows([
    {target:'iguala',             sheetColumn:'K', sourceIndex:9,  sourceColumn:'iguala',             formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,9,0)"},
    {target:'condiciones_pago',   sheetColumn:'L', sourceIndex:10, sourceColumn:'condiciones_pago',   formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,10,0)"},
    {target:'pendiente_corriente',sheetColumn:'N', sourceIndex:12, sourceColumn:'pendiente_corriente',formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,12,0)"},
    {target:'pendiente_vencido', sheetColumn:'O', sourceIndex:13, sourceColumn:'pendiente_vencido',  formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,13,0)"},
    {target:'pendiente',         sheetColumn:'P', sourceIndex:14, sourceColumn:'pendiente',          formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,14,0)"},
    {target:'facturas_pendientes',sheetColumn:'Q',sourceIndex:15, sourceColumn:'facturas_pendientes',formula:"=BUSCARV($C5,'DETALLE MP 2026 ZONA 1'!$B:$P,15,0)"}
  ])
});

// Nueva regla acordada: factor capturable; NULL = preservar monto almacenado.
// F1 solo documenta la dependencia; no recalcula ni sobrescribe valores.
const MP_FORMULAS_UNI = Object.freeze({
  monto_anual: Object.freeze({
    sheetColumn: 'M',
    historicalFormula: '=K5*6',
    expression: 'iguala * factor_monto_anual',
    dependencies: Object.freeze(['iguala', 'factor_monto_anual']),
    nullFactorPolicy: 'preserve_stored_value',
    enabledForWrite: false
  })
});

const MP_PROTECTED_FIELDS_UNI = Object.freeze(['id_dmp','id_proyecto_cobranza']);
const MP_DERIVED_DEPENDENCIES_UNI = Object.freeze({
  iguala: Object.freeze(['id_dmp']),
  condiciones_pago: Object.freeze(['id_dmp']),
  monto_anual: Object.freeze(['iguala','factor_monto_anual']),
  pendiente_corriente: Object.freeze(['id_dmp']),
  pendiente_vencido: Object.freeze(['id_dmp']),
  pendiente: Object.freeze(['id_dmp']),
  facturas_pendientes: Object.freeze(['id_dmp'])
});
const MP_DERIVED_FIELDS_UNI = Object.freeze(Object.keys(MP_DERIVED_DEPENDENCIES_UNI));
const protectedSet = new Set(MP_PROTECTED_FIELDS_UNI);
const derivedSet = new Set(MP_DERIVED_FIELDS_UNI);
const sheetByField = new Map(MP_SHEET_HEADERS_UNI.map(([letter, header, name]) =>
  [name, Object.freeze({letter, header})]));
const lookupByField = new Map(MP_LOOKUP_SHEET_UNI.rules.map(rule => [rule.target, rule]));

const MP_COLUMNS_UNI = Object.freeze(MP_SQL_SPEC_UNI.map(([name,sqlType,nullable]) => {
  const kind = protectedSet.has(name) ? 'protected' : (derivedSet.has(name) ? 'derived' : 'editable');
  const source = sheetByField.get(name) || null;
  const lookup = lookupByField.get(name) || null;
  return Object.freeze({
    name, sqlType, nullable, kind, editable:kind === 'editable',
    sheetColumn:source?.letter || null,
    sheetHeader:source?.header || null,
    derivesFrom:lookup ? 'detalle_mp_2026_zona_1.'+lookup.sourceColumn :
      (name === 'monto_anual' ? MP_FORMULAS_UNI.monto_anual.expression : null)
  });
}));
const MP_EDITABLE_FIELDS_UNI = Object.freeze(MP_COLUMNS_UNI.filter(c=>c.editable).map(c=>c.name));

// Estructura de la nueva tabla aprobada y creada por el usuario: 128 columnas.
// La columna 'ID' de Zona 1 es idns, NO es el id_dmp del registro principal.
const MP_ZONE1_BASE_UNI = freezeRows([
  ['zona_adm',           'varchar(100)', 'ZONA ADM'],
  ['proyecto',           'varchar(255)', 'PROYECTO'],
  ['idns',               'varchar(100)', 'ID'],
  ['cliente',            'varchar(255)', 'CLIENTE'],
  ['periodicidad',       'varchar(100)', 'PERIODICIDAD'],
  ['momento_facturacion','varchar(150)', 'MOMENTO DE FACTURACI\u00d3N'],
  ['estado',             'varchar(150)', 'Estado'],
  ['z_oper',             'varchar(100)', 'Z.Oper'],
  ['forma_pago',         'varchar(150)', 'FORMA DE PAGO'],
  ['iguala',             'decimal(18,2)', 'IGUALA'],
  ['condiciones_pago',   'varchar(150)', 'CONDICIONES DE PAGO'],
  ['monto_anual',        'decimal(18,2)', 'MONTO ANUAL'],
  ['pendiente_corriente','decimal(18,2)', '$ PENDIENTE CORRIENTE'],
  ['pendiente_vencido',  'decimal(18,2)', '$ PENDIENTE VENCIDO'],
  ['pendiente',          'decimal(18,2)', '$ PENDIENTE'],
  ['facturas_pendientes','int',           'N\u00b0 DE FACTURAS PENDIENTES']
]);

const MP_ZONE1_BLOCK_BASE_UNI = freezeRows([
  ['facturacion',       'varchar(150)', 'FACTURACI\u00d3N'],
  ['fecha_pago',        'date',         'FECHA DE PAGO'],
  ['estatus_factura',   'varchar(150)', 'ESTATUS FACTURA'],
  ['fecha_factura',     'date',         'FECHA FACTURA'],
  ['numero_factura',    'varchar(150)', 'NO. FACTURA'],
  ['vencimiento',       'date',         'VENCIMIENTO'],
  ['dias_vencimiento',  'int',          'DIAS DE VENCIMIENTO'],
  ['estatus',           'varchar(150)', 'ESTATUS'],
  ['forma_pago',        'varchar(150)', 'FORMA DE PAGO']
]);
const MP_ZONE1_INVOICE_BLOCKS_UNI = 12;
function invoiceHeader(block, field, defaultHeader) {
  if (block === 1 && field === 'forma_pago') return 'FOMA DE PAGO'; // typo en origen
  if (block === 4 && field === 'estatus_factura') return 'ESTATUS DE FACTURA';
  if (block >= 7 && field === 'fecha_factura') return 'FECHA DE FACTURA';
  return defaultHeader;
}
function excelColumn(index) {
  let n = index;
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(65 + n % 26) + out; n = Math.floor(n/26); }
  return out;
}
const MP_ZONE1_SHEET_HEADERS_UNI = Object.freeze([
  ...MP_ZONE1_BASE_UNI.map(([name, , header]) => Object.freeze([name, header])),
  ...Array.from({length:MP_ZONE1_INVOICE_BLOCKS_UNI}, (_,i) => {
    const block = i + 1, suffix = String(block).padStart(2,'0');
    return MP_ZONE1_BLOCK_BASE_UNI.map(([name,,header]) =>
      Object.freeze([name+'_'+suffix, invoiceHeader(block,name,header)]));
  }).flat()
].map(([name,header],i) => Object.freeze({sheetIndex:i+1,sheetColumn:excelColumn(i+1),sheetHeader:header,name})));

const MP_ZONE1_SQL_SPEC_UNI = freezeRows([
  ['id_mp_zona_1','bigint unsigned',false],
  ['id_dmp','bigint',true],
  ...MP_ZONE1_BASE_UNI.map(([name,type])=>[name,type,true]),
  ...Array.from({length:MP_ZONE1_INVOICE_BLOCKS_UNI},(_,i)=>
    MP_ZONE1_BLOCK_BASE_UNI.map(([name,type])=>[name+'_'+String(i+1).padStart(2,'0'),type,true])).flat(),
  ['created_at','timestamp',false],
  ['updated_at','timestamp',false]
]);

const MP_ZONE1_PROTECTED_FIELDS_UNI = Object.freeze(['id_mp_zona_1','id_dmp','created_at','updated_at']);
const zoneProtected = new Set(MP_ZONE1_PROTECTED_FIELDS_UNI);
const zoneHeaders = new Map(MP_ZONE1_SHEET_HEADERS_UNI.map(h => [h.name,h]));
const MP_ZONE1_COLUMNS_UNI = Object.freeze(MP_ZONE1_SQL_SPEC_UNI.map(([name,sqlType,nullable])=>{
  const source=zoneHeaders.get(name)||null;
  return Object.freeze({
    name,sqlType,nullable,
    kind:zoneProtected.has(name)?'protected':'source_pending_rules',
    editable:false, // No hay formulas/reglas de los 12 bloques aprobadas.
    sheetColumn:source?.sheetColumn||null,
    sheetHeader:source?.sheetHeader||null
  });
}));

const MP_ZONE1_FOREIGN_KEY_UNI = Object.freeze({
  name:'fk_mp_zona1_detalle_mp', field:'id_dmp',
  referencesTable:'detalle_mp_2026', referencesField:'id_dmp',
  onDelete:'RESTRICT',onUpdate:'CASCADE',unique:true,nullable:true
});
const MP_ZONE1_META_UNI = Object.freeze({
  table:'detalle_mp_2026_zona_1', primaryKey:'id_mp_zona_1',
  invoiceBlocks:MP_ZONE1_INVOICE_BLOCKS_UNI, fieldsPerBlock:9,
  generalFields:16, sheetColumns:124, totalColumns:128,
  relation:'zero_or_one_zone1_row_per_mp_record',
  requiresVerifiedIdDmp:true, writesEnabled:false
});
const MP_RULES_UNI = Object.freeze({
  statusField:'estatus_cartera',
  statusValues:Object.freeze(['Activo','Inactivo']),
  statusNullPolicy:'no_automatic_conversion',
  annualFactorField:'factor_monto_anual',
  annualAmountNullFactor:'preserve_stored_value',
  identityJoin:'id_dmp_verified',
  denyUnmatchedZone1:true,
  independentPermissionView:'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER',
  independentPermissionEdit:'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.EDITAR',
  timeZone:'America/Mexico_City',
  writesEnabled:false,
  zone1WritesEnabled:false,
  gasSyncRemainsActive:true,
  gasCutoverPolicy:'after_GC_VA_MP_reconciled_and_explicit_approval'
});

module.exports = Object.freeze({
  MP_SQL_SPEC_UNI, MP_SHEET_HEADERS_UNI, MP_COLUMNS_UNI,
  MP_FOREIGN_KEY_UNI, MP_PROTECTED_FIELDS_UNI,
  MP_DERIVED_DEPENDENCIES_UNI, MP_DERIVED_FIELDS_UNI,
  MP_EDITABLE_FIELDS_UNI, MP_LOOKUP_SHEET_UNI, MP_FORMULAS_UNI,
  MP_ZONE1_BASE_UNI, MP_ZONE1_BLOCK_BASE_UNI,
  MP_ZONE1_INVOICE_BLOCKS_UNI, MP_ZONE1_SHEET_HEADERS_UNI,
  MP_ZONE1_SQL_SPEC_UNI, MP_ZONE1_COLUMNS_UNI,
  MP_ZONE1_PROTECTED_FIELDS_UNI, MP_ZONE1_FOREIGN_KEY_UNI,
  MP_ZONE1_META_UNI, MP_RULES_UNI
});
