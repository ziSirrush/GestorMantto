/* BLT NOW | Instalaciones Administracion | FASE 3 ALTAS | 2026-10-20
 * Motor puro de PREVISUALIZACION de las siete formulas de Hoja1 fila 3
 * de FieldLine Instalaciones.xlsx. La fuente trae las formulas como texto
 * y utiliza referencias de la fila 2633; aqui se adaptan por equipo.
 * NO escribe a ins_fl, NO usa red ni almacenamiento del navegador.
 * El backend contiene copia identica para integracion autorizada en Fase 4.
 * AR y BB son SOLO FECHAS PREVISTAS: nunca pruebas de fin real.
 */
(function(root,factory){
  'use strict';
  const exported=Object.freeze(factory());
  if(typeof module==='object'&&module.exports)module.exports=exported;
  if(root&&root.document)root.ManttoInstalacionesAltasFormulas_cor=exported;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const SOURCE='FieldLine Instalaciones.xlsx / Hoja1 / fila 3';
  const EXCEL_COLUMNS=Object.freeze({
    AG:'meses_garantia_restantes',
    AR:'fecha_fin_montaje_real',
    AS:'dias_restantes',
    BB:'fecha_fin_ajuste_real',
    BJ:'anio_termino',
    BU:'dias_sin_visita',
    CC:'costo_mensual_mantenimiento_cem'
  });
  const EXCEL_FIELDS=Object.freeze(Object.values(EXCEL_COLUMNS));
  const EXISTING_FIELDS=Object.freeze(['estatus_completo','dias_sin_ccnr']);
  const ALL_PREVIEW_FIELDS=Object.freeze([...EXCEL_FIELDS,...EXISTING_FIELDS]);
  const ONLY_SUGGESTED_DATES=Object.freeze(['fecha_fin_montaje_real','fecha_fin_ajuste_real']);
  const LABELS=Object.freeze({
    '01-SUS':'Equipos Suspendidos','02-OC':'Equipos en Obra Civil',
    '03-PM':'Equipos Proximos a Montar','04-M':'Equipos en Montaje',
    '05-PA':'Equipos Proximos a Ajustar','06-A':'Equipos en Ajuste',
    '07-PE':'Equipos Proximos a Entregar','08-T':'Equipos Entregados'
  });
  const EMPTY=new Set(['','-','N/A','NA','N/D','NULL','SIN FECHA']);
  const MS=86400000;
  const textCor=value=>String(value===null||value===undefined?'':value).trim();
  const absentCor=value=>value===null||value===undefined||EMPTY.has(textCor(value).toUpperCase());
  function civilCor(value){
    if(absentCor(value))return null;
    let input=textCor(value);
    if(value instanceof Date&&Number.isFinite(value.getTime()))input=value.toISOString().slice(0,10);
    let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    let y,month,day;
    if(m){y=Number(m[1]);month=Number(m[2]);day=Number(m[3]);}
    else {
      m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
      if(!m)return null;
      day=Number(m[1]);month=Number(m[2]);y=Number(m[3]);
    }
    if(y<1900||y>2100||month<1||month>12||day<1||day>31)return null;
    const d=new Date(Date.UTC(y,month-1,day));
    if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)return null;
    return {y,m:month,d:day,serial:Math.round(d.getTime()/MS),iso:`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
  }
  function todayMexicoCor(now=new Date()){
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Fecha tecnica invalida.');
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(now);
    const map={};for(const p of parts){if(['year','month','day'].includes(p.type))map[p.type]=p.value;}
    return `${map.year}-${map.month}-${map.day}`;
  }
  function numberCor(value){
    if(absentCor(value))return null;
    const input=typeof value==='number'?String(value):textCor(value);
    // No interpretamos separadores de millares ni porcentajes como meses o pesos.
    if(!/^-?\d+(?:\.\d+)?$/.test(input))return null;
    const n=Number(input);
    return Number.isFinite(n)?n:null;
  }
  function daysCor(a,b){
    if(!a||!b)return null;
    return b.serial-a.serial;
  }
  function workingDaysCor(start,end){
    if(!start||!end)return null;
    const sign=start.serial<=end.serial?1:-1;
    const first=sign===1?start:end;
    const last=sign===1?end:start;
    const count=last.serial-first.serial+1; // DIAS.LAB incluye ambos extremos.
    const weeks=Math.floor(count/7);
    let total=weeks*5;
    const firstWeekday=new Date(first.serial*MS).getUTCDay();
    for(let i=0;i<count%7;i++){
      const day=(firstWeekday+i)%7;
      if(day!==0&&day!==6)total++;
    }
    return total*sign;
  }
  function endOfMonthCor(date){
    return date.d===new Date(Date.UTC(date.y,date.m,0)).getUTCDate();
  }
  // Excel DIAS360(fecha_inicial, fecha_final): metodo EE.UU./NASD (tercer argumento omitido).
  function days360UsCor(a,b){
    if(!a||!b)return null;
    let y1=a.y,m1=a.m,d1=a.d;
    let y2=b.y,m2=b.m,d2=b.d;
    const feb1=m1===2&&endOfMonthCor(a);
    const feb2=m2===2&&endOfMonthCor(b);
    if(feb1)d1=30;
    if(d1===31)d1=30;
    if(feb2&&feb1)d2=30;
    if(d2===31){
      if(d1<30){d2=1;m2++;if(m2===13){m2=1;y2++;}}
      else d2=30;
    }
    return (y2-y1)*360+(m2-m1)*30+(d2-d1);
  }
  // AR/BB en Excel seleccionan fecha MODIFICADA o PLANEADA, NO un hecho real.
  function plannedCandidateCor(modified,planned){
    if(!absentCor(modified))return civilCor(modified);
    return civilCor(planned);
  }
  function calculateCor(values={},options={}){
    if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Fila invalida.');
    const today=civilCor(options.today||todayMexicoCor());
    if(!today)throw Error('Fecha de calculo invalida.');
    const monte=plannedCandidateCor(values.fecha_fin_montaje_modificado,values.fecha_fin_montaje_planeado);
    const ajuste=plannedCandidateCor(values.fecha_fin_ajuste_modificado,values.fecha_fin_ajuste_planeado);
    const estatus=textCor(values.estatus).toUpperCase();
    const visita=civilCor(values.fecha_visita);
    const ccnr=civilCor(values.fecha_ccnr);
    const descarga=civilCor(values.fecha_descarga);
    const entrega=civilCor(values.fecha_entrega_cliente);
    const garantSitio=numberCor(values.meses_garantia_sitio);
    const garantActas=numberCor(values.meses_garantia_actas);
    let garantia=null;
    if(absentCor(values.meses_garantia_sitio))garantia=garantActas;
    else if(garantSitio!==null&&descarga)garantia=garantSitio-(daysCor(descarga,today)/30);
    const budget=numberCor(values.presupuesto_mantenimiento_cem);
    const maintenance=numberCor(values.meses_mantenimiento_gratuito);
    return {
      meses_garantia_restantes:garantia,
      fecha_fin_montaje_real:monte?.iso||null, // Solo SUGERENCIA; no fecha real.
      dias_restantes:estatus==='04-M'&&monte?workingDaysCor(today,monte):null,
      fecha_fin_ajuste_real:ajuste?.iso||null, // Solo SUGERENCIA; no fecha real.
      anio_termino:entrega?entrega.y:null,
      dias_sin_visita:visita?days360UsCor(visita,today):null,
      costo_mensual_mantenimiento_cem:budget!==null&&maintenance!==null&&maintenance!==0
        ?budget/maintenance:null,
      estatus_completo:Object.prototype.hasOwnProperty.call(LABELS,estatus)?LABELS[estatus]:null,
      dias_sin_ccnr:ccnr?daysCor(ccnr,today):null
    };
  }
  function formatCor(field,value){
    if(value===null||value===undefined||value===''||!Number.isFinite(value)&&typeof value==='number')return '—';
    if(field==='costo_mensual_mantenimiento_cem'&&typeof value==='number'){
      return '$'+value.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
    if(field==='meses_garantia_restantes'&&typeof value==='number'){
      return value.toLocaleString('es-MX',{maximumFractionDigits:4});
    }
    return String(value);
  }
  function isSuggestedDateCor(field){return ONLY_SUGGESTED_DATES.includes(field);}
  return {SOURCE,EXCEL_COLUMNS,EXCEL_FIELDS,EXISTING_FIELDS,ALL_PREVIEW_FIELDS,
    ONLY_SUGGESTED_DATES,calculateCor,formatCor,isSuggestedDateCor,
    // helpers explicitos para pruebas unitarias, sin dependencias de red/BD.
    todayMexicoCor,civilCor,workingDaysCor,days360UsCor,plannedCandidateCor};
});
