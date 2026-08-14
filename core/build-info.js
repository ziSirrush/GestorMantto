(function(){
  'use strict';

  function isLocalHost(){
    return ['localhost','127.0.0.1','::1'].includes(String(window.location.hostname||'').toLowerCase());
  }

  function current(){
    const raw=window.MANTTO_BUILD_INFO||{};
    const local=isLocalHost();
    const generated=String(raw.environment||'').toUpperCase()==='DEPLOY' && Boolean(raw.commit||raw.commitShort||raw.message);
    return {
      local,
      generated,
      provider:String(raw.provider||'').trim(),
      localVersion:String(raw.localVersion||'FIX V016.2').trim(),
      message:String(raw.message||'').trim(),
      commit:String(raw.commit||'').trim(),
      commitShort:String(raw.commitShort||raw.commit||'').trim().slice(0,7)
    };
  }

  function label(){
    const info=current();
    if(info.local) return ['LOCAL',info.localVersion].filter(Boolean).join(' · ');
    if(!info.generated) return 'DEPLOY · metadata de commit no generada';
    return ['DEPLOY',info.message,info.commitShort].filter(Boolean).join(' · ');
  }

  function getProfileLabel(){
    return 'Versión de la aplicación: '+label();
  }

  function exactProgramador(){
    const user=window.ManttoAuth?.getUser?.()||{};
    const roles=[user.rol]
      .concat(Array.isArray(user.roles)?user.roles:[])
      .concat(Array.isArray(user.roles_detalle)?user.roles_detalle.map(r=>r&&(r.rol||r.nombre)):[])
      .filter(Boolean)
      .map(r=>String(r).trim().toLowerCase());
    return roles.includes('programador');
  }

  function initProgrammerBanner(){
    const el=document.getElementById('app-build-version');
    if(!el)return;
    if(!exactProgramador()){
      el.hidden=true;
      el.textContent='';
      return;
    }
    const info=current();
    el.textContent=label();
    el.title=info.local ? 'Versión local de trabajo' : ('Commit desplegado: '+(info.commit||info.commitShort||'metadata no generada'));
    el.hidden=false;
  }

  window.ManttoBuildInfo=Object.freeze({current,label,getProfileLabel,initProgrammerBanner});
})();
