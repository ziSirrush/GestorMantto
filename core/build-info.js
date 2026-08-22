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
    const provider=String(info.provider||'DEPLOY').trim().toUpperCase()||'DEPLOY';
    if(!info.generated) return provider+' · metadata de commit no generada';
    return [provider,info.message,info.commitShort].filter(Boolean).join(' · ');
  }

  function getProfileLabel(){
    return 'Versión de la aplicación: '+label();
  }

  function initProgrammerBanner(){
    const el=document.getElementById('app-build-version');
    if(!el)return;
    const info=current();
    const versionLabel=label();
    el.textContent='Versión · '+versionLabel;
    el.title=info.local
      ? 'Versión local de trabajo: '+versionLabel
      : 'Versión desplegada · Commit: '+(info.commit||info.commitShort||'metadata no generada');
    el.setAttribute('aria-label','Versión de la aplicación: '+versionLabel);
    el.hidden=false;
  }

  window.ManttoBuildInfo=Object.freeze({
    current,
    label,
    getProfileLabel,
    initProgrammerBanner,
    initBanner:initProgrammerBanner
  });
})();
