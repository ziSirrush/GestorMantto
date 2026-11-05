'use strict';

// Préstamos Aiven: regresión de contrato, consulta sin escrituras y alcance estricto.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '../..');
const dbPath = require.resolve(path.join(root, 'backend/src/config/db.js'));
const queries = [];
const fakeDb = {
  async query(sql, params = []) {
    queries.push({sql, params});
    if (/SELECT p.empresa AS empresa, COUNT\(\*\) AS total/.test(sql)) {
      return [[{empresa:'Corellian', total: 2}]];
    }
    if (sql.startsWith('SELECT DISTINCT') && sql.includes('AS responsable')) {
      return [[{responsable:'ANA'}, {responsable:'SIN RESPONSABLE'}]];
    }
    if (sql.startsWith('SELECT DISTINCT') && sql.includes('AS antiguedad')) {
      return [[{antiguedad:'0-6 MESES'}]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS articulos') && sql.includes('AS piezas')) {
      return [[{articulos:2,piezas:'3.5000',valorTotal:'100.0000',responsables:1}]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS articulos') && sql.includes('AS cantidad')) {
      return [[{articulos:2,cantidad:'3.5000',valorTotal:'100.0000'}]];
    }
    if (sql.includes('GROUP BY antiguedad')) {
      return [[{antiguedad:'0-6 MESES',articulos:2,valorTotal:'100.0000'}]];
    }
    if (sql.includes('GROUP BY responsable')) {
      return [[{responsable:'ANA',articulos:2,cantidad:'3.5000',valorTotal:'100.0000',desde:'2026-11-01',diasPrestamo:4,sitios:1}]];
    }
    if (sql.includes('ORDER BY p.id_prestamo DESC')) {
      return [[{id:10,idArticuloNs:'3',articulo:'Pieza de prueba',codigo:'AB3',ag:'AG3',
        empresa:'Corellian',responsable:'ANA',sitio:'AD 2',cantidad:'2.5000',costo:'50.0000',
        costoUnitario:'20.000000',fecha:'2026-11-01',dias:4,antiguedad:'0-6 MESES'}]];
    }
    throw new Error('SQL no reconocido: '+sql.slice(0,100));
  }
};
require.cache[dbPath] = {id:dbPath,filename:dbPath,loaded:true,exports:fakeDb};
const loans = require('../src/modules/almacen/almacen.prestamos-query-service.js');

const scope = {
  subsidiaryIds:['2'],
  domains:['CORELLIAN'],
  subsidiaries:[{id:'2',domain:'CORELLIAN',aliases:['Corellian','Corellian SA de CV']}]
};

function assertSecurity() {
  for (const q of queries) {
    assert.match(q.sql,/FROM almacen_ns_prestamos p/);
    assert.match(q.sql,/IN \(\?\)/);
    const allowedCompanies = q.params.find(value => Array.isArray(value));
    assert.ok(Array.isArray(allowedCompanies),'Los permisos se aplican en SQL.');
    assert.ok(allowedCompanies.includes('CORELLIAN'));
    assert.ok(!allowedCompanies.includes('UNITED'));
    assert.doesNotMatch(q.sql,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  }
}

test('catálogos: Aiven independiente del lote Inventario y con alcance seguro', async () => {
  queries.length=0;
  const out=await loans.getLoanCatalogs(scope);
  assert.equal(out.ok,true);
  assert.equal(out.available,true);
  assert.equal(out.source.provider,'AIVEN');
  assert.equal(out.source.filas,2);
  assert.equal(out.source.datasets.PRESTAMO.filas,2);
  assert.deepEqual(out.companies,['Corellian']);
  assert.deepEqual(out.responsibles,['ANA','SIN RESPONSABLE']);
  assert.deepEqual(out.ages,['0-6 MESES']);
  assertSecurity();
});

test('resumen: KPIs, antigüedad, responsables y valor exacto desde Aiven', async () => {
  queries.length=0;
  const out=await loans.getLoanSummary(scope,{company:'Corellian'});
  assert.deepEqual(out.kpis,{articulos:2,piezas:3.5,valorTotal:100,responsables:1});
  assert.equal(out.rows[0].porcentaje,100);
  assert.equal(out.rows[0].cantidad,3.5);
  assert.equal(out.rows[0].sitios,1);
  assert.equal(out.ages[0].articulos,2);
  assert.ok(queries.every(x=>x.params.includes('Corellian')));
  assertSecurity();
});

test('detalle: parámetros SQL, filtros y paginación por 30', async () => {
  queries.length=0;
  const out=await loans.getLoans(scope,{
    company:'Corellian',responsible:'ANA',age:'0-6 MESES',q:'AG3',page:2
  });
  assert.equal(out.pagination.page,2);
  assert.equal(out.pagination.pageSize,30);
  assert.equal(out.pagination.total,2);
  assert.equal(out.rows[0].costo,50);
  assert.equal(out.rows[0].costoUnitario,20);
  assert.equal(out.rows[0].cantidad,2.5);
  assert.equal(queries.length,2);
  assert.deepEqual(queries[0].params.slice(-2),[30,30]);
  assert.ok(queries.every(x=>x.params.includes('Corellian')&&x.params.includes('ANA')&&x.params.includes('0-6 MESES')));
  assertSecurity();
});

test('sin subsidiarias, no se ejecuta ninguna consulta ni se filtra solo en frontend', async () => {
  queries.length=0;
  await assert.rejects(loans.getLoanCatalogs({subsidiaryIds:[],subsidiaries:[]}),{status:403,code:'ALMACEN_NS_SCOPE_UNRESOLVED'});
  await assert.rejects(loans.getLoans({subsidiaryIds:['2'],subsidiaries:[{id:'5',domain:'UNITED',aliases:[]}]}),{status:403,code:'ALMACEN_NS_SCOPE_UNRESOLVED'});
  assert.equal(queries.length,0);
});

test('contrato: backend conecta rutas de préstamo y frontend abandona Excel', () => {
  const query = fs.readFileSync(path.join(root,'backend/src/modules/almacen/almacen.ns-query-service.js'),'utf8');
  const frontend=fs.readFileSync(path.join(root,'modules/almacen/almacen.js'),'utf8');
  const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');
  assert.match(query,/loanQueries\.getLoanCatalogs\(scope\)/);
  assert.match(query,/loanQueries\.getLoanSummary\(scope,query\)/);
  assert.match(query,/loanQueries\.getLoans\(scope,query\)/);
  assert.match(frontend,/Tabla: almacen_ns_prestamos/);
  assert.match(frontend,/Fuente Aiven/);
  assert.doesNotMatch(frontend,/statusPill\('Fuente Excel','ok'\)/);
  assert.match(loader,/20261105-prestamos-aiven-v001/);
});
