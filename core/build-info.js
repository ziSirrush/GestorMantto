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

  function loginLabel(){
    const info=current();
    if(info.message) return info.message;
    if(info.local && info.localVersion) return info.localVersion;
    return '';
  }

  function getProfileLabel(){
    return 'Versión de la aplicación: '+label();
  }

  function ensureLoginVersionStyles(){
    if(document.getElementById('mantto-login-build-version-style')) return;
    const style=document.createElement('style');
    style.id='mantto-login-build-version-style';
    style.textContent=[
      '#auth-screen{flex-direction:column;gap:14px}',
      '#auth-login-build-version{',
      'max-width:min(430px,calc(100vw - 40px));',
      'padding:0 10px;',
      'color:#B8C0CC;',
      'font-size:14px;',
      'font-weight:600;',
      'line-height:1.35;',
      'letter-spacing:.01em;',
      'text-align:center;',
      'overflow-wrap:anywhere;',
      'text-shadow:0 1px 1px rgba(0,0,0,.12)',
      '}',
      '#auth-login-build-version[hidden]{display:none!important}',
      '@media(max-width:760px){#auth-login-build-version{font-size:13px;max-width:calc(100vw - 40px)}}'
    ].join('');
    document.head.appendChild(style);
  }

  function initLoginVersion(){
    const screen=document.getElementById('auth-screen');
    const card=screen&&screen.querySelector('.auth-card');
    if(!screen||!card) return;

    ensureLoginVersionStyles();

    let el=document.getElementById('auth-login-build-version');
    if(!el){
      el=document.createElement('div');
      el.id='auth-login-build-version';
      el.className='auth-login-build-version';
      card.insertAdjacentElement('afterend',el);
    }

    const versionLabel=loginLabel();
    el.textContent=versionLabel;
    el.title=versionLabel ? 'Versión de la aplicación: '+versionLabel : '';
    el.setAttribute('aria-label',versionLabel ? 'Versión de la aplicación: '+versionLabel : '');
    el.hidden=!versionLabel;
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
    loginLabel,
    getProfileLabel,
    initLoginVersion,
    initProgrammerBanner,
    initBanner:initProgrammerBanner
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initLoginVersion,{once:true});
  }else{
    initLoginVersion();
  }
})();
