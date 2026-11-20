/* Paleta aprobada de estatus de equipos de Instalaciones (Corellian).
   Independiente de los Estados Visuales de alertas. */
(function(root){
  'use strict';
  const colors=Object.freeze({
    '01-SUS':'#D4D4D4',
    '02-OC':'#FF9999',
    '03-PM':'#FFD561',
    '04-M':'#FF6461',
    '05-PA':'#61FFB0',
    '06-A':'#00944B',
    '07-PE':'#3ADDE0',
    '08-T':'#0D1BFF'
  });
  function normalize(code){
    const value=String(code==null?'':code).trim().toUpperCase().replace(/\s+/g,'');
    const match=value.match(/^(0?[1-8])-?([A-Z]{1,3})$/);
    return match?match[1].padStart(2,'0')+'-'+match[2]:value;
  }
  function color(code){ return colors[normalize(code)]||null; }
  function textColor(code){return ['06-A','08-T'].includes(normalize(code))?'#FFFFFF':'#0F172A';}
  root.ManttoInstalacionesEstatus=Object.freeze({colors,normalize,color,textColor});
})(window);
