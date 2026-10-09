#!/usr/bin/env node
'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
// Solo GET explicitos; opt-in por --readonly. Sin escrituras ni valores operativos impresos.
const assert = require('node:assert/strict');
const ROOT = '/api/instalaciones/administracion';
const ACCESS = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const EDIT = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR';

function parseArgs_cor(args) {
  const out={readonly:false,baseUrl:null,recordId:null,deniedRecordId:null};
  const pairs = {'--base-url':'baseUrl','--record-id':'recordId','--denied-record-id':'deniedRecordId'};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--readonly'){out.readonly=true;continue;}
    const name=pairs[args[i]];
    if(!name || !args[i+1] || args[i+1].startsWith('--'))throw new Error('Argumentos invalidos. Solo --readonly --base-url URL [--record-id ID] [--denied-record-id ID].');
    out[name]=args[++i];
  }
  if(!out.readonly || !out.baseUrl)throw new Error('Requiere --readonly y --base-url; no se envio ninguna peticion.');
  const url=new URL(out.baseUrl);
  const localhost=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!((url.protocol==='https:')||(localhost&&url.protocol==='http:'))||url.username||url.password||
    url.search||url.hash||url.pathname!=='/')throw new Error('URL debe ser origen HTTPS sin credenciales/rutas (HTTP solo localhost).');
  out.baseUrl=url.origin;
  for(const name of ['recordId','deniedRecordId']){
    if(out[name]===null)continue;
    const n=Number(out[name]);
    if(!Number.isSafeInteger(n)||n<1)throw new Error(name+' debe ser entero positivo.');
    out[name]=n;
  }
  return out;
}

function visibleFields_cor(contract){
  const fields=new Set(['id_ins_fl','created_at','updated_at']);
  for(const group of contract.groups||[]){
    if(group.permissions?.can_view!==true)continue;
    for(const f of group.fields||[])fields.add(f);
  }
  return fields;
}
function checkRecord_cor(record,contract){
  assert.ok(record&&typeof record==='object'&&!Array.isArray(record),'respuesta de registro invalida');
  const allowed=visibleFields_cor(contract);
  for(const field of Object.keys(record))assert.ok(allowed.has(field),'columna no autorizada en detalle: '+field);
  assert.ok(Number.isSafeInteger(Number(record.id_ins_fl))&&Number(record.id_ins_fl)>0,'ID de registro faltante');
}

async function smoke_cor(opts,dependencies={}){
  const token=String(dependencies.token??process.env.MANTTO_QA_TOKEN??'').trim();
  const denied=String(dependencies.deniedToken??process.env.MANTTO_QA_DENIED_TOKEN??'').trim();
  const viewer=String(dependencies.viewerToken??process.env.MANTTO_QA_READONLY_TOKEN??'').trim();
  const device=String(dependencies.deviceToken??process.env.MANTTO_QA_DEVICE_TOKEN??'').trim();
  const fetcher=dependencies.fetch||globalThis.fetch;
  if(!token)throw new Error('Define MANTTO_QA_TOKEN en entorno; no incluir JWT en URL ni linea de comandos.');
  if(typeof fetcher!=='function')throw new Error('Requiere Node.js con fetch.');
  const checked=[],skipped=[];
  async function get(path,accessToken){
    const headers={Accept:'application/json','Cache-Control':'no-store'};
    if(accessToken)headers.Authorization='Bearer '+accessToken;
    if(accessToken&&device)headers['X-Device-Token']=device;
    const res=await fetcher(opts.baseUrl+path,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data=await res.json().catch(()=>null);
    return {status:res.status,data};
  }
  function check(testName,condition){assert.ok(condition,testName);checked.push(testName);}
  const guest=await get(ROOT+'/contrato','');
  check('sin token no ve contrato',guest.status===401||guest.status===403);
  const owner=await get(ROOT+'/contrato',token);
  check('contrato autorizado',owner.status===200&&owner.data?.ok===true);
  const contract=owner.data;
  const groups=contract.groups;
  check('contrato 11 grupos, 93 campos sin duplicados',Array.isArray(groups)&&groups.length===11&&
    groups.reduce((a,g)=>a+(g.fields?.length||0),0)===93&&
    new Set(groups.flatMap(g=>g.fields||[])).size===93);
  check('acceso visual y permiso EDITAR separados',contract.access_permission===ACCESS&&contract.full_edit_permission===EDIT);
  check('tecnicos excluidos de edición',Array.isArray(contract.system_readonly_fields)&&
    ['id_ins_fl','created_at','updated_at'].every(f=>contract.system_readonly_fields.includes(f)&&
      groups.every(g=>!(g.editable_fields||[]).includes(f))));
  check('permiso EDITAR permite 93 campos en las 11 secciones',groups.every(g=>g.permissions?.can_edit===true&&
    g.permissions?.can_view===true&&g.editable_fields?.length===g.fields?.length));
  if(opts.recordId){
    const detail=await get(ROOT+'/registros/'+opts.recordId,token);
    check('detalle dentro de scope',detail.status===200&&detail.data?.ok===true);
    checkRecord_cor(detail.data.data,contract);
    check('ID correcto del equipo',Number(detail.data.data.id_ins_fl)===opts.recordId);
  }else skipped.push('detalle: especificar --record-id de QA para validar projection');
  if(opts.deniedRecordId){
    const detail=await get(ROOT+'/registros/'+opts.deniedRecordId,token);
    check('fuera de scope no expone registro',[403,404].includes(detail.status));
  }else skipped.push('alcance negativo: especificar --denied-record-id fuera de scope');
  if(viewer){
    const readonly=await get(ROOT+'/contrato',viewer);
    check('usuario de solo lectura recibe contrato',readonly.status===200&&readonly.data?.ok===true);
    check('solo lectura no declara campos editables',readonly.data.groups.every(g=>g.permissions?.can_edit!==true));
  }else skipped.push('permiso solo lectura: definir MANTTO_QA_READONLY_TOKEN');
  if(denied){
    const closed=await get(ROOT+'/contrato',denied);
    check('usuario sin acceso no ve modulo',closed.status===403);
  }else skipped.push('denegacion de acceso: definir MANTTO_QA_DENIED_TOKEN');
  return {checked,skipped};
}

async function main_cor(args=process.argv.slice(2)){
  const options=parseArgs_cor(args);
  const result=await smoke_cor(options);
  for(const check of result.checked)console.log('PASS '+check);
  for(const skipped of result.skipped)console.log('NO EJECUTADO '+skipped);
  console.log('FINALIZADO. Solo GET; '+result.checked.length+' controles de lectura.');
}
if(require.main===module)main_cor().catch(error=>{console.error('QA SOLO LECTURA:',String(error?.message||'fallo').slice(0,180));process.exitCode=1;});
module.exports={parseArgs_cor,visibleFields_cor,checkRecord_cor,smoke_cor,main_cor};
