(function(){
  const MODULES_EXP = Object.freeze({
    'experimental-atencion-prioritaria':{title:'Atención Prioritaria',icon:'🚨',phase:'Fase 2',source:'Desarrollo_United_Experimental'},
    'experimental-resumen-dia':{title:'Resumen del Día',icon:'📅',phase:'Fase 3',source:'Desarrollo_United_Experimental'},
    'experimental-entregas-recientes':{title:'Entregas Recientes',icon:'📦',phase:'Fase 4',source:'Desarrollo_United_Experimental'},
    'experimental-equipos-criticos':{title:'Equipos Críticos',icon:'⚠️',phase:'Fase 5',source:'Desarrollo_United_Experimental'},
    'experimental-dashboard-call-center':{title:'Dashboard Call Center',icon:'☎️',phase:'Fase 6',source:'Desarrollo_United_Experimental'},
    'experimental-proyectos-criticos':{title:'Proyectos Críticos',icon:'🏗️',phase:'Fase 8',source:'Desarrollo_United_Experimental'}
  });

  function escapeHtml_exp(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function renderShell_exp(route){
    const config = MODULES_EXP[route];
    const view = document.getElementById('view-' + route);
    if(!config || !view) return false;
    view.innerHTML = '<div class="exp-shell">' +
      '<section class="exp-shell-head">' +
        '<div><p class="exp-shell-kicker">' + escapeHtml_exp(config.icon) + ' Agrupación Experimental</p>' +
        '<h1>' + escapeHtml_exp(config.title) + '</h1>' +
        '<p class="exp-shell-description">Vista independiente creada para recibir la lógica y las tablas del prototipo, sin modificar los módulos funcionales actuales.</p></div>' +
        '<span class="exp-shell-status">Estructura preparada</span>' +
      '</section>' +
      '<section class="exp-shell-card">' +
        '<h2>Alcance de esta fase</h2>' +
        '<p>La navegación, el contenedor y el permiso visual ya están separados. La consulta y la adaptación de datos se integrarán en su fase correspondiente reutilizando las tablas existentes de Aiven.</p>' +
        '<div class="exp-shell-meta">' +
          '<div><small>Integración prevista</small><b>' + escapeHtml_exp(config.phase) + '</b></div>' +
          '<div><small>Referencia funcional</small><b>' + escapeHtml_exp(config.source) + '</b></div>' +
          '<div><small>Ruta interna</small><b>' + escapeHtml_exp(route) + '</b></div>' +
        '</div>' +
      '</section>' +
    '</div>';
    view.dataset.experimentalReady = '1';
    return true;
  }

  function init_exp(route, payload){
    if(route === 'experimental-atencion-prioritaria' && window.ManttoAtencionPrioritaria_exp && typeof window.ManttoAtencionPrioritaria_exp.init === 'function'){
      return window.ManttoAtencionPrioritaria_exp.init(payload || null);
    }
    if(route === 'experimental-resumen-dia' && window.ManttoResumenDiaExperimental_exp && typeof window.ManttoResumenDiaExperimental_exp.init === 'function'){
      return window.ManttoResumenDiaExperimental_exp.init(payload || null);
    }
    return renderShell_exp(route);
  }

  window.ManttoExperimental_exp = {init:init_exp};
})();
