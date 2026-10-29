'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-08 JWT V001]
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../src/middleware/auth.middleware.js'),'utf8');
function load(jwt) {
 const module={exports:{}};
 const stubs={jsonwebtoken:jwt,'../config/db':{},'../services/user-viewer.service':{}};
 vm.runInNewContext(source+'\nmodule.exports.__test={verifyAccessToken_aster,verifyViewerToken_aster}',{
  module,exports:module.exports,process:{env:{JWT_SECRET:'qa'}},Buffer,Date,
  require(name){if(!Object.hasOwn(stubs,name))throw Error(name);return stubs[name];}
 });
 return module.exports.__test;
}
function mockJwt(payload){return {verify(_token,_secret,options){
 assert.deepEqual(Array.from(options.algorithms),['HS256']);return payload;
}}}
test('JWT nuevo y acceso legacy limitado conservan sesion',()=>{
 const common={id_SB:7,iat:1000,exp:4600,session_version:'2026'};
 assert.equal(load(mockJwt({...common,aud:'blt-now-access',iss:'blt-now-api',token_use:'access'})).verifyAccessToken_aster('x').id_SB,7);
 assert.equal(load(mockJwt(common)).verifyAccessToken_aster('x').id_SB,7);
});
test('tokens de recuperación, audiencias ajenas y duracion excesiva son rechazados',()=>{
 const common={id_SB:7,iat:1000,exp:4600,session_version:'2026'};
 for(const bad of [{...common,aud:'mantto-password-recovery',type:'password_recovery'},
   {...common,token_use:'access',aud:'other'}, {...common,exp:1000+24*3600}])
 assert.throws(()=>load(mockJwt(bad)).verifyAccessToken_aster('x'),/inválido/);
});
test('Visor tiene su audiencia separada y admite sesion legacy 30m',()=>{
 const value={type:'user_viewer',actor_id:1,target_id:2,read_only:true};
 assert.equal(load(mockJwt(value)).verifyViewerToken_aster('x').actor_id,1);
 assert.equal(load(mockJwt({...value,aud:'blt-now-user-viewer',iss:'blt-now-api'})).verifyViewerToken_aster('x').target_id,2);
 assert.throws(()=>load(mockJwt({...value,aud:'blt-now-access'})).verifyViewerToken_aster('x'),/Audiencia/);
});
