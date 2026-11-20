'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const text=fs.readFileSync(path.resolve(__dirname,'../modules/callcenter/callcenter.js'),'utf8');
test('U365 detecta contrato de pagina en servidor y deja el prefetch antiguo como fallback',()=>{
assert.match(text,/mode==='SERVER_PAGED'/);
assert.match(text,/await fetchU365Pages\(path\)/);
assert.match(text,/page_size:String\(state.u365PageSize\)/);
assert.match(text,/fetchU365ServerPage\(view,next\)/);
assert.match(text,/fetchU365ServerPage\(view,0\)/);
assert.match(text,/state.u365ServerMode\[view\]\?rows:rows.slice/);
assert.match(text,/sort_key/);
assert.match(text,/u365Sequence/);
});
