(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const headers=()=>Object.assign({'Accept':'application/json','Content-Type':'application/json'},window.ManttoAuth?.authHeaders?.()||{});
async function request(path,opts={}){const r=await fetch(API+path,Object.assign({cache:'no-store',headers:headers()},opts));const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));return j;}
function close(container){if(container)container.innerHTML='';}
function open(options={}){
  const container=typeof options.container==='string'?document.querySelector(options.container):options.container;
  const clientId=Number(options.clientId);
  const contact=options.contact||null;
  if(!container||!clientId)throw new Error('No se recibió un cliente válido para el contacto.');
  const editing=Boolean(contact&&contact.id_contacto);
  container.innerHTML='<section class="vtcf-card" aria-label="'+(editing?'Editar contacto':'Nuevo contacto')+'">'+
    '<div class="vtcf-head"><div><h3>'+(editing?'Editar contacto':'Nuevo contacto')+'</h3><p>Los datos quedarán vinculados al cliente seleccionado.</p></div><button type="button" class="vtcf-close" aria-label="Cerrar">×</button></div>'+
    '<form class="vtcf-form"><div class="vtcf-grid">'+
    '<label><span>Nombre del contacto *</span><input name="nombre_contacto" maxlength="200" required value="'+esc(contact?.nombre_contacto||'')+'"></label>'+
    '<label><span>Correo</span><input name="email" maxlength="200" value="'+esc(contact?.email||'')+'"></label>'+
    '<label><span>Teléfono</span><input name="telefono" maxlength="80" value="'+esc(contact?.telefono||'')+'"></label>'+
    '<label class="vtcf-check"><input name="contacto_principal" type="checkbox" value="1" '+(Number(contact?.contacto_principal)===1?'checked':'')+'><span>Marcar como contacto principal</span></label>'+
    '</div><div class="vtcf-actions"><button type="button" class="vtcf-cancel">Cancelar</button><button type="submit" class="vtcf-save">'+(editing?'Guardar cambios':'Guardar contacto')+'</button></div><p class="vtcf-message" aria-live="polite"></p></form></section>';
  container.hidden=false;
  const form=container.querySelector('form');
  const message=container.querySelector('.vtcf-message');
  const cancel=()=>{close(container);options.onCancel?.();};
  container.querySelector('.vtcf-close').onclick=cancel;
  container.querySelector('.vtcf-cancel').onclick=cancel;
  form.onsubmit=async ev=>{
    ev.preventDefault();
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const payload={nombre_contacto:String(fd.get('nombre_contacto')||'').trim(),email:String(fd.get('email')||'').trim()||null,telefono:String(fd.get('telefono')||'').trim()||null,contacto_principal:fd.get('contacto_principal')?1:0};
    const save=container.querySelector('.vtcf-save');save.disabled=true;message.textContent='Guardando contacto…';message.classList.remove('error');
    try{
      const id=Number(contact?.id_contacto||0);
      const data=await request('/api/ventas/clientes/'+clientId+'/contactos'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
      const saved=data.contacto||data.data||Object.assign({},contact||{},payload,id?{id_contacto:id}:{});
      message.textContent=editing?'Contacto actualizado.':'Contacto creado.';
      await options.onSaved?.(saved,data);
      close(container);
    }catch(e){message.textContent=e.message||'No se pudo guardar el contacto.';message.classList.add('error');}
    finally{save.disabled=false;}
  };
  form.elements.nombre_contacto.focus();
}
window.ManttoVentasContactoForm={open,close};
})();
