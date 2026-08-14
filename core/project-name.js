(function(){
  const MONTHS = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
  function projectName(value, fallback){
    const raw = String(value == null ? '' : value).trim();
    if(!raw) return fallback === undefined ? '—' : fallback;
    const m = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
    if(!m) return raw;
    const numero = String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
    const dia = String(Number(m[3]) || m[3]);
    return dia + ' de ' + (MONTHS[m[2]] || m[2]) + ' #' + numero;
  }
  window.ManttoFormat = window.ManttoFormat || {};
  window.ManttoFormat.projectName = projectName;
})();
