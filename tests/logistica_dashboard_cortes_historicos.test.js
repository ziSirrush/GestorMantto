'use strict';

const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/dashboard-logistica/dashboard-logistica.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/dashboard-logistica/dashboard-logistica.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

function ok(condition,message){
  if(!condition)throw new Error(message);
}

ok(js.includes("fetchCutCatalog()"),'Falta fetchCutCatalog');
ok(js.includes("/api/logistica/cortes/semanales'"),'Falta endpoint de catálogo de cortes');
ok(js.includes("fetchCutByWeek(anio,semana)"),'Falta lectura de corte por año/semana');
ok(js.includes("'/api/logistica/cortes/semanales/'+year+'/'+week"),'Falta endpoint de corte específico');
ok(js.includes("norm(cut&&cut.estado)==='CERRADO'"),'El selector debe limitarse a cortes CERRADOS');
ok(js.includes('id="dl-cut-select"'),'Falta selector de corte guardado');
ok(js.includes("select.onchange=()=>loadCutByKey(select.value)"),'El selector no carga la semana elegida');
ok(js.includes('id="dl-cut-ingresos"'),'Falta KPI de ingresos');
ok(js.includes('id="dl-cut-cambios"'),'Falta KPI de cambios de estatus');
ok(js.includes('id="dl-cut-registros"'),'Falta KPI de registros del corte');
ok(js.includes("state.selectedCutKey=cutKey(state.cut)"),'No se conserva el último corte como selección inicial');
ok(js.includes("Array.isArray(cut.movimientos_json)?cut.movimientos_json:[]"),'No se cargan movimientos_json del corte seleccionado');
ok(js.includes("#dl-containers-months-first")||js.includes("'dl-containers-months-first'"),'Debe conservar el guard corregido del ring mensual V002');
ok(css.includes('.dl-cut-select'),'Faltan estilos del selector de cortes');
ok(css.includes('.dl-cut-kpis'),'Faltan estilos del resumen del corte');
ok(loader.includes('20260923-dashboard-cortes-historicos-v001'),'Falta cache-bust del FIX de cortes históricos');

console.log('OK - FIX_DASHBOARD_LOGISTICA_CORTES_HISTORICOS_V001');
console.log('  Historial de cortes cerrados disponible en selector');
console.log('  Carga por año/semana reutiliza endpoints existentes');
console.log('  Último corte sigue siendo la selección inicial');
console.log('  KPIs del corte seleccionado visibles');
