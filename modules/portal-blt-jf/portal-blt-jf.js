(function(){
  const VIEWS = Object.freeze({
    'portal-blt-jf-movimientos-portafolio':{vista:'movimientos',title:'Movimientos Portafolio (JF)'}
  });

  function message(view, title, text){
    view.innerHTML = '<section class="pblt-msg"><h2></h2><p></p></section>';
    view.querySelector('h2').textContent = title;
    view.querySelector('p').textContent = text;
  }

  async function init(route){
    const config = VIEWS[route];
    const view = document.getElementById('view-' + route);
    if(!config || !view) return false;
    message(view, config.title, 'Abriendo la vista del Portal BLT…');
    try{
      const response = await window.ManttoHttp.request('/api/portal-blt-jf/pase', {
        method:'POST', body:JSON.stringify({vista:config.vista}), dedupe:false
      });
      const url = response && response.data && response.data.url;
      if(!url) throw new Error('Sin pase');
      const frame = document.createElement('iframe');
      frame.className = 'pblt-frame';
      frame.title = config.title;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
      frame.src = url;
      view.replaceChildren(frame);
    }catch(error){
      const denied = Number(error && error.status) === 403;
      message(view, config.title, denied
        ? 'No tienes acceso a esta vista del Portal BLT.'
        : 'No fue posible abrir la vista del Portal BLT. Intenta de nuevo en unos minutos.');
    }
    return true;
  }

  window.ManttoPortalBltJf = {init};
})();
