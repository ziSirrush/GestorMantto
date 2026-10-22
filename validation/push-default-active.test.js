'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');


const targetEvents = [
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
];

function effectivePush({ policy = 'OPCIONAL', preferencePush = null, silenced = false, defaultPush = 1 }) {
  if (String(policy).toUpperCase() === 'OBLIGATORIA') return true;
  if (silenced) return false;
  const value = preferencePush === null || preferencePush === undefined
    ? defaultPush
    : preferencePush;
  return Number(value) === 1;
}


test('usuario opcional sin preferencia explicita recibe Push por defecto', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: null, defaultPush: 1 }), true);
});

test('preferencia explicita push=0 sigue ganando sobre el nuevo default', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: 0, defaultPush: 1 }), false);
});

test('silenciar una notificacion opcional sigue impidiendo Push', () => {
  assert.equal(effectivePush({ policy: 'OPCIONAL', preferencePush: 1, silenced: true, defaultPush: 1 }), false);
});

test('evento obligatorio conserva Push activo independientemente del default personal', () => {
  assert.equal(effectivePush({ policy: 'OBLIGATORIA', preferencePush: 0, silenced: true, defaultPush: 0 }), true);
});
