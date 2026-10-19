'use strict';
// [Aster | 2026-10-19 | ASTER-MG | FIX_HOME_TAREAS_META_VISIBILIDAD_V001]
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const home = read('modules/home/home.js');

function section(start, end) {
  const first = home.indexOf(start);
  const last = home.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Falta seccion ${start}`);
  return home.slice(first, last);
}

const renderTask = new Function(
  'safeText', 'priorityIcon', 'toTargetAttr',
  section('function taskRow(t)', 'function itemRow(i, cls)') + '\nreturn taskRow;'
)(value => String(value == null ? '' : value), () => '🟢', value => JSON.stringify(value));

const normalizeTask = new Function(
  'richTextPlain', 'formatDate', 'formatDateInput',
  section('function normalizeTask(row)', 'function isCommentNotification(row)') + '\nreturn normalizeTask;'
)(value => String(value || ''), value => value || 'Sin fecha', value => value || '');

function sample(changes = {}) {
  return {
    id: 5, tipo: 'PERSONAL', titulo: 'Revisar equipo',
    descripcion: '', prioridad: 'BAJA', estatus: 'Pendiente',
    due: 'Sin fecha', dueRaw: '', responsables: [],
    subtareas: 0, subtareasCerradas: 0, comentarios: 0,
    proyecto: '', equipo: '', area: '', ...changes
  };
}

test('imagen de referencia: omite 0/0 y conserva fecha, seguimiento y 5 comentarios', () => {
  const html = renderTask(sample({
    due: '06/07/2026', dueRaw: '2026-07-06', responsables: ['DGB'], comentarios: 5
  }));
  assert.match(html, /Fecha compromiso/);
  assert.match(html, /06\/07\/2026/);
  assert.match(html, /Seguimiento/);
  assert.match(html, /DGB/);
  assert.match(html, /5 comentarios/);
  assert.doesNotMatch(html, /0\/0 subtareas|>Subtareas</);
  assert.match(html, />Ver<\/button>/);
});

test('si no hay datos de metadatos no se dibuja el bloque ni su columna vacia', () => {
  const html = renderTask(sample());
  assert.match(html, /data-empty-meta="1"/);
  assert.doesNotMatch(html, /class="task-meta task-compact-meta"/);
  assert.doesNotMatch(html, />Fecha compromiso<|>Seguimiento<|>Responsables<|>Subtareas<|>Comentarios</);
  assert.match(html, />Ver<\/button>/);
});

test('muestra subtareas cuando existen aunque ninguna este cerrada; oculta comentarios cero', () => {
  const html = renderTask(sample({ subtareas: 3, subtareasCerradas: 0, comentarios: 0 }));
  assert.match(html, /0\/3 subtareas/);
  assert.match(html, /data-empty-meta="0"/);
  assert.doesNotMatch(html, />Comentarios</);
});

test('colaborativas muestran responsables reales y ocultan cadenas numericas cero', () => {
  const html = renderTask(sample({ tipo: 'COLABORATIVA', responsables: ['0', '00', 'ACB'] }));
  assert.match(html, /Responsables/);
  assert.match(html, />ACB<\/strong>/);
  assert.doesNotMatch(html, />Seguimiento</);
  const empty = renderTask(sample({ tipo: 'COLABORATIVA', responsables: ['0', '000'] }));
  assert.doesNotMatch(empty, />Responsables</);
  assert.match(empty, /data-empty-meta="1"/);
});

test('no muestra fecha cuando es nula o un cero ISO', () => {
  for (const dueRaw of ['', '0000-00-00', '2026-00-00']) {
    const html = renderTask(sample({ due: 'Sin fecha', dueRaw }));
    assert.doesNotMatch(html, />Fecha compromiso</);
  }
});

test('normalizacion no reemplaza un seguimiento ausente con las iniciales del creador', () => {
  const t = normalizeTask({
    id_pendiente: 15, tipo_pendiente: 'PERSONAL',
    creado_por_iniciales: 'DGB', seguimiento: '', responsables: '',
    total_subtareas: 0, total_comentarios: 0
  });
  assert.deepEqual(t.responsables, []);
  assert.doesNotMatch(renderTask(t), />Seguimiento</);
});

test('el CSS reacomoda la tarjeta en escritorio y pantallas pequenas sin huecos', () => {
  const css = read('styles/home.css');
  assert.match(css, /\.task-row\.task-row-compact\[data-empty-meta="1"\]\{grid-template-columns:minmax\(0,1fr\) auto\}/);
  assert.match(css, /\.task-row\.task-row-compact\[data-empty-meta="1"\]\{grid-template-columns:minmax\(0,1fr\)\}/);
  const index = read('index.html');
  assert.match(index, /styles\/home\.css\?v=20261019-tareas-meta-visibles-v001/);
  assert.match(index, /modules\/home\/home\.js\?v=20261019-tareas-meta-visibles-v001/);
});
