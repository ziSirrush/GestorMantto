'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractGitMessage } = require('../tools/release-version');

const expected = 'Version 231126.3.231126.1';
const stored = message => 'tree aaaa\nauthor Example <test@example.test> 0 +0000\ncommitter Example <test@example.test> 0 +0000\n\n' + message;

test('validar mensaje completo de publicacion, sin cuerpo ni lineas extras', () => {
  assert.equal(extractGitMessage(stored(expected)), expected);
  assert.equal(extractGitMessage(stored(expected + '\n')), expected);
  for (const invalid of [
    expected + '\n\n',
    expected + '\n\nDescripcion no permitida',
    expected + '\nDetalle adicional\n',
    expected + ' ',
    'Cambio: ' + expected
  ]) {
    assert.notEqual(extractGitMessage(stored(invalid)), expected);
  }
});

test('rechazar objeto commit sin separador de cabecera', () => {
  assert.throws(() => extractGitMessage('commit sin estructura'), /mensaje completo/);
});
