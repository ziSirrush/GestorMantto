'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-04 PUSH SSRF V001]
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePushEndpoint } = require('../src/modules/push-notifications/push-notifications.endpoint-guard');
test('solo acepta endpoints Web Push oficiales mediante HTTPS',()=>{
  for(const u of ['https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/Q','https://sub.notify.windows.com/?id=3']){
    assert.doesNotThrow(()=>validatePushEndpoint(u));
  }
});
test('rechaza IP privadas/publicas, dominio suplantado, usuario, puerto y redireccion como destino',()=>{
  for(const u of ['http://fcm.googleapis.com/x','https://127.0.0.1/a','https://169.254.169.254/a',
   'https://fcm.googleapis.com.evil.invalid/a','https://evil-fcm.googleapis.com.evil.invalid/a',
   'https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://localhost/a',
   'https://[::1]/a','https://fcm.googleapis.com/a#fragment']){
    assert.throws(()=>validatePushEndpoint(u),{code:'PUSH_ENDPOINT_NOT_ALLOWED'});
  }
});
