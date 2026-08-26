'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const notifications = read('backend/src/services/notifications/ventas-notification.service.js');
const cotizaciones = read('backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js');
const prospeccion = read('backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js');
const redes = read('backend/src/modules/ventas-redes/ventas-redes.controller.js');
const sql = read('backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_3_VENTAS.sql');

const eventCodes = [
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
];

test('Fase 3 usa exactamente los seis eventos oficiales de Ventas', () => {
  for (const code of eventCodes) assert.match(notifications, new RegExp(code.replaceAll('.', '\\.')));
  assert.doesNotMatch(notifications, /codigoEvento\s*:\s*['"]COMENTARIO['"]/);
});

test('Los controladores de Ventas dejan de usar el emisor COMENTARIO generico', () => {
  for (const source of [cotizaciones, prospeccion, redes]) {
    assert.doesNotMatch(source, /comment-notification\.service/);
    assert.match(source, /ventas-notification\.service/);
  }
});

test('Fase 3 no escribe directamente sup_notificaciones', () => {
  for (const source of [notifications, cotizaciones, prospeccion, redes]) {
    assert.doesNotMatch(source, /INSERT\s+INTO\s+sup_notificaciones/i);
  }
});

test('Candidatos se obtienen por Evento-Rol activo y todos los roles activos', () => {
  assert.match(notifications, /notificacion_evento_roles ner/);
  assert.match(notifications, /ner\.activo\s*=\s*1/);
  assert.match(notifications, /usuario_roles ur/);
  assert.match(notifications, /ur\.activo\s*=\s*1/);
  assert.match(notifications, /r\.estado\s*=\s*1/);
  assert.match(notifications, /u\.estado\s*=\s*1/);
});

test('Alcance reutiliza el resolver oficial de Ventas', () => {
  assert.match(notifications, /ventas-visibility\.service/);
  assert.match(notifications, /ventasVisibility\.resolveVisibilityScope/);
  assert.match(notifications, /scope\?\.mode\s*===\s*'ALL'/);
  assert.match(notifications, /scope\?\.advisorIds/);
});

test('Cada dominio aplica la misma llave de alcance que su repositorio de Ventas', () => {
  assert.match(notifications, /ownerIds:\s*\[row\.id_asesor,\s*row\.id_admin\]/);
  assert.match(notifications, /ownerIds:\s*\[row\.id_usuario\]/);
  assert.match(notifications, /ownerIds:\s*\[row\.id_usuario_asignado\]/);
  assert.match(notifications, /ownerIds:\s*\[after\.id_asesor,\s*after\.id_admin\]/);
  assert.match(notifications, /ownerIds:\s*\[after\.id_usuario\]/);
  assert.match(notifications, /ownerIds:\s*\[after\.id_usuario_asignado\]/);
});

test('El emisor seguro de Fase 2 es el unico camino hacia el motor central', () => {
  assert.match(notifications, /notification-business-emitter\.service/);
  assert.match(notifications, /emitBusinessEventSafe_gnral/);
  assert.match(notifications, /requireRoleMatrix:\s*true/);
  assert.match(notifications, /allowMissingEvent:\s*false/);
  assert.match(notifications, /zonaOperativaNoAplica:\s*true/);
});

test('Comentarios usan la identidad persistente de la accion real', () => {
  assert.match(notifications, /ventas-cotizacion-comentario:\$\{id\}:\$\{commentId\}/);
  assert.match(notifications, /ventas-prospeccion-comentario:\$\{id\}:\$\{commentId\}/);
  assert.match(notifications, /ventas-redes-comentario:\$\{id\}:\$\{commentId\}/);

  assert.match(cotizaciones, /result\?\.interaccion\?\.id_comentario/);
  assert.match(prospeccion, /result\?\.id_com_pors/);
  assert.match(redes, /result\?\.comentario\?\.id_comentario/);
});

test('Cambios de estatus requieren cambio real e identidad persistida', () => {
  assert.match(notifications, /ESTATUS_SIN_CAMBIO/);
  assert.match(notifications, /fecha_cambio_estatus/);
  assert.match(notifications, /fecha_cam_estatus/);
  assert.match(notifications, /updated_at/);
  assert.match(notifications, /IDENTIDAD_ESTATUS_NO_DISPONIBLE/);
});

test('Cotizaciones notifica estatus despues de que el servicio de negocio termina', () => {
  const updateStart = cotizaciones.indexOf('async function updateCotizacion');
  const deleteStart = cotizaciones.indexOf('async function deleteCotizacion');
  const updateBody = cotizaciones.slice(updateStart, deleteStart);
  assert.ok(updateBody.indexOf('await service.update(') < updateBody.indexOf('notifyCotizacionStatus_gnral('));

  const statusStart = cotizaciones.indexOf('async function updateEstatus');
  const assignmentStart = cotizaciones.indexOf('async function updateAsignacion');
  const statusBody = cotizaciones.slice(statusStart, assignmentStart);
  assert.ok(statusBody.indexOf('await service.updateEstatus(') < statusBody.indexOf('notifyCotizacionStatus_gnral('));
});

test('Prospeccion notifica estatus despues de la accion confirmada', () => {
  const start = prospeccion.indexOf('async function updateProspectionStatus');
  const end = prospeccion.indexOf('async function createComment');
  const body = prospeccion.slice(start, end);
  assert.ok(body.indexOf('await service.updateProspectionStatus(') < body.indexOf('notifyProspeccionStatus_gnral('));
});

test('Redes solo emite estatus cuando el servicio reporta cambio real', () => {
  assert.match(redes, /result\?\.estatus_actualizado\s*===\s*true/);
  const start = redes.indexOf('async function updateStatus');
  const end = redes.indexOf('async function updateAssignment');
  const body = redes.slice(start, end);
  assert.ok(body.indexOf('await service.updateStatus(') < body.indexOf('notifyRedesStatus_gnral('));
});

test('Comentarios se notifican solo despues de que createComment/createComentario retorna exito', () => {
  const cotStart = cotizaciones.indexOf('async function createComentario');
  const cotEnd = cotizaciones.indexOf('async function updateComentario');
  const cotBody = cotizaciones.slice(cotStart, cotEnd);
  assert.ok(cotBody.indexOf('await service.createComentario(') < cotBody.indexOf('notifyCotizacionComment_gnral('));

  const prosStart = prospeccion.indexOf('async function createComment');
  const prosBody = prospeccion.slice(prosStart);
  assert.ok(prosBody.indexOf('await service.createComment(') < prosBody.indexOf('notifyProspeccionComment_gnral('));

  const redStart = redes.indexOf('async function createComment');
  const redEnd = redes.indexOf('async function updateComment');
  const redBody = redes.slice(redStart, redEnd);
  assert.ok(redBody.indexOf('await service.createComment(') < redBody.indexOf('notifyRedesComment_gnral('));
});

test('Sincronizaciones M2M no se convierten en emisores humanos', () => {
  const prosSyncStart = prospeccion.indexOf('async function syncProspections');
  const prosHumanStart = prospeccion.indexOf('async function searchSources');
  const prosSyncBody = prospeccion.slice(prosSyncStart, prosHumanStart);
  assert.doesNotMatch(prosSyncBody, /ventasNotifications\./);

  const redSyncStart = redes.indexOf('async function syncRecords');
  const redListStart = redes.indexOf('async function list(');
  const redSyncBody = redes.slice(redSyncStart, redListStart);
  assert.doesNotMatch(redSyncBody, /ventasNotifications\./);
});

test('Rutas de detalle conservan las rutas ya usadas por Ventas', () => {
  assert.match(notifications, /COTIZACION:\s*'ventas-cotizaciones-detalle'/);
  assert.match(notifications, /PROSPECCION:\s*'ventas-prospeccion-detalle'/);
  assert.match(notifications, /REDES:\s*'ventas-asignacion-redes-detalle'/);
  assert.match(notifications, /accion:\s*'ABRIR_MODULO'/);
  assert.match(notifications, /idReferencia:/);
});

test('Fase 3 no incluye los eventos criticos de Tickets', () => {
  const combined = [notifications, cotizaciones, prospeccion, redes].join('\n');
  for (const code of ['FALLA_EQUIPO_CRITICO', 'NUEVO_EQUIPO_CRITICO', 'PERSONA_ATRAPADA']) {
    assert.doesNotMatch(combined, new RegExp(code));
  }
});

test('SQL es solo lectura y cubre los seis eventos y prerrequisitos', () => {
  for (const code of eventCodes) assert.match(sql, new RegExp(code.replaceAll('.', '\\.')));
  assert.match(sql, /ner\.activo\s*=\s*1/);
  assert.match(sql, /usuarios_alcance_informacion/);
  assert.match(sql, /CORELLIAN/);
  assert.match(sql, /clave_deduplicacion/);
  assert.match(sql, /trace_id/);
  assert.doesNotMatch(sql, /^\s*(ALTER|CREATE|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/im);
});
