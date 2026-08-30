  // [Aster | 2026-08-31 | ASTER-MG | FASE 2 RESPONSIVE]
  // Evita que CSS lazy de rutas visitadas anteriormente contamine la ruta actual.
  // Solo se administran links creados por ManttoModuleLoader (data-mantto-lazy=1).
  function activateRouteStyles(config){
    const allowed=new Set((config?.css||[]).map(absoluteUrl));
    document.querySelectorAll('link[data-mantto-lazy="1"][rel="stylesheet"][href]').forEach(link=>{
      const href=absoluteUrl(link.getAttribute('href'));
      link.disabled=!allowed.has(href);
    });
  }

  async function ensure(route){
    const key=String(route||'home');
    const config=ROUTES[key];
    if(!config){
      activateRouteStyles(null);
      return true;
    }
    if(routePromises.has(key)){
      await routePromises.get(key);
      activateRouteStyles(config);
      return true;
    }
    const task=(async()=>{
      await Promise.all((config.css||[]).map(loadStyle));
      activateRouteStyles(config);
      for(const src of (config.js||[])) await loadScript(src);
      document.dispatchEvent(new CustomEvent('mantto:module-loaded',{detail:{route:key}}));
      return true;
    })();
    routePromises.set(key,task);
    try{return await task;}catch(error){routePromises.delete(key);throw error;}
  }
