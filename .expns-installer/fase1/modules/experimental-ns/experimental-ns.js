/* BLT NOW | Experimental NS | Fase 1 | 2026-10-26
 * Cascarones independientes. Sin consultas, escrituras o reutilizacion de tablas productivas.
 * El router central valida el rol efectivo antes de invocar init().
 */
(function(){
  'use strict';
  const MODULES_NS_F1 = Object.freeze({
    'experimental-ns-resumen-dia': {
      icon: '📅',
      title: 'Resumen del Día',
      next: 'Fase 3',
      sources: ['ns_tickets_pruebas', 'ns_portafolio_pruebas']
    },
    'experimental-ns-equipos-criticos': {
      icon: '⚠️',
      title: 'Equipos Críticos',
      next: 'Fase 4',
      sources: ['ns_tickets_pruebas', 'ns_portafolio_pruebas']
    },
    'experimental-ns-proyectos-mantenimiento': {
      icon: '🏗️',
      title: 'Proyectos de Mantenimiento',
      next: 'Fase 5',
      sources: ['ns_portafolio_pruebas', 'ns_tickets_pruebas']
    }
  });

  function escapeNsF1(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function initNsF1(route){
    const module = MODULES_NS_F1[String(route || '')];
    const view = document.getElementById('view-' + String(route || ''));
    if(!module || !view) return false;
    // Fase 1: no se llama a la API, no se inicializan modulos congelados.
    view.innerHTML = '<div class="expns-page">' +
      '<section class="expns-card expns-hero">' +
        '<div><p class="expns-eyebrow">🧪 Experimental NS · Fase 1</p>' +
        '<h1>' + escapeNsF1(module.icon + ' ' + module.title) + '</h1>' +
        '<p>Ruta y contenedor independientes. Integración de datos pendiente; no se utilizan tablas productivas.</p></div>' +
        '<span class="expns-pill">En construcción</span>' +
      '</section>' +
      '<section class="expns-card">' +
        '<h2>Próxima integración</h2>' +
        '<p>La copia funcional del módulo se realizará en ' + escapeNsF1(module.next) + '.</p>' +
        '<div class="expns-sources">' + module.sources.map(function(source){
          return '<code>' + escapeNsF1(source) + '</code>';
        }).join('') + '</div>' +
        '<p class="expns-note">Fase 2: consultas backend de solo lectura, permisos y alcance registrados.</p>' +
      '</section>' +
    '</div>';
    return true;
  }

  window.ManttoExperimentalNsF1 = Object.freeze({ init: initNsF1 });
})();
