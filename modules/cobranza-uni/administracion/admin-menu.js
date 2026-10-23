(function (win,doc){
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
  // Activar el boton SOLO tras confirmar acceso del backend. Sin lista de roles.
  const ID='side-cobranza-uni-administracion';
  const API='/api/cobranza-uni/administracion/contrato';
  let seq=0;
  function visible(granted){
    const button=doc.getElementById(ID);
    if(!button)return;
    button.hidden=!granted;
    button.style.display=granted?'':'none';
    const group=button.closest('.side-group');
    if(group)group.hidden=!Array.from(group.querySelectorAll('.side-item')).some(item=>!item.hidden);
  }
  async function refresh(){
    const ticket=++seq;
    visible(false);
    if(!win.ManttoAuth?.getToken?.()||!win.ManttoAuth?.apiGet)return;
    try{
      const result=await win.ManttoAuth.apiGet(API);
      if(ticket!==seq)return;
      visible(result?.ok===true&&Array.isArray(result.tables)&&result.tables.some(t=>t?.can_view===true));
    }catch(error){if(ticket===seq)visible(false);}
  }
  for(const event of ['mantto:auth-ready','mantto:permissions-updated','mantto:view-user-changed'])
    doc.addEventListener(event,()=>refresh().catch(()=>{}));
  doc.addEventListener('mantto:session-expired',()=>{seq++;visible(false);});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>refresh().catch(()=>{}),{once:true});
  else refresh().catch(()=>{});
  win.ManttoCobranzaAdminMenu_uni=Object.freeze({refresh});
})(window,document);
