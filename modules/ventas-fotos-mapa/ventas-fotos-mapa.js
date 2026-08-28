(function(){
'use strict';
// [Aster | 2026-08-19 | ASTER-MG | FASE 3 VENTAS: Fotos Mapa por puerta VENTAS]
let proyectos=[];
const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
const slots=['FOTO BLT','FOTO BLT 2','FOTO BLT 3','FOTO BLT 4','FOTO BLT 5','FOTO BLT 6','FOTO BLT 7'];
const dbMap={'FOTO BLT':'foto_blt_1','FOTO BLT 2':'foto_blt_2','FOTO BLT 3':'foto_blt_3','FOTO BLT 4':'foto_blt_4','FOTO BLT 5':'foto_blt_5','FOTO BLT 6':'foto_blt_6','FOTO BLT 7':'foto_blt_7'};
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const headers=()=>Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
async function getJson(path){const r=await fetch(API+path,{headers:headers(),cache:'no-store'});const t=await r.text();let j;try{j=t?JSON.parse(t):{};}catch(e){throw new Error('El backend respondió contenido no JSON.');}if(!r.ok||j.ok===false)throw new Error(j.message||j.error||('Error HTTP '+r.status));return j;}
function info(url,campo){if(!url||/\.heic(\?|$)/i.test(String(url)))return null;return{url:String(url),campo};}
function fotos(p){return slots.map(s=>info(p[s],s)).filter(Boolean);}
function principal(p){const direct=String(p.foto_portada||'').trim();if(/^https?:\/\//i.test(direct))return info(direct,null);const sel=String(p.foto_principal||p['Foto Principal']||'').trim();const ui=Object.keys(dbMap).find(k=>dbMap[k]===sel);return(ui&&info(p[ui],ui))||fotos(p)[0]||null;}
function build(rows){const map=new Map();rows.forEach(r=>{const id=String(r.id_proyecto||'').trim();if(!id)return;if(!map.has(id))map.set(id,{id,proyecto:r.proyecto||'',estado:r.estado||'',cliente:r.cliente||'',equipos:0});map.get(id).equipos++;});return[...map.values()];}
function carouselFotos(p){return slots.map((slot,index)=>{const item=info(p[slot],dbMap[slot]);if(item)item.label='Foto '+(index+1);return item;}).filter(Boolean);}
function openPhotoCarousel(p){
  const photos=carouselFotos(p);
  if(!photos.length)return;
  if(!window.ManttoDetails||typeof window.ManttoDetails.openProjectPhotos!=='function'){
    window.alert('No fue posible abrir el carrusel de fotografías.');
    return;
  }
  const main=principal(p);
  window.ManttoDetails.openProjectPhotos(
    p.id||p.proyecto,
    p.proyecto,
    photos,
    (main&&main.url)||photos[0].url,
    {
      showProjectLink:true,
      projectOptions:{template:'cliente-unificado',source:'ventas-fotos-mapa',projectName:p.proyecto,cliente:p.cliente||''},
      onPhotoChange:change=>{
        const item=change&&change.item;
        if(item&&item.campo&&item.url){
          const ui=Object.keys(dbMap).find(key=>dbMap[key]===item.campo);
          if(ui)p[ui]=item.url;
          if(change.type==='principal'||change.principalUrl===item.url)p.foto_principal=item.campo;
        }
        if(change&&change.principalUrl)p.foto_portada=change.principalUrl;
        render();
      }
    }
  );
}
function populate(){const vals=[...new Set(proyectos.filter(p=>fotos(p).length).map(p=>p.estado).filter(Boolean))].sort();const el=document.getElementById('vfm-estado');el.innerHTML='<option value="">Todos los estados</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');}
function render(){
  const total=proyectos.length;
  const withPhoto=proyectos.filter(p=>fotos(p).length).length;
  document.getElementById('vfm-kpis').innerHTML='<div class="py-card"><div class="label">Proyectos con fotografía</div><div class="value" style="color:var(--accent)">'+withPhoto+'</div></div><div class="py-card"><div class="label">% del total</div><div class="value">'+(total?Math.round(withPhoto/total*100):0)+'%</div></div>';
  const q=(document.getElementById('vfm-buscar')?.value||'').trim().toUpperCase();
  const state=document.getElementById('vfm-estado')?.value||'';
  const box=document.getElementById('vfm-galeria');
  let rows=proyectos.filter(p=>fotos(p).length && (!state || p.estado===state));
  if(q)rows=rows.filter(p=>[p.proyecto,p.id,p.cliente].some(v=>String(v||'').toUpperCase().includes(q)));
  rows.sort((a,b)=>String(a.estado||'').localeCompare(String(b.estado||''),'es',{sensitivity:'base'}) || String(a.proyecto).localeCompare(String(b.proyecto),'es',{sensitivity:'base'}));
  if(!rows.length){box.innerHTML='<div class="py-empty">No hay proyectos con fotografías para los criterios seleccionados.</div>';return;}
  const grupos=new Map();
  rows.forEach(p=>{const key=String(p.estado||'Sin estado').trim()||'Sin estado';if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(p);});
  box.innerHTML=[...grupos.entries()].map(([estado,items])=>'<div class="py-foto-grupo"><div class="py-foto-grupo-title">'+esc(estado)+' <span class="count">('+items.length+')</span></div><div class="py-foto-mosaico">'+items.map(p=>{const img=principal(p);return img?'<div class="py-foto-tile" role="button" tabindex="0" data-project-id="'+esc(p.id)+'"><img src="'+esc(img.url)+'" loading="lazy" alt="'+esc(p.proyecto)+'"><div class="nombre">'+esc(p.proyecto)+'</div><div class="n-fotos">'+fotos(p).length+' foto(s)</div></div>':'';}).join('')+'</div></div>').join('');
  box.querySelectorAll('[data-project-id]').forEach(el=>{
    const p=rows.find(x=>String(x.id)===String(el.dataset.projectId));
    if(!p)return;
    el.addEventListener('click',()=>openPhotoCarousel(p));
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhotoCarousel(p);}});
  });
}
async function load(){const [e,f]=await Promise.all([getJson('/api/ventas/fotos-mapa/proyectos?limit=5000'),getJson('/api/ventas/fotos-mapa/proyectos/fotografias?limit=5000').catch(()=>({data:[]}))]);proyectos=build(Array.isArray(e.data)?e.data:[]);const photoMap=new Map((Array.isArray(f.data)?f.data:[]).map(x=>[String(x['ID Proyecto']||'').trim(),x]));proyectos.forEach(p=>Object.assign(p,photoMap.get(p.id)||{}));populate();render();const s=document.getElementById('vfm-aiven-status');if(s)s.innerHTML='<span class="py-connection-dot"></span><span>Aiven conectado · '+proyectos.filter(p=>fotos(p).length).length+' con foto</span>';}
async function mount(force){const view=document.getElementById('view-ventas-fotos-mapa');if(!view)return false;if(force)view.dataset.ready='0';if(view.dataset.ready!=='1'){const r=await fetch('./modules/ventas-fotos-mapa/ventas-fotos-mapa.html?v=20260725-v001',{cache:'default'});if(!r.ok)throw new Error('No se pudo cargar Fotos Mapa.');view.innerHTML=await r.text();view.dataset.ready='1';document.getElementById('vfm-buscar')?.addEventListener('input',render);document.getElementById('vfm-estado')?.addEventListener('change',render);await load();}return true;}
window.ManttoVentasFotosMapa={init:()=>mount(false),reload:()=>load()};
})();
