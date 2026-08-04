const assert = require('assert');
const policy = require('../src/services/storage/storage-file-policy.service');

function file(name, type, bytes) {
  const buffer = Buffer.from(bytes);
  return { originalname: name, mimetype: type, size: buffer.length, buffer };
}

function expectCode(callback, code) {
  let caught = null;
  try { callback(); } catch (error) { caught = error; }
  assert(caught, `Se esperaba el error ${code}.`);
  assert.strictEqual(caught.code, code);
}

const jpg = file('foto prueba.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pdf = file('reporte.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n'));
const zip = file('archivo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', [0x50, 0x4b, 0x03, 0x04]);
const txt = file('nota.txt', 'text/plain', Buffer.from('Texto de prueba UTF-8.'));

assert.strictEqual(policy.validateFile_gnral(jpg).signature, 'jpeg');
assert.strictEqual(policy.validateFile_gnral(pdf).signature, 'pdf');
assert.strictEqual(policy.validateFile_gnral(zip).signature, 'zip');
assert.strictEqual(policy.validateFile_gnral(txt).signature, 'text');
assert.strictEqual(policy.sanitizeOriginalName_gnral('../archivo: prueba?.pdf'), 'archivo- prueba-.pdf');

expectCode(
  () => policy.validateMetadata_gnral({ originalname: 'script.svg', mimetype: 'image/svg+xml' }),
  'CFFAA_FILE_TYPE_NOT_ALLOWED'
);
expectCode(
  () => policy.validateFile_gnral(file('falso.jpg', 'image/jpeg', Buffer.from('no-es-jpeg'))),
  'CFFAA_FILE_SIGNATURE_MISMATCH'
);
expectCode(
  () => policy.validateFiles_gnral([jpg, jpg], { maxFiles: 1 }),
  'CFFAA_TOO_MANY_FILES'
);

console.log('CFFAA-01A/B/C: validaciones técnicas superadas.');
