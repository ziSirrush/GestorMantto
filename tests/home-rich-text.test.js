const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const richText = require('../core/rich-text');

const repositoryRoot = path.resolve(__dirname, '..');

test('conserva texto anterior y saltos de línea para el editor', () => {
  assert.equal(richText.toEditorHtml('Primera línea\nSegunda línea'), 'Primera línea<br>Segunda línea');
  assert.equal(richText.toPlainText('Primera línea<br>Segunda línea'), 'Primera línea\nSegunda línea');
});

test('permite los formatos visuales definidos para las tareas', () => {
  const source = '<p><b>Importante</b> <i>hoy</i> <u>subrayado</u> <strike>anterior</strike> <span style="font-size:18px;color:#ef4444;background-color:rgb(254, 240, 138)">alerta</span></p><ul><li>Punto</li></ul>';
  const sanitized = richText.sanitizeHtml(source);
  assert.match(sanitized, /<strong>Importante<\/strong>/);
  assert.match(sanitized, /<em>hoy<\/em>/);
  assert.match(sanitized, /<u>subrayado<\/u>/);
  assert.match(sanitized, /<s>anterior<\/s>/);
  assert.match(sanitized, /font-size:18px/);
  assert.match(sanitized, /color:#ef4444/);
  assert.match(sanitized, /background-color:rgb\(254, 240, 138\)/);
  assert.match(sanitized, /<ul><li>Punto<\/li><\/ul>/);
});

test('elimina código, atributos y estilos no permitidos', () => {
  const source = '<script>alert(1)</script><p onclick="alert(2)">Seguro</p><span style="color:red;background-image:url(javascript:alert(4));font-size:99px">Texto</span>';
  const sanitized = richText.sanitizeHtml(source);
  assert.equal(sanitized, '<p>Seguro</p><span>Texto</span>');
  assert.doesNotMatch(sanitized, /script|onclick|javascript|background-image|99px/i);
});

test('preserva expresiones anteriores entre signos angulares como texto', () => {
  const sanitized = richText.sanitizeHtml('Enviar a <usuario@empresa.com> y validar 1 < 2 > 0');
  assert.equal(richText.toPlainText(sanitized), 'Enviar a <usuario@empresa.com> y validar 1 < 2 > 0');
  assert.doesNotMatch(sanitized, /<usuario|< 2/);
});

test('convierte etiquetas font heredadas a estilos controlados', () => {
  assert.equal(
    richText.sanitizeHtml('<font size="5" color="#2563eb">Grande</font>'),
    '<span style="font-size:18px;color:#2563eb">Grande</span>'
  );
});

test('Home carga el sanitizador antes del editor y protege altas y ediciones', () => {
  const index = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
  const home = fs.readFileSync(path.join(repositoryRoot, 'modules/home/home.js'), 'utf8');
  const service = fs.readFileSync(path.join(repositoryRoot, 'backend/src/modules/pendientes/pendientes.service.js'), 'utf8');
  assert.ok(index.indexOf('./core/rich-text.js') < index.indexOf('./modules/home/home.js'));
  ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'foreColor', 'hiliteColor'].forEach(command => {
    assert.match(home, new RegExp('data-rich-(?:command|color)="' + command + '"'));
  });
  assert.equal((service.match(/taskRichText\.sanitizeHtml\(sanitizeText\(body\.descripcion\)\)/g) || []).length, 2);
});
