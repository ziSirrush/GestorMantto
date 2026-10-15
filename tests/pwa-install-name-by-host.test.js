'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function executeBrandScript(hostname) {
  const index = read('index.html');
  const source = index.match(/<script id="blt-pwa-install-brand">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'No se encontró el selector de marca PWA.');
  const elements = new Map([
    ['blt-pwa-manifest', { setAttribute(name, value) { this[name] = value; } }],
    ['blt-pwa-application-name', { setAttribute(name, value) { this[name] = value; } }],
    ['blt-pwa-apple-title', { setAttribute(name, value) { this[name] = value; } }]
  ]);
  vm.runInNewContext(source, {
    window: { location: { hostname } },
    document: { getElementById(id) { return elements.get(id) || null; } }
  });
  return elements;
}

test('Netlify y otros hosts instalan la PWA como BLT NOW', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.name, 'BLT NOW');
  assert.equal(manifest.short_name, 'BLT NOW');
});

test('GitHub Pages instala la PWA como BLT NOW GH', () => {
  const manifest = JSON.parse(read('manifest-github.json'));
  assert.equal(manifest.name, 'BLT NOW GH');
  assert.equal(manifest.short_name, 'BLT NOW GH');
});

test('index selecciona el manifiesto por hostname y mantiene el nombre de iOS alineado', () => {
  const index = read('index.html');
  assert.match(index, /<title>BLT NOW<\/title>/);
  assert.doesNotMatch(index, /<title>BLT NOW\s*[|—-]/);
  assert.match(index, /\(\^\|\\\.\)github\\\.io\$\/i/);
  assert.match(index, /isGitHubPages\?'\.\/manifest-github\.json':'\.\/manifest\.json'/);
  assert.match(index, /isGitHubPages\?'BLT NOW GH':'BLT NOW'/);
  assert.match(index, /id="blt-pwa-apple-title"/);
  assert.match(index, /id="blt-pwa-application-name"/);
});

test('selector aplica realmente cada nombre según el host', () => {
  const github = executeBrandScript('empresa.github.io');
  assert.equal(github.get('blt-pwa-manifest').href, './manifest-github.json');
  assert.equal(github.get('blt-pwa-application-name').content, 'BLT NOW GH');
  assert.equal(github.get('blt-pwa-apple-title').content, 'BLT NOW GH');

  const netlify = executeBrandScript('blt-now.netlify.app');
  assert.equal(netlify.get('blt-pwa-manifest').href, './manifest.json');
  assert.equal(netlify.get('blt-pwa-application-name').content, 'BLT NOW');
  assert.equal(netlify.get('blt-pwa-apple-title').content, 'BLT NOW');
});
