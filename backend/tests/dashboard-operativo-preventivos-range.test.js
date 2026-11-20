'use strict';
// Pruebas de los rangos de preventivos: no requieren Aiven ni Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
const dbPath = require.resolve(path.join(root, 'config/db.js'));
const scopePath = require.resolve(path.join(root, 'services/information-record-scope-gnral.service.js'));
const repositoryPath = require.resolve(path.join(root, 'modules/dashboard-operativo/dashboard-operativo.repository.js'));
const oldDb = require.cache[dbPath], oldScope = require.cache[scopePath], oldRepository = require.cache[repositoryPath];
const oldFlag = process.env.BLT_OPT_PREVENTIVOS_RANGE_V1;
let executed = [];
require.cache[dbPath] = {id:dbPath,filename:dbPath,loaded:true,exports:{
  query:async (sql,params) => {executed.push({sql,params});return [[{mes:'2026-01',programados:2,realizados:1}]];}
}};
require.cache[scopePath] = {id:scopePath,filename:scopePath,loaded:true,exports:{
  buildPortafolioScopeSql_gnral:() => ({sql:'p.zona_id IN (?)',params:[[1,2]]})
}};
delete require.cache[repositoryPath];
const repository=require(repositoryPath);
test('meses consecutivos se compactan y no agregan huecos', () => {
  assert.deepEqual(repository.rangesPreventivosMeses_uni(['2026-01','2026-02','2026-04','2026-04','2026-99']),[
    {from:'2026-01-01',to:'2026-03-01'}, {from:'2026-04-01',to:'2026-05-01'}
  ]);
  assert.deepEqual(repository.rangesPreventivosMeses_uni(['2026-12','2027-01']),[
    {from:'2026-12-01',to:'2027-02-01'}
  ]);
});
test('rango indexable conserva filtros, suma y seguridad territorial',async()=>{
  executed=[];
  process.env.BLT_OPT_PREVENTIVOS_RANGE_V1='1';
  const result=await repository.getPreventivosPorMeses(['2026-01','2026-02','2026-04']);
  assert.equal(result[0].programados,2);
  assert.equal(executed.length,1);
  assert.doesNotMatch(executed[0].sql,/WHERE DATE_FORMAT\(sp\.mes_servicio/);
  assert.match(executed[0].sql,/sp\.mes_servicio >= \? AND sp\.mes_servicio < \?/);
  assert.match(executed[0].sql,/p\.zona_id IN \(\?\)/);
  assert.deepEqual(executed[0].params.slice(0,4),['2026-01-01','2026-03-01','2026-04-01','2026-05-01']);
  assert.deepEqual(executed[0].params[4],[1,2]);
});
test('un mes y rollback a consulta anterior',async()=>{
  executed=[];
  process.env.BLT_OPT_PREVENTIVOS_RANGE_V1='1';
  await repository.getPreventivosPorZona('2026-12');
  assert.match(executed[0].sql,/sp\.mes_servicio >= \? AND sp\.mes_servicio < \?/);
  assert.deepEqual(executed[0].params.slice(0,2),['2026-12-01','2027-01-01']);
  executed=[];
  process.env.BLT_OPT_PREVENTIVOS_RANGE_V1='0';
  await repository.getPreventivosPorMeses(['2026-01','2026-02']);
  assert.match(executed[0].sql,/WHERE DATE_FORMAT\(sp\.mes_servicio, '%Y-%m'\) IN/);
  assert.deepEqual(executed[0].params.slice(0,2),['2026-01','2026-02']);
});
test.after(()=>{
  if(oldFlag===undefined)delete process.env.BLT_OPT_PREVENTIVOS_RANGE_V1;else process.env.BLT_OPT_PREVENTIVOS_RANGE_V1=oldFlag;
  if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
  if(oldScope)require.cache[scopePath]=oldScope;else delete require.cache[scopePath];
  if(oldRepository)require.cache[repositoryPath]=oldRepository;else delete require.cache[repositoryPath];
});
