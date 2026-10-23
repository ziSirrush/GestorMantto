'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
// Permisos nuevos, independientes. Ausencia de registro => denegar.
// No se asignan por rol, ni se heredan de las pantallas de consulta existentes.
const MAIN_VISUAL = 'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const TABLE_PERMISSIONS = Object.freeze({
  gestion_credito: Object.freeze({
    view: 'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO.VER',
    edit: 'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO.EDITAR'
  }),
  pc: Object.freeze({
    view: 'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.VER',
    edit: 'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.EDITAR'
  }),
  detalle_mp_2026: Object.freeze({
    view: 'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER',
    edit: 'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.EDITAR'
  })
});
const ALL_TABLE_PERMISSIONS = Object.freeze(Object.values(TABLE_PERMISSIONS)
  .flatMap(item => [item.view, item.edit]));
module.exports = Object.freeze({MAIN_VISUAL, TABLE_PERMISSIONS, ALL_TABLE_PERMISSIONS});
