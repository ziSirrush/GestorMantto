'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EVENTS,EVENT_CODES,NS_TICKETS_NOTIFY_USER_ID}=
  require('../src/modules/netsuite-integration/netsuite-tickets-notification.contract');
const {classifyTicketChange_ns,OBSERVED_FIELDS}=
  require('../src/modules/netsuite-integration/netsuite-tickets-changes.service');
const {bellVisibilitySql_gnral,pushVisibilitySql_gnral}=
  require('../src/services/notifications/notification-policy');

const before=()=>({
  ticket:'CASO-123',id_interno:'123',estado_ticket:'En proceso',
  estado:'Activo',estatus_equipo_final:null,fecha_cierre:null,
  prioridad:'Media',responsabilidad:'BLT',tecnico:'Tecnico A',
  persona_que_atiende:'Persona A',blt_empleado:'Empleado A',ejecutivo_call:'Ejecutivo A'
});
test('NS solo declara 5 eventos y el destinatario unico 4',()=>{
  assert.equal(NS_TICKETS_NOTIFY_USER_ID,4);
  assert.equal(EVENT_CODES.length,5);
  assert.equal(new Set(EVENT_CODES).size,5);
  assert.ok(EVENT_CODES.every(c=>c.length<=50 && c.startsWith('NS_TICKET_')));
});
test('Ticket inexistente -> creado; Ticket identico -> ninguno',()=>{
  assert.equal(classifyTicketChange_ns(null,before()).eventCode,EVENTS.CREADO);
  assert.equal(classifyTicketChange_ns(before(),before()),null);
});
test('Cambio de estado, prioridad, asignacion y responsabilidad',()=>{
  const groups=[
    ['estado_ticket','Cerrado',EVENTS.ESTATUS],
    ['prioridad','Alta',EVENTS.PRIORIDAD],
    ['tecnico','Tecnico B',EVENTS.ASIGNACION],
    ['responsabilidad','Cliente',EVENTS.RESPONSABILIDAD]
  ];
  for(const [field,value,event] of groups){
    assert.equal(classifyTicketChange_ns(before(),{...before(),[field]:value}).eventCode,event);
  }
});
test('Precedencia: estatus > prioridad > responsabilidad > asignacion',()=>{
  const base=before();
  assert.equal(classifyTicketChange_ns(base,{...base,estado_ticket:'Cerrado',prioridad:'Alta'}).eventCode,EVENTS.ESTATUS);
  assert.equal(classifyTicketChange_ns(base,{...base,prioridad:'Alta',responsabilidad:'Cliente'}).eventCode,EVENTS.PRIORIDAD);
  assert.equal(classifyTicketChange_ns(base,{...base,responsabilidad:'Cliente',tecnico:'Tecnico B'}).eventCode,EVENTS.RESPONSABILIDAD);
});
test('COALESCE: NULL entrante conserva valor anterior',()=>{
  const base=before();
  assert.equal(classifyTicketChange_ns(base,{...base,prioridad:null,tecnico:null}),null);
  assert.ok(OBSERVED_FIELDS.includes('fecha_cierre'));
});
test('Actualizacion general en un campo distinto no genera eventos',()=>{
  const base=before();
  assert.equal(classifyTicketChange_ns(base,{...base,descripcion:'Actualizacion de texto'}),null);
});
test('Fecha MySQL: DATETIME leido como Date equivale al string persistido',()=>{
  const base={...before(),fecha_cierre:new Date('2026-11-04T21:01:00Z')};
  assert.equal(classifyTicketChange_ns(base,{...base,fecha_cierre:'2026-11-04 21:01:00'}),null);
});
test('Politicas de lectura: usuario 4, preferencia campana/push y silencio',()=>{
  const bell=bellVisibilitySql_gnral('n','e','p');
  const push=pushVisibilitySql_gnral('n','e','p');
  for(const sql of [bell,push]){
    assert.match(sql,/n\.id_usuario = 4/);
    assert.match(sql,/COALESCE\(p\.silenciada,0\) = 0/);
    assert.match(sql,/NS_TICKET_CREADO/);
    assert.match(sql,/NS_TICKET_RESPONSABILIDAD_CAMBIADA/);
    assert.match(sql,/NOT \(UPPER\(TRIM\(COALESCE\(n\.tipo_notificacion/);
  }
  assert.match(bell,/COALESCE\(p\.campana, e\.campana_default, 1\) = 1/);
  assert.match(push,/COALESCE\(p\.push, e\.push_default, 0\) = 1/);
});
