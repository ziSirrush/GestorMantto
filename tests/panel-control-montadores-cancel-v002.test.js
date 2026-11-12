'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/panel-control/panel-control.js'),'utf8');
test('Panel QA 04-M tiene cancelacion por ID y conserva polling durante CANCELANDO',()=>{
 assert.match(source,/id="pc-montage-cancel"/);
 assert.match(source,/MONTAGE_URL\+'\/cancelar'/);
 assert.match(source,/JSON\.stringify\(\{id:record\.id\}\)/);
 assert.match(source,/\['EN_PROCESO','CANCELANDO'\]\.includes/);
 assert.match(source,/cancel\.disabled=Boolean/);
});
