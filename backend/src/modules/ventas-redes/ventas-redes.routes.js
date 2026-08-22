// [Aster | 2026-08-19 | ASTER-MG | FASE 4: Guard General por modulo]
'use strict';

const express = require('express');
const controller = require('./ventas-redes.controller');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { requireStorageSchema, requireStorageSchemaWhenFiles } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const requireVentasIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');

const uploadEvidence = createUploadMiddleware_gnral({
  mode: 'fields',
  fields: [
    { name: 'imagen_1', maxCount: 1 },
    { name: 'imagen_2', maxCount: 1 }
  ],
  maxFiles: 2,
  policyName: 'IMAGE',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const uploadCommentAttachments = createUploadMiddleware_gnral({
  mode: 'array',
  fieldName: 'archivos',
  maxFiles: 4,
  policyName: 'GENERAL',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

function redesGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

router.post('/redes/importar-backup', requireVentasIntegration, controller.syncRecords);
router.post('/redes/comentarios/importar-backup', requireVentasIntegration, controller.syncComments);

router.get('/redes/catalogos', ...redesGuard('VENTAS_ASIGNACION_REDES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), controller.getCatalogs);
router.get('/redes/usuarios-asignables', ...redesGuard('VENTAS_ASIGNACION_REDES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), controller.getAssignableUsers);
router.get('/redes/cotizaciones-activas', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.VER'), controller.getActiveQuotations);

router.get('/redes', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.VER'), controller.list);
router.post(
  '/redes',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.CREAR'),
  uploadEvidence,
  requireStorageSchemaWhenFiles('ventas_redes_archivos'),
  controller.create
);

router.get(
  '/redes/:id/archivos',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.VER'),
  requireStorageSchema('ventas_redes_archivos'),
  controller.listEvidence
);
router.post(
  '/redes/:id/archivos',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.ADJUNTAR_ARCHIVO'),
  uploadEvidence,
  requireStorageSchemaWhenFiles('ventas_redes_archivos'),
  controller.uploadEvidence
);
router.get(
  '/redes/:id/archivos/:idArchivo/acceso',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.VER'),
  requireStorageSchema('ventas_redes_archivos'),
  controller.getEvidenceAccess
);
router.delete(
  '/redes/:id/archivos/:idArchivo',
  ...redesGuard([
    'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_IMAGENES.ADJUNTAR_ARCHIVO',
    'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'
  ]),
  requireStorageSchema('ventas_redes_archivos'),
  controller.deleteEvidence
);

router.get(
  '/redes/:id/comentarios',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.VER'),
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.listComments
);
router.post(
  '/redes/:id/comentarios',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.AGREGAR_COMENTARIO'),
  uploadCommentAttachments,
  requireStorageSchemaWhenFiles('ventas_redes_comentarios_adjuntos'),
  controller.createComment
);
router.patch('/redes/:id/comentarios/:idComentario', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'), controller.updateComment);
router.put('/redes/:id/comentarios/:idComentario', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'), controller.updateComment);
router.delete(
  '/redes/:id/comentarios/:idComentario',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'),
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.deleteComment
);
router.post(
  '/redes/:id/comentarios/:idComentario/adjuntos',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.ADJUNTAR_ARCHIVO'),
  uploadCommentAttachments,
  requireStorageSchemaWhenFiles('ventas_redes_comentarios_adjuntos'),
  controller.addCommentAttachments
);
router.get(
  '/redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto/acceso',
  ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.VER'),
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.getAttachmentAccess
);
router.delete(
  '/redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto',
  ...redesGuard([
    'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_COMENTARIOS.ADJUNTAR_ARCHIVO',
    'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'
  ]),
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.deleteAttachment
);

router.patch('/redes/:id/estatus', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_DETALLE.CAMBIAR_ESTADO'), controller.updateStatus);
router.patch('/redes/:id/asignacion', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.ASIGNAR_RESPONSABLES'), controller.updateAssignment);
router.patch('/redes/:id/cotizacion', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.GESTIONAR_RELACION_COTIZACION'), controller.updateQuotation);
router.get('/redes/:id', ...redesGuard([
  'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_DETALLE.VER',
  'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_LISTADO.ABRIR_DETALLE'
]), controller.getById);
router.put('/redes/:id', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'), controller.update);
router.patch('/redes/:id', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'), controller.update);
router.delete('/redes/:id', ...redesGuard('VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR'), controller.remove);

module.exports = router;
