/**
 * BLT NOW | Cobranza UNITED | MP Zona 1 | Fase 8 V001 | 23/10/2026
 * Script INDEPENDIENTE para el primer planchado de DETALLE MP 2026 ZONA 1.
 * NO instala activadores ni modifica hojas. NO altera GC, VA ni MP principal.
 * Primero MPZ1_F8_ValidarPlanchado(); luego (si se autoriza) MPZ1_F8_ImportarPlanchado().
 * Los secretos se configuran SOLAMENTE en Propiedades del script.
 */
var MPZ1_F8_CONF = Object.freeze({
  path:'/api/cobranza-uni/detalle-mp-2026/zona-1/importacion-inicial',
  contract:'MP_ZONA1_INITIAL_V001',
  sourceDefault:'DETALLE MP 2026 ZONA 1',
  batchSize:20,
  maxRunMs:240000,
  lockWaitMs:30000,
  checkpointKey:'MPZ1_F8_CHECKPOINT_V001',
  importConfirmText:'AUTORIZO_PLANCHADO_INICIAL_MP_ZONA1'
});

var MPZ1_F8_GENERAL = Object.freeze([
  ['zona_adm','ZONA ADM','text'],
  ['proyecto','PROYECTO','text'],
  ['idns','ID','text'],
  ['cliente','CLIENTE','text'],
  ['periodicidad','PERIODICIDAD','text'],
  ['momento_facturacion','MOMENTO DE FACTURACIÓN','text'],
  ['estado','Estado','text'],
  ['z_oper','Z.Oper','text'],
  ['forma_pago','FORMA DE PAGO','text'],
  ['iguala','IGUALA','decimal'],
  ['condiciones_pago','CONDICIONES DE PAGO','text'],
  ['monto_anual','MONTO ANUAL','decimal'],
  ['pendiente_corriente','$ PENDIENTE CORRIENTE','decimal'],
  ['pendiente_vencido','$ PENDIENTE VENCIDO','decimal'],
  ['pendiente','$ PENDIENTE','decimal'],
  ['facturas_pendientes','N° DE FACTURAS PENDIENTES','int']
]);
var MPZ1_F8_INVOICE = Object.freeze([
  ['facturacion','FACTURACIÓN','text'],
  ['fecha_pago','FECHA DE PAGO','date'],
  ['estatus_factura','ESTATUS FACTURA','text'],
  ['fecha_factura','FECHA FACTURA','date'],
  ['numero_factura','NO. FACTURA','text'],
  ['vencimiento','VENCIMIENTO','date'],
  ['dias_vencimiento','DIAS DE VENCIMIENTO','int'],
  ['estatus','ESTATUS','text'],
  ['forma_pago','FORMA DE PAGO','text']
]);

function MPZ1_F8_Contrato_(){
  var all=MPZ1_F8_GENERAL.map(function(x){return x.slice();});
  for(var block=1;block<=12;block++){
    var suffix=('0'+block).slice(-2);
    MPZ1_F8_INVOICE.forEach(function(item){
      var label=item[1];
      if(block===1&&item[0]==='forma_pago')label='FOMA DE PAGO';
      if(block===4&&item[0]==='estatus_factura')label='ESTATUS DE FACTURA';
      if(block>=7&&item[0]==='fecha_factura')label='FECHA DE FACTURA';
      all.push([item[0]+'_'+suffix,label,item[2]]);
    });
  }
  if(all.length!==124)throw new Error('Error del contrato: 124 columnas requeridas.');
  return all;
}
function MPZ1_F8_Prop_(key,required){
  var v=String(PropertiesService.getScriptProperties().getProperty(key)||'').trim();
  if(required&&!v)throw new Error('Falta propiedad de script: '+key);
  return v;
}
function MPZ1_F8_Header_(value){
  return String(value===null||value===undefined?'':value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
}
function MPZ1_F8_Identidad_(value){
  return String(value===null||value===undefined?'':value).trim().normalize('NFC').toUpperCase();
}
function MPZ1_F8_ComprobarHeaders_(recibidos,expected,title){
  for(var i=0;i<expected.length;i++){
    if(MPZ1_F8_Header_(recibidos[i])!==MPZ1_F8_Header_(expected[i]))
      throw new Error(title+' encabezado '+(i+1)+': se esperaba "'+expected[i]+'". Revisar hoja antes de importar.');
  }
}
function MPZ1_F8_Id_(value,fila){
  var text=String(value===null||value===undefined?'':value).trim();
  var max='9223372036854775807';
  if(!/^[1-9][0-9]{0,18}$/.test(text)||text.length>max.length||
     (text.length===max.length&&text>max))
    throw new Error('Consecutivo inválido en hoja principal, fila '+fila);
  return text;
}
function MPZ1_F8_MapaPrincipal_(sheet,headerRow){
  if(sheet.getLastColumn()<4)throw new Error('Hoja principal sin A:D.');
  var head=sheet.getRange(headerRow,1,1,4).getDisplayValues()[0];
  if(MPZ1_F8_Header_(head[0])!=='CONSECUTIVO'||
     MPZ1_F8_Header_(head[2])!=='PROYECTO'||MPZ1_F8_Header_(head[3])!=='ID')
    throw new Error('Principal debe tener A=Consecutivo, C=PROYECTO, D=ID en fila de encabezados.');
  var map=Object.create(null), ids=Object.create(null);
  var count=Math.max(0,sheet.getLastRow()-headerRow);
  if(!count)throw new Error('Hoja principal sin registros.');
  var data=sheet.getRange(headerRow+1,1,count,4).getDisplayValues();
  data.forEach(function(row,index){
    var name=MPZ1_F8_Identidad_(row[2]),idns=MPZ1_F8_Identidad_(row[3]);
    if(!name&&!idns&&!String(row[0]).trim())return;
    if(!name||!idns)throw new Error('Principal sin PROYECTO/ID en fila '+(headerRow+index+1));
    var id=MPZ1_F8_Id_(row[0],headerRow+index+1);
    var key=name+'\u001f'+idns;
    if(Object.prototype.hasOwnProperty.call(map,key)||ids[id]!==undefined)
      throw new Error('Principal contiene identidad o Consecutivo duplicado: fila '+(headerRow+index+1));
    map[key]=id;ids[id]=true;
  });
  return map;
}
function MPZ1_F8_Valor_(value,kind,tz,fila,campo){
  if(value===null||value===undefined||value==='')return null;
  if(value instanceof Date){
    if(kind!=='date'||isNaN(value.getTime()))throw new Error('Fecha no admitida: fila '+fila+', campo '+campo);
    return Utilities.formatDate(value,tz,'yyyy-MM-dd');
  }
  if(typeof value==='string'&&/^#(?:N\/A|REF!|VALUE!|DIV\/0!|ERROR!|NUM!)/i.test(value.trim()))
    throw new Error('Error de formula Sheets en fila '+fila+', campo '+campo);
  if(kind==='date'){
    var d=String(value).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error('Fecha debe estar como Date o AAAA-MM-DD: fila '+fila+', '+campo);
    var a=d.split('-').map(Number),date=new Date(Date.UTC(a[0],a[1]-1,a[2]));
    if(date.getUTCFullYear()!==a[0]||date.getUTCMonth()!==a[1]-1||date.getUTCDate()!==a[2])
      throw new Error('Fecha inexistente en fila '+fila+', '+campo);
    return d;
  }
  if(kind==='decimal'){
    if(typeof value==='number'){
      if(!isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER||
         Math.abs(value-Math.round(value*100)/100)>0.0000001)
        throw new Error('Decimal no seguro o con más de 2 decimales: fila '+fila+', '+campo);
      return value.toFixed(2);
    }
    var v=String(value).trim();
    if(!/^-?\d{1,20}(?:\.\d{1,2})?$/.test(v))
      throw new Error('Importe no interpretable (no usar separador de miles): fila '+fila+', '+campo);
    return v;
  }
  if(kind==='int'){
    if(typeof value==='number'&&(!Number.isSafeInteger(value)||!isFinite(value)))
      throw new Error('Entero invalido: fila '+fila+', '+campo);
    var n=String(value).trim();
    if(!/^-?\d{1,12}$/.test(n))throw new Error('Entero invalido: fila '+fila+', '+campo);
    return n;
  }
  var text=String(value).trim();
  if(!text)return null;
  if(/[\u0000-\u001f\u007f]/.test(text))throw new Error('Texto no admitido: fila '+fila+', '+campo);
  return text;
}
function MPZ1_F8_Leer_(){
  var book=SpreadsheetApp.openById(MPZ1_F8_Prop_('MPZ1_F8_SPREADSHEET_ID',true));
  var mainName=MPZ1_F8_Prop_('MPZ1_F8_MAIN_SHEET_NAME',true);
  var zonaName=MPZ1_F8_Prop_('MPZ1_F8_ZONE_SHEET_NAME',false)||MPZ1_F8_CONF.sourceDefault;
  var main=book.getSheetByName(mainName),zona=book.getSheetByName(zonaName);
  if(!main||!zona||main.getSheetId()===zona.getSheetId())throw new Error('Falta una de las dos hojas o son la misma.');
  var rowMain=Number(MPZ1_F8_Prop_('MPZ1_F8_MAIN_HEADER_ROW',false)||1);
  var rowZona=Number(MPZ1_F8_Prop_('MPZ1_F8_ZONE_HEADER_ROW',false)||1);
  if(!Number.isSafeInteger(rowMain)||rowMain<1||!Number.isSafeInteger(rowZona)||rowZona<1)
    throw new Error('Filas de encabezado invalidas.');
  var contract=MPZ1_F8_Contrato_();
  if(zona.getLastColumn()<contract.length)throw new Error('Zona1 no tiene las 124 columnas A:DT.');
  var header=zona.getRange(rowZona,1,1,contract.length).getDisplayValues()[0];
  MPZ1_F8_ComprobarHeaders_(header,contract.map(function(a){return a[1];}),'Zona1');
  var map=MPZ1_F8_MapaPrincipal_(main,rowMain);
  var count=Math.max(0,zona.getLastRow()-rowZona);
  if(!count)throw new Error('Zona1 sin datos para importar.');
  var values=zona.getRange(rowZona+1,1,count,contract.length).getValues();
  var identities=zona.getRange(rowZona+1,1,count,4).getDisplayValues();
  var tz=book.getSpreadsheetTimeZone()||'America/Mexico_City';
  var used=Object.create(null),out=[];
  values.forEach(function(row,index){
    var fila=rowZona+index+1;
    if(row.every(function(v){return v===''||v===null||v===undefined;}))return;
    var pr=MPZ1_F8_Identidad_(identities[index][1]);
    var idns=MPZ1_F8_Identidad_(identities[index][2]);
    if(!pr||!idns)throw new Error('Zona1 requiere PROYECTO e ID en fila '+fila);
    var id=map[pr+'\u001f'+idns];
    if(!id)throw new Error('Zona1 fila '+fila+': no hay correspondencia única PROYECTO+ID en principal.');
    if(used[id])throw new Error('Zona1 tiene mas de una fila para id_dmp '+id+'. Revisar filas '+used[id]+' y '+fila);
    used[id]=fila;
    var data=Object.create(null);
    contract.forEach(function(item,col){
      var v=col===2?identities[index][2]:row[col];
      data[item[0]]=MPZ1_F8_Valor_(v,item[2],tz,fila,item[0]);
    });
    out.push({id_dmp:id,sheet_row:fila,data:data});
  });
  if(!out.length)throw new Error('Sin filas utiles para enviar.');
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(out),Utilities.Charset.UTF_8);
  var hash=digest.map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');
  return {hash:hash,rows:out};
}
function MPZ1_F8_HTTP_(body){
  var base=MPZ1_F8_Prop_('MPZ1_F8_API_BASE_URL',true).replace(/\/+$/,'');
  if(!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(base))
    throw new Error('MPZ1_F8_API_BASE_URL debe ser origen HTTPS sin ruta ni query.');
  var path=MPZ1_F8_CONF.path;
  var id=MPZ1_F8_Prop_('MPZ1_F8_INTEGRATION_ID',true);
  var secret=MPZ1_F8_Prop_('MPZ1_F8_INTEGRATION_SECRET',true);
  var payload=JSON.stringify(body);
  var timestamp=String(Math.floor(Date.now()/1000));
  var canonical=timestamp+'\nPOST\n'+path+'\n'+payload;
  var bytes=Utilities.computeHmacSha256Signature(canonical,secret,Utilities.Charset.UTF_8);
  var signature=bytes.map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');
  var headers={
    'X-Integration-Id':id,
    'X-Integration-Timestamp':timestamp,
    'X-Integration-Signature':signature
  };
  for(var attempt=1;attempt<=3;attempt++){
    var resp=UrlFetchApp.fetch(base+path,{
      method:'post',payload:payload,contentType:'application/json',headers:headers,
      muteHttpExceptions:true,followRedirects:false
    });
    var code=resp.getResponseCode(),text=resp.getContentText();
    if(code>=200&&code<300){
      var parsed;
      try{parsed=JSON.parse(text);}catch(_e){throw new Error('JSON no valido de API.');}
      if(parsed.ok!==true||parsed.batch_id!==body.batch_id||parsed.total!==body.rows.length||
         parsed.table!=='detalle_mp_2026_zona_1'||!Array.isArray(parsed.results))
        throw new Error('Respuesta no coincide con el lote enviado.');
      return parsed;
    }
    // El servidor no es idempotente via batch_id sino por id_dmp+contenido.
    // Los reintentos son seguros: la API solo inserta nuevas filas o compara las existentes.
    if((code===429||code>=500)&&attempt<3){Utilities.sleep(1000*attempt);continue;}
    var reason='HTTP '+code;
    try{var err=JSON.parse(text);reason+=' · '+String(err.code||'')+' '+String(err.message||'');}
    catch(_ignore){}
    throw new Error('Fallo de importacion '+reason);
  }
  throw new Error('Sin respuesta final de API.');
}
function MPZ1_F8_Ejecutar_(mode){
  var lock=LockService.getScriptLock();lock.waitLock(MPZ1_F8_CONF.lockWaitMs);
  var started=Date.now();
  try{
    if(mode==='import'&&MPZ1_F8_Prop_('MPZ1_F8_IMPORT_CONFIRM',true)!==MPZ1_F8_CONF.importConfirmText)
      throw new Error('Importacion no autorizada desde Propiedades del script.');
    var source=MPZ1_F8_Leer_();
    var props=PropertiesService.getScriptProperties();
    var ck=props.getProperty(MPZ1_F8_CONF.checkpointKey);
    var start=0;
    if(mode==='import'&&ck){
      var old=JSON.parse(ck);
      if(old.hash!==source.hash)throw new Error('Sheets cambio desde el checkpoint. Validar y restablecer checkpoint explicitamente.');
      start=old.offset;
      if(!Number.isSafeInteger(start)||start<0||start>source.rows.length)
        throw new Error('Checkpoint inconsistente.');
    }
    var summary={ok:true,mode:mode,snapshot_prefix:source.hash.slice(0,12),
      total:source.rows.length,created:0,already_imported:0,ready_to_insert:0,offset:start};
    for(var offset=start;offset<source.rows.length;offset+=MPZ1_F8_CONF.batchSize){
      if(Date.now()-started>MPZ1_F8_CONF.maxRunMs)
        throw new Error('Fin de ventana GAS; reanudar con la misma hoja y checkpoint.');
      var batch=source.rows.slice(offset,offset+MPZ1_F8_CONF.batchSize);
      var result=MPZ1_F8_HTTP_({contract:MPZ1_F8_CONF.contract,batch_id:source.hash,mode:mode,rows:batch});
      var bad=result.results.filter(function(r){return ![
        'ready_to_insert','already_imported','created'
      ].includes(r.status);});
      if(bad.length||result.ready!==true)
        throw new Error('Conciliacion detenida. Lote offset='+offset+'; estados rechazados='+
          JSON.stringify(bad.slice(0,10)));
      summary.created+=Number(result.created||0);
      summary.already_imported+=Number(result.already_imported||0);
      summary.ready_to_insert+=result.results.filter(function(r){return r.status==='ready_to_insert';}).length;
      summary.offset=Math.min(offset+batch.length,source.rows.length);
      if(mode==='import')props.setProperty(MPZ1_F8_CONF.checkpointKey,
        JSON.stringify({hash:source.hash,offset:summary.offset}));
      console.log('[MPZ1_F8] '+mode+' lote '+summary.offset+'/'+source.rows.length);
    }
    if(mode==='import')props.deleteProperty(MPZ1_F8_CONF.checkpointKey);
    console.log('[MPZ1_F8] FIN '+JSON.stringify(summary));
    return summary;
  }finally{lock.releaseLock();}
}
/** Paso 1: autentica y consulta Aiven sin modificar absolutamente ninguna tabla. */
function MPZ1_F8_ValidarPlanchado(){return MPZ1_F8_Ejecutar_('preview');}
/** Paso 2: solo tras autorizacion expresa, 2 flags Azure y propiedad de GAS. */
function MPZ1_F8_ImportarPlanchado(){return MPZ1_F8_Ejecutar_('import');}
/** Borrado explicito SOLO del checkpoint; no elimina datos de Aiven ni Sheets. */
function MPZ1_F8_ResetearCheckpoint(){
  PropertiesService.getScriptProperties().deleteProperty(MPZ1_F8_CONF.checkpointKey);
  return 'Checkpoint de Fase 8 reiniciado (ningun registro de Aiven modificado).';
}
