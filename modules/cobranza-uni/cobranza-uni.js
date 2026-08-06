(function(){
  const MODULES_UNI = Object.freeze({
    'cobranza-uni-dashboard':{title:'Dashboard Cobranza',icon:'📊'},
    'cobranza-uni-estados-cuenta':{title:'Estados de Cuenta',icon:'🧾'},
    'cobranza-uni-aditivas':{title:'Aditivas',icon:'➕'}
  });

  function escapeHtml_uni(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function renderShell_uni(route){
    const config = MODULES_UNI[route];
    const view = document.getElementById('view-' + route);
    if(!config || !view) return false;
    view.innerHTML = '<div class="cob-uni-shell">' +
      '<section class="cob-uni-head">' +
        '<div><p class="cob-uni-kicker">' + escapeHtml_uni(config.icon) + ' Cobranza United</p>' +
        '<h1>' + escapeHtml_uni(config.title) + '</h1>' +
        '<p class="cob-uni-description">Módulo independiente de United, ubicado debajo de Portafolio y separado de la agrupación Cobranza de Corellian.</p></div>' +
        '<span class="cob-uni-badge">Estructura inicial</span>' +
      '</section>' +
      '<section class="cob-uni-card">' +
        '<h2>Alcance de esta fase</h2>' +
        '<p>Se registraron la ruta, el contenedor y el permiso visual. Todavía no se incorpora lógica operativa ni se crean tablas nuevas.</p>' +
        '<div class="cob-uni-meta">' +
          '<div><small>Empresa</small><b>United</b></div>' +
          '<div><small>Ruta interna</small><b>' + escapeHtml_uni(route) + '</b></div>' +
        '</div>' +
      '</section>' +
    '</div>';
    view.dataset.cobranzaUniReady = '1';
    return true;
  }

  function init_uni(route){
    return renderShell_uni(route);
  }

  window.ManttoCobranza_uni = {init:init_uni};
})();
