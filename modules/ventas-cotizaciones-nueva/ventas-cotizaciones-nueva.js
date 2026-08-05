(function(){
'use strict';
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const state={clients:[],filtered:[],selectedClient:null,contacts:[],catalogs:{},statuses:[],routePayload:null,equipmentTypes:[],equipmentRows:[{cantidad:0,tipo_equipo:''}]};
const NEW_CLIENT_DRAFT_KEY='mantto:ventas-cotizaciones-nueva:draft';
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers=(json=false)=>Object.assign({'Accept':'application/json'},json?{'Content-Type':'application/json'}:{},window.ManttoAuth?.authHeaders?window.ManttoAuth.authHeaders():{});
async function request(path,options={}){const r=await fetch(API+path,{...options,cache:'no-store',headers:{...headers(Boolean(options.body)),...(options.headers||{})}});const text=await r.text();let data={};try{data=text?JSON.parse(text):{};}catch(e){throw new Error('La API respondió contenido no JSON.');}if(!r.ok||data.ok===false)throw new Error(data.message||data.error||('Error HTTP '+r.status));return data;}
function toast(message,error=false){const el=$('#vcn-toast');el.textContent=message;el.className='vcn-toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='vcn-toast',3000);}
function goBack(){window.ManttoRouter?.back?.();}

function normalizeEquipmentCatalog(rows){
  const allowed=['Elevador','Montacargas','Escalera','Rampa','Plataformas/Otros'];
  const available=(Array.isArray(rows)?rows:[]).map(row=>String(row?.articulo??row??'').trim()).filter(Boolean);
  return allowed.filter(type=>available.some(item=>item.toLowerCase()===type.toLowerCase()));
}
function equipmentTotal(){return state.equipmentRows.reduce((sum,row)=>sum+(Number(row.cantidad)||0),0);}
function renderEquipmentRows(){
  const list=$('#vcn-equipment-list');
  if(!list)return;
  if(!state.equipmentRows.length)state.equipmentRows=[{cantidad:0,tipo_equipo:''}];
  const selected=state.equipmentRows.map(row=>row.tipo_equipo).filter(Boolean);
  list.innerHTML=state.equipmentRows.map((row,index)=>{
    const options=state.equipmentTypes.filter(type=>type===row.tipo_equipo||!selected.includes(type));
    return `<div class="vcn-equipment-row" data-equipment-index="${index}">
      <label><span>Número de equipos</span><input class="vcn-equipment-qty" min="0" step="1" inputmode="numeric" type="number" value="${esc(row.cantidad??0)}"></label>
      <label><span>Tipo de equipos</span><select class="vcn-equipment-type"><option value="">Selecciona...</option>${options.map(type=>`<option value="${esc(type)}"${type===row.tipo_equipo?' selected':''}>${esc(type)}</option>`).join('')}</select></label>
      ${state.equipmentRows.length>1?`<button class="vcn-remove-equipment" type="button" aria-label="Eliminar tipo de equipo" title="Eliminar tipo de equipo">×</button>`:''}
    </div>`;
  }).join('');
  list.querySelectorAll('.vcn-equipment-row').forEach(rowEl=>{
    const index=Number(rowEl.dataset.equipmentIndex);
    rowEl.querySelector('.vcn-equipment-qty').addEventListener('input',event=>{
      const value=Number(event.target.value||0);
      state.equipmentRows[index].cantidad=Number.isFinite(value)?value:0;
      updateEquipmentFooter();
    });
    rowEl.querySelector('.vcn-equipment-type').addEventListener('change',event=>{
      state.equipmentRows[index].tipo_equipo=event.target.value;
      renderEquipmentRows();
    });
    rowEl.querySelector('.vcn-remove-equipment')?.addEventListener('click',()=>{
      state.equipmentRows.splice(index,1);
      renderEquipmentRows();
    });
  });
  updateEquipmentFooter();
}
function updateEquipmentFooter(){
  const total=$('#vcn-equipment-total');
  const add=$('#vcn-add-equipment');
  if(total)total.textContent=`Total de equipos: ${equipmentTotal()}`;
  if(add){
    const used=new Set(state.equipmentRows.map(row=>row.tipo_equipo).filter(Boolean));
    add.disabled=state.equipmentRows.length>=state.equipmentTypes.length||used.size>=state.equipmentTypes.length;
  }
}
function addEquipmentRow(){
  if(state.equipmentRows.length>=state.equipmentTypes.length)return;
  state.equipmentRows.push({cantidad:0,tipo_equipo:''});
  renderEquipmentRows();
}
function equipmentPayload(){
  const rows=[];
  const used=new Set();
  for(let index=0;index<state.equipmentRows.length;index+=1){
    const row=state.equipmentRows[index];
    const cantidad=Number(row.cantidad||0);
    const tipo=String(row.tipo_equipo||'').trim();
    if(!tipo&&cantidad===0)continue;
    if(!tipo)throw new Error(`Selecciona el tipo de equipo en la fila ${index+1}.`);
    if(!Number.isInteger(cantidad)||cantidad<=0)throw new Error(`La cantidad de ${tipo} debe ser un entero mayor a cero.`);
    if(used.has(tipo))throw new Error(`El tipo de equipo ${tipo} está repetido.`);
    used.add(tipo);
    rows.push({tipo_equipo:tipo,cantidad,orden:rows.length+1});
  }
  return rows;
}

function saveDraftBeforeNewClient(){
  const form=$('#vcn-form');
  if(!form)return;
  const draft={};
  new FormData(form).forEach((value,key)=>{
    if(['id_cliente','telefono','correo'].includes(key))return;
    draft[key]=String(value??'');
  });
  draft.equipos=state.equipmentRows.map(row=>({cantidad:Number(row.cantidad)||0,tipo_equipo:String(row.tipo_equipo||'')}));
  try{sessionStorage.setItem(NEW_CLIENT_DRAFT_KEY,JSON.stringify(draft));}catch(e){}
}
function restoreDraftAfterNewClient(){
  let draft=null;
  try{draft=JSON.parse(sessionStorage.getItem(NEW_CLIENT_DRAFT_KEY)||'null');}catch(e){draft=null;}
  if(!draft||typeof draft!=='object')return;
  const form=$('#vcn-form');
  if(!form)return;
  Object.entries(draft).forEach(([name,value])=>{
    if(name==='equipos')return;
    const field=form.elements.namedItem(name);
    if(!field)return;
    if(field instanceof RadioNodeList){field.value=value;return;}
    if(field.type==='checkbox')field.checked=value==='true'||value==='1';
    else field.value=value;
  });
  if(Array.isArray(draft.equipos)&&draft.equipos.length){state.equipmentRows=draft.equipos.map(row=>({cantidad:Number(row.cantidad)||0,tipo_equipo:String(row.tipo_equipo||'')}));renderEquipmentRows();}
  try{sessionStorage.removeItem(NEW_CLIENT_DRAFT_KEY);}catch(e){}
}
function openNewClient(){
  saveDraftBeforeNewClient();
  window.ManttoRouter?.go?.('ventas-clientes-nuevo',{
    returnTo:'ventas-cotizaciones-nueva',
    source:'ventas-cotizaciones-nueva'
  });
}
function renderClientOptions(){const box=$('#vcn-client-options');if(!box)return;const rows=state.filtered;box.innerHTML=rows.length?rows.map(c=>`<button class="vcn-option" type="button" data-id="${c.id_cliente}"><strong>${esc(c.nombre_empresa)}</strong><small>${esc([c.ciudad,c.estado,c.iniciales].filter(Boolean).join(' · ')||'Sin datos adicionales')}</small></button>`).join(''):'<div class="vcn-option"><small>No se encontraron clientes.</small></div>';box.hidden=false;box.querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>selectClient(Number(btn.dataset.id)));}
function filterClients(){const q=$('#vcn-client-search').value.trim().toLowerCase();state.filtered=state.clients.filter(c=>[c.nombre_empresa,c.razon_social,c.ciudad,c.estado,c.iniciales].some(v=>String(v||'').toLowerCase().includes(q)));renderClientOptions();}
async function selectClient(id){const c=state.clients.find(x=>Number(x.id_cliente)===Number(id));if(!c)return;state.selectedClient=c;$('#vcn-id-cliente').value=String(c.id_cliente);$('#vcn-client-search').value=c.nombre_empresa;$('#vcn-client-options').hidden=true;$('#vcn-ciudad').value=c.ciudad||'';if(c.estado)$('#vcn-estado').value=c.estado;$('#vcn-add-contact').disabled=false;await loadContacts(c.id_cliente);}
async function loadClients(){const data=await request('/api/ventas/clientes?page=1&page_size=5000&sort_by=nombre_empresa&sort_direction=asc');state.clients=Array.isArray(data.clientes)?data.clientes:(Array.isArray(data.data)?data.data:[]);state.filtered=state.clients.slice();}
async function loadContacts(idCliente){
  const select=$('#vcn-contacto');
  select.disabled=true;
  select.innerHTML='<option value="">Cargando...</option>';
  state.contacts=[];
  applyContact(null);

  try{
    const response=await request('/api/ventas/clientes/'+idCliente+'/contactos');
    state.contacts=Array.isArray(response.contactos)
      ? response.contactos
      : Array.isArray(response.data)
        ? response.data
        : [];

    select.innerHTML='<option value="">Selecciona...</option>'+state.contacts
      .map(c=>`<option value="${c.id_contacto}">${esc(c.nombre_contacto)}${c.puesto_contacto?' · '+esc(c.puesto_contacto):''}${Number(c.contacto_principal)===1?' · Principal':''}</option>`)
      .join('');
    select.disabled=false;

    const principal=state.contacts.find(c=>Number(c.contacto_principal)===1)||state.contacts[0];
    if(principal){
      select.value=String(principal.id_contacto);
      applyContact(principal.id_contacto);
    }else{
      select.innerHTML='<option value="">Sin contactos registrados</option>';
      toast('El cliente no tiene contactos registrados. Usa “Crear contacto”.',true);
    }
  }catch(e){
    select.disabled=false;
    select.innerHTML='<option value="">No se pudieron cargar los contactos</option>';
    toast(e.message||'No se pudieron cargar los contactos del cliente.',true);
  }
}
function applyContact(id){const c=state.contacts.find(x=>Number(x.id_contacto)===Number(id));$('#vcn-puesto-contacto').value=c?.puesto_contacto||'';$('#vcn-telefono').value=c?.telefono||'';$('#vcn-correo').value=c?.email||'';}
function fillSelect(id,rows){const el=$(id);el.innerHTML='<option value="">Selecciona...</option>'+rows.map(r=>`<option value="${esc(r.articulo??r)}">${esc(r.articulo??r)}</option>`).join('');}
async function loadCatalogs(){const [general,cots]=await Promise.all([request('/api/catalogo-general?area=Ventas'),request('/api/ventas/cotizaciones/catalogos')]);const rows=Array.isArray(general.articulos)?general.articulos:[];state.catalogs=rows.reduce((acc,row)=>{const key=String(row.elemento||'');(acc[key]||(acc[key]=[])).push(row);return acc;},{});fillSelect('#vcn-tipo-proyecto',state.catalogs['Tipo de Proyecto']||[]);state.equipmentTypes=normalizeEquipmentCatalog(state.catalogs['Tipo de Equipo']||[]);if(!state.equipmentTypes.length)state.equipmentTypes=['Elevador','Montacargas','Escalera','Rampa','Plataformas/Otros'];renderEquipmentRows();const estados=(await request('/api/catalogo-general?elemento=Estado')).articulos||[];fillSelect('#vcn-estado',estados);state.statuses=cots.catalogos?.estatus_proyecto||[];fillSelect('#vcn-estatus',state.statuses);$('#vcn-estatus').value='Contacto';}
function openContact(){if(!state.selectedClient)return toast('Selecciona primero un cliente.',true);window.ManttoVentasContactoForm?.open({container:'#vcn-contact-editor',clientId:state.selectedClient.id_cliente,onSaved:async(saved)=>{await loadContacts(state.selectedClient.id_cliente);const id=Number(saved?.id_contacto||0);if(id){$('#vcn-contacto').value=String(id);applyContact(id);}toast('Contacto creado y seleccionado.');}});}
async function saveQuotation(event){
  event.preventDefault();
  const form=$('#vcn-form');
  if(!form.reportValidity())return;
  if(!state.selectedClient||!$('#vcn-id-cliente').value)return toast('Selecciona un cliente válido de la lista.',true);
  const idContacto=Number($('#vcn-contacto').value);
  const contacto=state.contacts.find(c=>Number(c.id_contacto)===idContacto);
  if(!contacto)return toast('Selecciona un contacto válido.',true);
  let equipos;
  try{equipos=equipmentPayload();}catch(error){return toast(error.message,true);}
  const fd=new FormData(form);
  const payload={
    nombre_proyecto:String(fd.get('nombre_proyecto')||'').trim(),
    id_cliente:Number(fd.get('id_cliente')),
    id_contacto:idContacto,
    cliente:state.selectedClient.nombre_empresa,
    contacto:contacto.nombre_contacto,
    telefono:String(fd.get('telefono')||'').trim()||null,
    correo:String(fd.get('correo')||'').trim(),
    ciudad:String(fd.get('ciudad')||'').trim()||null,
    estado:fd.get('estado')||null,
    tipo_proyecto:fd.get('tipo_proyecto')||null,
    equipos,
    numero_equipos:equipos.reduce((sum,row)=>sum+row.cantidad,0),
    tipo_equipos:equipos.map(row=>row.tipo_equipo).join(', ')||null,
    informacion_envia:String(fd.get('informacion_envia')||'').trim()||null,
    estatus_proyecto:fd.get('estatus_proyecto'),
    comentario:String(fd.get('comentario')||'').trim()||null,
    fecha_solicitud:new Date().toISOString(),
    id_asesor:state.selectedClient.id_asesor||null,
    asesor:state.selectedClient.iniciales||null
  };
  const btn=$('#vcn-save');
  btn.disabled=true;
  btn.textContent='Guardando...';
  try{
    const data=await request('/api/ventas/cotizaciones',{method:'POST',body:JSON.stringify(payload)});
    toast('Cotización creada correctamente.');
    setTimeout(()=>window.ManttoRouter?.go?.('ventas-cotizaciones',{openId:data.cotizacion?.id_cotizacion}),500);
  }catch(e){toast(e.message,true);}
  finally{btn.disabled=false;btn.textContent='Guardar cotización';}
}
function bind(){const search=$('#vcn-client-search');search.addEventListener('input',()=>{$('#vcn-id-cliente').value='';state.selectedClient=null;filterClients();});search.addEventListener('focus',filterClients);document.addEventListener('click',e=>{if(!e.target.closest('.vcn-combobox'))$('#vcn-client-options').hidden=true;});$('#vcn-contacto').onchange=e=>applyContact(e.target.value);$('#vcn-add-contact').onclick=openContact;$('#vcn-form').onsubmit=saveQuotation;$('#vcn-back').onclick=goBack;$('#vcn-cancel').onclick=goBack;$('#vcn-add-client').onclick=openNewClient;$('#vcn-add-equipment').onclick=addEquipmentRow;}
async function mount(payload){state.routePayload=payload||null;const view=$('#view-ventas-cotizaciones-nueva');if(!view)return false;if(view.dataset.ready!=='1'){const r=await fetch('./modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.html?v=20260805-equipos-multiples-v001',{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar Nueva cotización.');view.innerHTML=await r.text();view.dataset.ready='1';bind();try{await Promise.all([loadClients(),loadCatalogs()]);const selected=Number(state.routePayload?.selectedClientId);if(state.routePayload?.createdClient)restoreDraftAfterNewClient();if(selected&&state.clients.some(c=>Number(c.id_cliente)===selected))await selectClient(selected);}catch(e){toast(e.message,true);}}else{const selected=Number(state.routePayload?.selectedClientId);if(state.routePayload?.createdClient)restoreDraftAfterNewClient();if(selected){await loadClients();if(state.clients.some(c=>Number(c.id_cliente)===selected))await selectClient(selected);}}return true;}
window.ManttoVentasCotizacionesNueva={init:mount};
})();
