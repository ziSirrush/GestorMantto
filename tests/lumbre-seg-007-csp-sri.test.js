'use strict';
// [Lumbre | 2026-10-29 | LUMBRE-MG | PRUEBA_CSP_SRI_CABECERAS_V001]

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('la política CSP bloquea scripts inline, objetos y framing', () => {
  const config = read('netlify.toml');
  const policy = config.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1] || '';
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self' https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  for (const header of ['Permissions-Policy', 'Referrer-Policy', 'Strict-Transport-Security',
    'X-Content-Type-Options', 'X-Frame-Options']) assert.match(config, new RegExp(header + '\\s*='));
});

test('index no contiene JavaScript inline y sus dependencias CDN tienen SRI', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  const cdnScripts = [...html.matchAll(/<script\b[^>]*\bsrc="https:\/\/cdnjs\.cloudflare\.com\/[^"]+"[^>]*>/g)];
  assert.equal(cdnScripts.length, 2);
  for (const [tag] of cdnScripts) {
    assert.match(tag, /\bintegrity="sha384-[A-Za-z0-9+/=]+"/);
    assert.match(tag, /\bcrossorigin="anonymous"/);
  }
  assert.match(html, /core\/early-bootstrap\.js/);
});

test('ninguna vista HTML publicable conserva handlers o scripts inline', () => {
  const htmlFiles = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(absolute);
    }
  };
  walk(path.join(ROOT, 'modules'));
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, path.relative(ROOT, file));
    assert.doesNotMatch(html, /<script\b/i, path.relative(ROOT, file));
  }
});

test('las cargas dinámicas de Leaflet fijan versión, SRI y CORS anónimo', () => {
  for (const file of [
    'modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js',
    'modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js'
  ]) {
    const source = read(file);
    assert.match(source, /LEAFLET_VERSION\s*=\s*['"]1\.9\.4['"]/);
    assert.match(source, /LEAFLET_CSS_INTEGRITY\s*=\s*['"]sha384-/);
    assert.match(source, /LEAFLET_JS_INTEGRITY\s*=\s*['"]sha384-/);
    assert.match(source, /link\.integrity\s*=\s*LEAFLET_CSS_INTEGRITY/);
    assert.match(source, /script\.integrity\s*=\s*LEAFLET_JS_INTEGRITY/);
    assert.match(source, /(?:link|script)\.crossOrigin\s*=\s*['"]anonymous['"]/);
  }
});

test('el bootstrap CSP forma parte del shell offline', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /\.\/core\/early-bootstrap\.js/);
  assert.match(worker, /csp-v001/);
});
