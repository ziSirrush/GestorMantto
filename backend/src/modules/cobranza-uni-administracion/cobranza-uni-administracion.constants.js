'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_MP_FASE_1_V001]
// Contratos de estructura: no ejecutan consultas, no autorizan permisos y no escriben BD.
// GC y pc conservan sus contratos existentes; MP incluye tabla base y Zona 1.
const PC_CONTRACT_UNI = require('./cobranza-uni-administracion.pc-contract');
const MP_CONTRACT_UNI = require('./cobranza-uni-administracion.mp-contract');

const TABLES_UNI = Object.freeze({
  gestion_credito: Object.freeze({
    label: 'Gesti\u00f3n de Cr\u00e9dito',
    primaryKey: 'id_gc',
    schemaReady: true
  }),
  pc: Object.freeze({
    label: 'Venta Adicional',
    primaryKey: 'id_pc',
    schemaReady: true
  }),
  detalle_mp_2026: Object.freeze({
    label: 'Mantenimiento Preventivo',
    primaryKey: 'id_dmp',
    schemaReady: true
  })
});

const GC_PROTECTED_FIELDS_UNI = Object.freeze([
  'id_gc', 'id_proyecto_cobranza'
]);

// Contrato de dependencias: el motor backend F5 recalcula derivados alcanzables
// al modificar un origen. El frontend nunca sera autoridad de calculo.
const GC_DERIVED_DEPENDENCIES_UNI = Object.freeze({
  adeudo: Object.freeze(['montp_mp', 'monto_va']),
  facts_adeudadas: Object.freeze(['facturas_mp', 'facturas_va']),
  suministro: Object.freeze(['adeudo', 'credito_para_va']),
  nivel_riesgo_credito: Object.freeze(['facts_adeudadas']),
  credito_para_va: Object.freeze(['categoria', 'recuento_no_equipos']),
  credito_disponible_venta: Object.freeze(['credito_para_va', 'adeudo']),
  anticipo: Object.freeze(['nivel_riesgo_credito'])
});

// Orden y tipos extraidos del DDL de gestion_credito, incluyendo la FK adicional
// que no estaba en los 28 encabezados de la hoja origen.
// Especificacion [nombre, tipo SQL, nullable].
const GC_SQL_SPEC_UNI = [
  ['id_gc', 'bigint', false],
  ['idns', 'varchar(100)', true],
  ['proyecto', 'varchar(255)', true],
  ['id_proyecto_cobranza', 'bigint unsigned', true],
  ['cliente', 'varchar(255)', true],
  ['subsidiaria', 'varchar(255)', true],
  ['region', 'varchar(150)', true],
  ['estado', 'varchar(150)', true],
  ['z_oper', 'varchar(150)', true],
  ['z_adm', 'varchar(150)', true],
  ['categoria', 'varchar(150)', true],
  ['prioridad', 'varchar(100)', true],
  ['suma_valor_unitario', 'decimal(18,2)', true],
  ['recuento_no_equipos', 'int', true],
  ['mp_2025', 'int', true],
  ['monto_mp_2025', 'decimal(18,2)', true],
  ['mp_2026', 'int', true],
  ['monto_mp_2026', 'decimal(18,2)', true],
  ['facturas_mp', 'int', true],
  ['montp_mp', 'decimal(18,2)', true],
  ['facturas_va', 'int', true],
  ['monto_va', 'decimal(18,2)', true],
  ['adeudo', 'decimal(18,2)', true],
  ['facts_adeudadas', 'int', true],
  ['suministro', 'varchar(100)', true],
  ['nivel_riesgo_credito', 'varchar(100)', true],
  ['credito_para_va', 'decimal(18,2)', true],
  ['credito_disponible_venta', 'decimal(18,2)', true],
  ['anticipo', 'varchar(50)', true]
];

const protectedSetUni = new Set(GC_PROTECTED_FIELDS_UNI);
const derivedSetUni = new Set(Object.keys(GC_DERIVED_DEPENDENCIES_UNI));

const GC_COLUMNS_UNI = Object.freeze(GC_SQL_SPEC_UNI.map(([name, sqlType, nullable]) => {
  const kind = protectedSetUni.has(name)
    ? 'protected'
    : derivedSetUni.has(name) ? 'derived' : 'editable';
  return Object.freeze({
    name,
    sqlType,
    nullable,
    kind,
    editable: kind === 'editable'
  });
}));

const GC_EDITABLE_FIELDS_UNI = Object.freeze(
  GC_COLUMNS_UNI.filter(column => column.editable).map(column => column.name)
);

const GC_DERIVED_FIELDS_UNI = Object.freeze(Object.keys(GC_DERIVED_DEPENDENCIES_UNI));

function getTableContract_uni(tableName) {
  if (!Object.prototype.hasOwnProperty.call(TABLES_UNI, tableName)) return null;
  if (tableName === 'pc') {
    return Object.freeze({
      table: tableName,
      ...TABLES_UNI[tableName],
      columns: PC_CONTRACT_UNI.PC_COLUMNS_UNI
    });
  }
  if (tableName === 'detalle_mp_2026') {
    return Object.freeze({
      table: tableName,
      ...TABLES_UNI[tableName],
      columns: MP_CONTRACT_UNI.MP_COLUMNS_UNI
    });
  }
  return Object.freeze({
    table: tableName,
    ...TABLES_UNI[tableName],
    columns: GC_COLUMNS_UNI
  });
}

module.exports = Object.freeze({
  TABLES_UNI,
  GC_COLUMNS_UNI,
  GC_EDITABLE_FIELDS_UNI,
  GC_PROTECTED_FIELDS_UNI,
  GC_DERIVED_FIELDS_UNI,
  GC_DERIVED_DEPENDENCIES_UNI,
  ...PC_CONTRACT_UNI,
  ...MP_CONTRACT_UNI,
  getTableContract_uni
});
