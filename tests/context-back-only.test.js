const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'core', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'base.css'), 'utf8');
const helpers = app.slice(app.indexOf('  const CONTEXT_BACK_TARGETS'), app.indexOf('  let interactionsModulePromise'));

function targetFor(route, selectors) {
  const view = {
    parentElement: null,
    querySelector(selector) { return selectors[selector] || null; }
  };
  const context = {
    window: {
      ManttoRouter: {getCurrent: () => ({route})},
      getComputedStyle: () => ({display:'block', visibility:'visible'})
    },
    document: {getElementById: id => id === (route === 'cx-visitas' ? 'view-placeholder' : 'view-' + route) ? view : null}
  };
  return vm.runInNewContext(helpers + '\ncontextualBackTarget()', context);
}

test('la barra contextual da prioridad al detalle offline frente al listado', () => {
  const view = {parentElement:null};
  const detail = {parentElement:{parentElement:view}};
  const home = {parentElement:{parentElement:view}};
  const result = targetFor('offline-configuracion', {
    '#off-reader-detail .off-reader-detail-back': detail,
    '#off-reader-home': home
  });
  assert.equal(result, detail);
});

test('el regreso interno oculto no se activa si su vista padre está cerrada', () => {
  const hidden = {hidden:true, parentElement:null};
  const button = {parentElement:hidden};
  assert.equal(targetFor('ventas-fotos-mapa', {'[data-vfm-back]':button}), null);
});

test('solo la barra contextual muestra controles de regreso; paginación permanece', () => {
  for(const selector of [
    '[data-cua-back]','#iadm-cor-back-projects','#py-equipo-back',
    '#rl-detail-back','#off-reader-home','.off-reader-detail-back',
    '#vpn-back','#vpd-back','#vcn-back','[data-vfm-back]'
  ]) assert.ok(css.includes(selector), `Falta ocultar ${selector}`);
  assert.match(css, /#app-back-btn\[hidden\]/);
  assert.doesNotMatch(css, /\[data-page-action="prev"\].*display:none/);
  assert.match(app, /if\(localBack\)\{localBack\.click\(\);return;\}/);
});
