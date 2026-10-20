(function(){
  'use strict';

  if(window.ManttoOfflineStorage)return;

  const DB_NAME='mantto-offline-v2';
  const DB_VERSION=1;
  const SNAPSHOT_STORE='snapshots';
  const METADATA_STORE='metadata';
  const DIAGNOSTIC_STORE='diagnostics';
  const OUTBOX_STORE='outbox';
  const OFFLINE_PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const ACCESS_PREFIX='mantto:offline-access:';
  const ACCESS_TTL_MS=24*60*60*1000;
  const MANAGED_LOCAL_PREFIXES=['mantto:offline-access:','mantto:offline-pending:'];

  function requestResult(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Falló una operación de IndexedDB.'));
    });
  }

  function transactionDone(transaction){
    return new Promise((resolve,reject)=>{
      transaction.oncomplete=()=>resolve(true);
      transaction.onabort=()=>reject(transaction.error||new Error('La transacción local fue cancelada.'));
      transaction.onerror=()=>reject(transaction.error||new Error('Falló la transacción local.'));
    });
  }

  function openDatabase(){
    if(!window.indexedDB)return Promise.reject(new Error('Este navegador no ofrece IndexedDB.'));
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.open(DB_NAME,DB_VERSION);
      request.onerror=()=>reject(request.error||new Error('No fue posible abrir el almacenamiento offline.'));
      request.onblocked=()=>reject(new Error('El almacenamiento offline está bloqueado por otra pestaña.'));
      request.onupgradeneeded=event=>{
        const database=event.target.result;
        if(!database.objectStoreNames.contains(SNAPSHOT_STORE)){
          const snapshots=database.createObjectStore(SNAPSHOT_STORE,{keyPath:'partition_key'});
          snapshots.createIndex('effective_user_id','effective_user_id',{unique:false});
          snapshots.createIndex('dataset','dataset',{unique:false});
        }
        if(!database.objectStoreNames.contains(METADATA_STORE))database.createObjectStore(METADATA_STORE,{keyPath:'key'});
        if(!database.objectStoreNames.contains(DIAGNOSTIC_STORE))database.createObjectStore(DIAGNOSTIC_STORE,{keyPath:'key'});
        if(!database.objectStoreNames.contains(OUTBOX_STORE)){
          const outbox=database.createObjectStore(OUTBOX_STORE,{keyPath:'id'});
          outbox.createIndex('status','status',{unique:false});
        }
      };
      request.onsuccess=()=>resolve(request.result);
    });
  }

  function positiveId(value,label){
    const parsed=Number(value);
    if(!Number.isSafeInteger(parsed)||parsed<=0)throw new Error(`Falta ${label} para separar la copia offline.`);
    return parsed;
  }

  function cleanCode(value,label){
    const clean=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
    if(!clean)throw new Error(`Falta ${label} para separar la copia offline.`);
    return clean;
  }

  function normalizeContext(context){
    const actorUserId=positiveId(context?.actor_user_id||context?.actorUserId,'el usuario actor');
    const effectiveUserId=positiveId(context?.effective_user_id||context?.effectiveUserId,'el usuario efectivo');
    const domain=cleanCode(context?.domain,'el dominio');
    const dataset=cleanCode(context?.dataset,'el conjunto de datos');
    return {
      actor_user_id:actorUserId,
      effective_user_id:effectiveUserId,
      domain,
      dataset,
      partition_key:`${actorUserId}:${effectiveUserId}:${domain}:${dataset}`
    };
  }

  function payloadSize(payload){
    try{return new Blob([JSON.stringify(payload)]).size;}catch(_error){return 0;}
  }

  function inferredRecordCount(payload){
    const data=payload?.data||payload||{};
    if(Array.isArray(data))return data.length;
    return Object.values(data).reduce((total,value)=>total+(Array.isArray(value)?value.length:0),0);
  }

  async function saveSnapshot(context,payload,metadata){
    const partition=normalizeContext(context);
    const now=new Date().toISOString();
    const row=Object.assign({},partition,{
      schema_version:1,
      read_only:true,
      downloaded_at:now,
      source_updated_at:metadata?.source_updated_at||payload?.generated_at||null,
      record_count:Number.isFinite(Number(metadata?.record_count))?Number(metadata.record_count):inferredRecordCount(payload),
      byte_size:payloadSize(payload),
      payload
    });
    const database=await openDatabase();
    try{
      const transaction=database.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite');
      transaction.objectStore(SNAPSHOT_STORE).put(row);
      transaction.objectStore(METADATA_STORE).put({
        key:`snapshot:${partition.partition_key}`,
        partition_key:partition.partition_key,
        downloaded_at:row.downloaded_at,
        source_updated_at:row.source_updated_at,
        record_count:row.record_count,
        byte_size:row.byte_size,
        read_only:true
      });
      await transactionDone(transaction);
      return row;
    }finally{database.close();}
  }

  async function getSnapshot(context){
    const partition=normalizeContext(context);
    const database=await openDatabase();
    try{
      const transaction=database.transaction(SNAPSHOT_STORE,'readonly');
      const row=await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(partition.partition_key));
      await transactionDone(transaction);
      return row||null;
    }finally{database.close();}
  }

  async function listSnapshots(filter){
    const actorUserId=positiveId(filter?.actor_user_id||filter?.actorUserId,'el usuario actor');
    const effectiveUserId=positiveId(filter?.effective_user_id||filter?.effectiveUserId,'el usuario efectivo');
    const database=await openDatabase();
    try{
      const transaction=database.transaction(SNAPSHOT_STORE,'readonly');
      const rows=await requestResult(transaction.objectStore(SNAPSHOT_STORE).getAll());
      await transactionDone(transaction);
      return (rows||[]).filter(row=>row.actor_user_id===actorUserId&&row.effective_user_id===effectiveUserId);
    }finally{database.close();}
  }

  async function healthCheck(){
    const database=await openDatabase();
    const marker=(window.crypto?.randomUUID?.()||`offline-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try{
      const transaction=database.transaction(DIAGNOSTIC_STORE,'readwrite');
      const store=transaction.objectStore(DIAGNOSTIC_STORE);
      await requestResult(store.put({key:'health-check',marker,created_at:new Date().toISOString()}));
      const saved=await requestResult(store.get('health-check'));
      if(saved?.marker!==marker){
        try{transaction.abort();}catch(_error){}
        throw new Error('El registro técnico no pudo verificarse.');
      }
      await requestResult(store.delete('health-check'));
      await transactionDone(transaction);
      return true;
    }finally{database.close();}
  }

  async function outboxStatus(){
    const database=await openDatabase();
    try{
      const transaction=database.transaction(OUTBOX_STORE,'readonly');
      const count=await requestResult(transaction.objectStore(OUTBOX_STORE).count());
      await transactionDone(transaction);
      return {enabled:false,count:Number(count||0),reason:'La sincronización con Aiven requiere la fase de aprobación F8/F9.'};
    }finally{database.close();}
  }

  function clearManagedLocalState(){
    for(let index=localStorage.length-1;index>=0;index-=1){
      const key=localStorage.key(index);
      if(key&&MANAGED_LOCAL_PREFIXES.some(prefix=>key.startsWith(prefix)))localStorage.removeItem(key);
    }
  }

  function readCachedAccess(actorUserId,effectiveUserId){
    const actor=Number(actorUserId);
    const effective=Number(effectiveUserId);
    if(!Number.isSafeInteger(actor)||actor<=0||!Number.isSafeInteger(effective)||effective<=0)return null;
    try{
      const cached=JSON.parse(localStorage.getItem(`${ACCESS_PREFIX}${actor}:${effective}`)||'null');
      const savedAt=new Date(cached?.saved_at||0).getTime();
      const data=cached?.data;
      if(!data||Date.now()-savedAt>ACCESS_TTL_MS)return null;
      if(data.permission_code!==OFFLINE_PERMISSION||Number(data.effective_user_id)!==effective)return null;
      return data;
    }catch(_error){return null;}
  }

  async function purgeAll(){
    clearManagedLocalState();
    if(!window.indexedDB)return true;
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess=()=>resolve(true);
      request.onerror=()=>reject(request.error||new Error('No fue posible purgar la copia offline.'));
      request.onblocked=()=>resolve(false);
    });
  }

  document.addEventListener('mantto:logout',()=>{
    purgeAll().catch(error=>console.warn('[Modo Offline] No fue posible purgar IndexedDB al cerrar sesión.',error));
  });

  window.ManttoOfflineStorage={
    databaseName:DB_NAME,
    normalizeContext,
    saveSnapshot,
    getSnapshot,
    listSnapshots,
    healthCheck,
    outboxStatus,
    readCachedAccess,
    hasCachedAccess(actorUserId,effectiveUserId){return Boolean(readCachedAccess(actorUserId,effectiveUserId));},
    purgeAll
  };
})();
