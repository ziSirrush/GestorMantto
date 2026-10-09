'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_1_INSTALACIONES_ADMINISTRACION_BACKEND_V001]
// [Aster | 2026-10-08 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_AUDITORIA_V001]
// [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
// Contrato funcional de grupos para administrar ins_fl desde Mantto Gestor.

const GROUPS_COR = Object.freeze({
  proyecto: Object.freeze({
    label: 'Proyecto e identificacion',
    permission_segment: 'PROYECTO',
    fields: Object.freeze([
      'proyecto', 'id_proyecto', 'referencia_sitio', 'nomenclatura',
      'categoria', 'estatus', 'estatus_completo', 'activo'
    ])
  }),
  seguimiento: Object.freeze({
    label: 'Seguimiento operativo',
    permission_segment: 'SEGUIMIENTO',
    fields: Object.freeze([
      'fecha_visita', 'comentarios_fl', 'avance_oc', 'avance_mo', 'avance_aj',
      'dias_sin_visita', 'dias_sin_ccnr'
    ])
  }),
  cliente_contrato: Object.freeze({
    label: 'Cliente y contrato',
    permission_segment: 'CLIENTE_CONTRATO',
    fields: Object.freeze([
      'cliente', 'cliente_ns', 'vendedor', 'numero_contrato', 'carpeta_fisica',
      'recepcion_carpeta', 'ov_ns', 'ph_ns'
    ])
  }),
  ubicacion_contacto: Object.freeze({
    label: 'Ubicacion y contacto',
    permission_segment: 'UBICACION_CONTACTO',
    fields: Object.freeze([
      'estado', 'estado_localizacion', 'ciudad', 'direccion_proyecto',
      'contacto_cliente_sitio'
    ])
  }),
  equipo: Object.freeze({
    label: 'Datos del equipo',
    permission_segment: 'EQUIPO',
    fields: Object.freeze([
      'tipo_equipo', 'numero_equipo_fabrica', 'marca', 'modelo', 'numero_pisos',
      'numero_desembarques', 'numero_puertas', 'velocidad_ms', 'capacidad_kg',
      'entrepiso_mm', 'longitud_mm', 'ancho_peldano_mm', 'funcionamiento',
      'equipos_mojados'
    ])
  }),
  produccion_logistica: Object.freeze({
    label: 'Produccion y logistica',
    permission_segment: 'PRODUCCION_LOGISTICA',
    fields: Object.freeze([
      'estatus_produccion', 'fecha_descarga', 'fecha_colocacion_esc_ramp',
      'fecha_cpvp', 'fecha_posible_recepcion_cubo', 'fecha_ccnr', 'fecha_ccr',
      'condiciones_obra'
    ])
  }),
  montaje: Object.freeze({
    label: 'Montaje / instalacion',
    permission_segment: 'MONTAJE',
    fields: Object.freeze([
      'subcontratista', 'semanas_instalacion', 'fecha_inicio_montaje',
      'fecha_fin_montaje_planeado', 'fecha_fin_montaje_modificado',
      'fecha_fin_montaje_real', 'dias_restantes', 'fecha_cti',
      'fecha_revision_supervisor', 'evaluacion_subcontrato', 'minuta_interfon'
    ])
  }),
  ajuste_calidad: Object.freeze({
    label: 'Ajuste y calidad',
    permission_segment: 'AJUSTE_CALIDAD',
    fields: Object.freeze([
      'fecha_posible_inicio_ajuste', 'fecha_minuta_revision_ajuste',
      'fecha_liberacion_ajuste', 'ajustador', 'fecha_inicio_ajuste',
      'fecha_fin_ajuste_planeado', 'fecha_fin_ajuste_modificado',
      'fecha_fin_ajuste_real', 'fecha_reporte_ajuste',
      'fecha_protocolo_aceptacion', 'estatus_inspeccion_calidad',
      'pendientes_calidad', 'certificado_regulador'
    ])
  }),
  entrega_garantia_mantenimiento: Object.freeze({
    label: 'Entrega, garantia y mantenimiento',
    permission_segment: 'ENTREGA_GARANTIA_MANTENIMIENTO',
    fields: Object.freeze([
      'proyeccion_entrega', 'fecha_entrega_cliente', 'formato_caf_pg',
      'estatus_equipo_entrega', 'anio_termino', 'meses_mantenimiento_gratuito',
      'meses_garantia_actas', 'meses_garantia_sitio',
      'meses_garantia_restantes', 'codigo_mantenimiento'
    ])
  }),
  costos: Object.freeze({
    label: 'Costos',
    permission_segment: 'COSTOS',
    fields: Object.freeze([
      'presupuesto_mantenimiento_cem', 'costo_mensual_mantenimiento_cem'
    ])
  }),
  responsables: Object.freeze({
    label: 'Responsables',
    permission_segment: 'RESPONSABLES',
    fields: Object.freeze([
      'supervisor_fl', 'supervisor_nombre', 'correo_supervisor', 'sup_1',
      'id_sup', 'id_asesor', 'id_admin'
    ])
  })
});

const SYSTEM_READONLY_FIELDS_COR = Object.freeze([
  'id_ins_fl', 'created_at', 'updated_at'
]);

// Regla aprobada: 93 campos operativos editables en ficha individual.
// Se conservan las validaciones de tipo, tamano, FK y unicidad en MySQL.
// Los identificadores tecnicos permanecen protegidos.
const POLICY_PENDING_FIELDS_COR = Object.freeze([]);
const DERIVED_POLICY_PENDING_FIELDS_COR = Object.freeze([]);

const RESPONSIBLE_ID_FIELDS_COR = Object.freeze([
  'id_sup', 'id_asesor', 'id_admin'
]);

const ALL_OPERATIONAL_FIELDS_COR = Object.freeze(
  Object.values(GROUPS_COR).flatMap(group => group.fields)
);

const ACCESS_PERMISSION_COR =
  'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

// EDITAR es un permiso explicito adicional: acceso visual NO concede escritura.
// Sin rol hardcodeado y sin llaves maestras implicitas. Debe asignarse desde
// Panel de Control una vez registrado el codigo en perm_subelemento_acciones.
const FULL_EDIT_PERMISSION_COR =
  'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR';

// Conservar la visibilidad historica de usuarios SIN EDITAR global.
// Los permisos antiguos no conceden escritura, pero si la lectura autorizada
// por grupo que existia antes de esta migracion (no ampliar lectura por error).
const LEGACY_GROUP_PERMISSIONS_COR = Object.freeze(
  Object.fromEntries(Object.entries(GROUPS_COR).map(([key, group]) => {
    const base = `INSTALACIONES_ADMINISTRACION_GRUPOS_${group.permission_segment}`;
    return [key, Object.freeze({view: `${base}.VER`, edit: `${base}.EDITAR`})];
  }))
);

// La escritura requiere el mismo permiso total en las 11 secciones.
const GROUP_PERMISSIONS_COR = Object.freeze(
  Object.fromEntries(
    Object.keys(GROUPS_COR).map(key => [key, Object.freeze({
      view: ACCESS_PERMISSION_COR,
      edit: FULL_EDIT_PERMISSION_COR
    })])
  )
);

function groupPermission_cor(groupKey) {
  return GROUP_PERMISSIONS_COR[groupKey] || null;
}

module.exports = {
  GROUPS_COR,
  SYSTEM_READONLY_FIELDS_COR,
  POLICY_PENDING_FIELDS_COR,
  DERIVED_POLICY_PENDING_FIELDS_COR,
  RESPONSIBLE_ID_FIELDS_COR,
  ALL_OPERATIONAL_FIELDS_COR,
  ACCESS_PERMISSION_COR,
  FULL_EDIT_PERMISSION_COR,
  LEGACY_GROUP_PERMISSIONS_COR,
  GROUP_PERMISSIONS_COR,
  groupPermission_cor
};
