'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `No se encontró ${start}`);
  assert.ok(to > from, `No se encontró ${end} después de ${start}`);
  return source.slice(from, to);
}

test('la tarjeta elimina el icono lateral y conserva una jerarquía compacta de tres zonas', () => {
  const taskRow = section(read('modules/home/home.js'), 'function taskRow(t)', 'function itemRow');
  assert.match(taskRow, /class="task-row task-row-compact"/);
  assert.doesNotMatch(taskRow, /task-icon|🧭|👥/);

  const ordered = ['task-identity', 'task-identity-head', 'task-title task-open', 'task-title-badges', 'task-description', 'task-compact-meta', 'task-actions'];
  let previous = -1;
  ordered.forEach(marker => {
    const index = taskRow.indexOf(marker);
    assert.ok(index > previous, `${marker} debe conservar el orden visual aprobado`);
    previous = index;
  });
});

test('título y Ver abren el mismo detalle mientras los vínculos conservan su navegación', () => {
  const source = read('modules/home/home.js');
  const taskRow = section(source, 'function taskRow(t)', 'function itemRow');
  const bindings = section(source, 'function bindClicks()', 'function renderTasks()');

  assert.equal((taskRow.match(/class="[^"]*task-open[^"]*"/g) || []).length, 2);
  assert.equal((taskRow.match(/data-task-id=/g) || []).length, 3);
  assert.match(taskRow, />Ver<\/button>/);
  assert.match(bindings, /document\.querySelectorAll\('\.task-open'\)/);
  assert.match(bindings, /ev\.stopPropagation\(\); openTaskDetail\(el\.dataset\.taskId\)/);

  assert.match(taskRow, /module:'proyectos',id:t\.proyecto/);
  assert.match(taskRow, /module:'portafolio',id:t\.equipo/);
  assert.match(bindings, /document\.querySelectorAll\('\[data-target\]'\)/);
  assert.match(bindings, /ev\.stopPropagation\(\)/);
});

test('prioridad y estado quedan junto al título, seguidos por la descripción', () => {
  const taskRow = section(read('modules/home/home.js'), 'function taskRow(t)', 'function itemRow');
  const head = section(taskRow, 'class="task-identity-head"', 'class="task-description"');
  assert.match(head, /t\.prioridad/);
  assert.match(head, /class="badge estado"/);
  assert.match(taskRow, /const description = t\.descripcion \|\| 'Sin descripcion'/);
});

test('la zona operativa muestra fecha, responsables, subtareas y comentarios', () => {
  const taskRow = section(read('modules/home/home.js'), 'function taskRow(t)', 'function itemRow');
  ['Fecha compromiso', 'Seguimiento', 'Responsables', 'Subtareas', 'Comentarios'].forEach(label => {
    assert.ok(taskRow.includes(label), `Falta ${label}`);
  });
  assert.match(taskRow, /t\.due/);
  assert.match(taskRow, /t\.responsables/);
  assert.match(taskRow, /t\.subtareasCerradas \+ '\/' \+ t\.subtareas/);
  assert.match(taskRow, /t\.comentarios/);
});

test('Área, Proyecto y Equipo permanecen visibles solo cuando existen', () => {
  const taskRow = section(read('modules/home/home.js'), 'function taskRow(t)', 'function itemRow');
  assert.match(taskRow, /const hasLinkage = Boolean\(t\.area \|\| t\.proyecto \|\| t\.equipo\)/);
  assert.match(taskRow, /hasLinkage \? `<div class="task-linkage">/);
  assert.match(taskRow, /<small>Área<\/small>/);
  assert.match(taskRow, /<small>Proyecto<\/small>/);
  assert.match(taskRow, /<small>Equipo<\/small>/);
});

test('tabs, filtros, orden y permisos conservan el flujo existente de renderizado', () => {
  const source = read('modules/home/home.js');
  const renderTasks = section(source, 'function renderTasks()', 'function renderCounters()');
  assert.match(renderTasks, /state\.tasks\.filter\(t=>t\.tipo===state\.activeTaskType\)/);
  assert.match(renderTasks, /home-task-search/);
  assert.match(renderTasks, /home-task-priority/);
  assert.match(renderTasks, /home-task-status/);
  assert.match(renderTasks, /tasks\.map\(taskRow\)\.join\(''\)/);
  assert.match(source, /data-task-tab="PERSONAL"/);
  assert.match(source, /data-task-tab="COLABORATIVA"/);
  assert.match(source, /id="home-new-task"/);
});

test('estilos y cache-bust habilitan layout fluido sin altura fija ni overflow horizontal', () => {
  const css = read('styles/home.css');
  const compact = css.slice(css.indexOf('/* Home tareas v1.2'));
  const index = read('index.html');

  assert.match(compact, /container-type:inline-size/);
  assert.match(compact, /grid-template-columns:minmax\(0,1\.35fr\) minmax\(0,1fr\) auto/);
  assert.match(compact, /@container task-workspace \(max-width:640px\)/);
  assert.match(compact, /@container task-workspace \(max-width:420px\)/);
  assert.match(compact, /@media\(max-width:760px\)/);
  assert.match(compact, /overflow-wrap:anywhere/);
  assert.doesNotMatch(compact, /\.task-row\.task-row-compact[^}]*height:/s);
  assert.match(index, /styles\/home\.css\?v=20261014-tareas-cards-v001/);
  assert.match(index, /modules\/home\/home\.js\?v=20261014-tareas-cards-v001/);
});
