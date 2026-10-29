(function(){
  'use strict';
  // [Lumbre | 2026-10-29 | LUMBRE-MG | CADUCIDAD_PURGA_AISLAMIENTO_OFFLINE_V001]
  if(window.ManttoOfflineStorage)return;

  const DB_NAME='mantto-offline-v2';
  const DB_VERSION=2;
  const SNAPSHOT_STORE='snapshots';
  const METADATA_STORE='metadata';
  const DIAGNOSTIC_STORE='diagnostics';
  const OUTBOX_STORE='outbox';
  const CHUNK_STORE='backup_chunks';
  const OFFLINE_PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const ACCESS_PREFIX='mantto:offline-access:';
  const ACCESS_TTL_MS=24*60*60*1000;
  const SNAPSHOT_TTL_MS=7*24*60*60*1000;
  const DRAFT_TTL_MS=60*60*1000;
  const CLOCK_SKEW_MS=5*60*1000;
  const MANAGED_LOCAL_PREFIXES=['mantto:offline-access:','mantto:offline-pending:', 'mantto:offline-backup-lease:'];
  const SUPPORTED_KINDS=Object.freeze(['tickets','portafolio','proyectos']);
  // Fase 5: la cola mantiene confirmacion Aiven y conflictos por separado.
  const OUTBOX_ACTIONS=Object.freeze({
    TICKET_COMMENT:{dataset:'UNITED:OPERACION-RESUMEN-DIA',kind:'tickets'},
    TICKET_MOVEMENT:{dataset:'UNITED:OPERACION-RESUMEN-DIA',kind:'tickets'},
    EQUIPMENT_MOVEMENT:{dataset:'UNITED:OPERACION-RESUMEN-DIA',kind:'portafolio'},
    PROJECT_COMMENT:{dataset:'CORELLIAN:INSTALACIONES-PROYECTOS',kind:'proyectos'},
    PROJECT_MOVEMENT:{dataset:'CORELLIAN:INSTALACIONES-PROYECTOS',kind:'proyectos'}
  });
  const OUTBOX_MAX_PER_USER=1000;
  let offlineIdentityRevision=0;

  function requestResult(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Falló una operación de IndexedDB.'));
    });
  }
  function transactionDone(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve(true);
      tx.onabort=()=>reject(tx.error||new Error('Transacción IndexedDB cancelada.'));
      tx.onerror=()=>reject(tx.error||new Error('Falló una transacción IndexedDB.'));
    });
  }
  function openDatabase(){
    if(!window.indexedDB)return Promise.reject(new Error('El navegador no ofrece IndexedDB.'));
    return new Promise((resolve,reject)=>{
      const req=window.indexedDB.open(DB_NAME,DB_VERSION);
      req.onerror=()=>reject(req.error||new Error('No fue posible abrir IndexedDB.'));
      req.onblocked=()=>reject(new Error('Otra pestaña bloquea la actualización de IndexedDB. Cierra las demás pestañas e inténtalo nuevamente.'));
      req.onupgradeneeded=event=>{
        const db=event.target.result;
        if(!db.objectStoreNames.contains(SNAPSHOT_STORE)){
          const store=db.createObjectStore(SNAPSHOT_STORE,{keyPath:'partition_key'});
          store.createIndex('effective_user_id','effective_user_id',{unique:false});
          store.createIndex('dataset','dataset',{unique:false});
        }
        if(!db.objectStoreNames.contains(METADATA_STORE))db.createObjectStore(METADATA_STORE,{keyPath:'key'});
        if(!db.objectStoreNames.contains(DIAGNOSTIC_STORE))db.createObjectStore(DIAGNOSTIC_STORE,{keyPath:'key'});
        if(!db.objectStoreNames.contains(OUTBOX_STORE)){
          const outbox=db.createObjectStore(OUTBOX_STORE,{keyPath:'id'});
          outbox.createIndex('status','status',{unique:false});
        }
        if(!db.objectStoreNames.contains(CHUNK_STORE)){
          const chunks=db.createObjectStore(CHUNK_STORE,{keyPath:'key'});
          chunks.createIndex('run_id','run_id',{unique:false});
        }
      };
      req.onsuccess=()=>{
        const db=req.result;db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }
  function positiveId(value,label){
    const id=Number(value);
    if(!Number.isSafeInteger(id)||id<=0)throw new Error(`Falta ${label} para separar la copia offline.`);
    return id;
  }
  function cleanCode(value,label){
    const code=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
    if(!code)throw new Error(`Falta ${label} para separar la copia offline.`);
    return code;
  }
  function normalizeContext(context){
    const actor=positiveId(context?.actor_user_id||context?.actorUserId,'el usuario actor');
    const effective=positiveId(context?.effective_user_id||context?.effectiveUserId,'el usuario efectivo');
    const domain=cleanCode(context?.domain,'el dominio');
    const dataset=cleanCode(context?.dataset,'el conjunto de datos');
    return {actor_user_id:actor,effective_user_id:effective,domain,dataset,partition_key:`${actor}:${effective}:${domain}:${dataset}`};
  }
  function sizeOf(value){
    try{return new Blob([JSON.stringify(value)]).size;}catch(_error){return JSON.stringify(value).length;}
  }
  function recordCount(payload){
    const data=payload?.data||payload||{};
    if(Array.isArray(data))return data.length;
    return Object.values(data).reduce((total,value)=>total+(Array.isArray(value)?value.length:0),0);
  }
  function isHash(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
  function timestampMs(value){
    const parsed=new Date(value||0).getTime();
    return Number.isFinite(parsed)?parsed:0;
  }
  function snapshotExpiresAt(row){
    const downloaded=timestampMs(row?.downloaded_at);
    return downloaded?downloaded+SNAPSHOT_TTL_MS:0;
  }
  function snapshotIsFresh(row,now=Date.now()){
    const downloaded=timestampMs(row?.downloaded_at),expires=snapshotExpiresAt(row);
    return Boolean(downloaded&&downloaded<=now+CLOCK_SKEW_MS&&expires>now);
  }
  function partitionMatchesIdentity(partitionKey,actor,effective){
    const [storedActor,storedEffective]=String(partitionKey||'').split(':').map(Number);
    return storedActor===actor&&storedEffective===effective;
  }
  async function deleteSnapshotRows(db,rows){
    const targets=(rows||[]).filter(Boolean);
    if(!targets.length)return 0;
    const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
    const snapshots=tx.objectStore(SNAPSHOT_STORE),metadata=tx.objectStore(METADATA_STORE);
    for(const row of targets){
      snapshots.delete(row.partition_key);
      metadata.delete(`snapshot:${row.partition_key}`);
    }
    await done;
    for(const runId of [...new Set(targets.map(row=>row.run_id).filter(Boolean))]){
      try{await deleteChunkRun(db,runId);}catch(error){console.warn('[Offline] No fue posible purgar bloques caducados.',error);}
    }
    return targets.length;
  }

  // Conserva el contrato histórico de respaldos pequeños. Escritura atómica.
  async function saveSnapshot(context,payload,metadata){
    const part=normalizeContext(context);
    const now=new Date().toISOString();
    const row={...part,schema_version:1,read_only:true,downloaded_at:now,
      expires_at:new Date(Date.now()+SNAPSHOT_TTL_MS).toISOString(),
      source_updated_at:metadata?.source_updated_at||payload?.generated_at||null,
      record_count:Number.isFinite(Number(metadata?.record_count))?Number(metadata.record_count):recordCount(payload),
      byte_size:sizeOf(payload),payload};
    const db=await openDatabase();
    try{
      const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
      tx.objectStore(SNAPSHOT_STORE).put(row);
      tx.objectStore(METADATA_STORE).put({key:`snapshot:${part.partition_key}`,partition_key:part.partition_key,
        downloaded_at:now,expires_at:row.expires_at,record_count:row.record_count,byte_size:row.byte_size,read_only:true});
      await done;return row;
    }finally{db.close();}
  }

  // Un respaldo nuevo se escribe primero en una generación temporal (sin tocar la anterior).
  async function beginDownload(context,manifest){
    const part=normalizeContext(context);
    if(!isHash(manifest?.scope_signature))throw new Error('Firma del alcance ausente o inválida.');
    const expected={};
    const kinds=Object.keys(manifest?.kinds||{});
    if(!kinds.length||kinds.some(kind=>!SUPPORTED_KINDS.includes(kind)))throw new Error('Conjuntos de respaldo desconocidos.');
    for(const kind of kinds){
      const value=Number(manifest?.kinds?.[kind]?.count);
      if(!Number.isSafeInteger(value)||value<0)throw new Error('Conteo de respaldo inválido.');
      expected[kind]=value;
    }
    const runId=`${part.partition_key}:${Date.now()}:${window.crypto?.randomUUID?.()||Math.random().toString(16).slice(2)}`;
    const draft={key:`draft:${runId}`,run_id:runId,partition_key:part.partition_key,
      started_at:new Date().toISOString(),expires_at:new Date(Date.now()+DRAFT_TTL_MS).toISOString(),scope_signature:manifest.scope_signature,
      expected,counts:Object.fromEntries(kinds.map(k=>[k,0])),
      last_ids:Object.fromEntries(kinds.map(k=>[k,0])),
      parts:Object.fromEntries(kinds.map(k=>[k,0])),kinds,byte_size:0};
    const db=await openDatabase();
    try{
      const tx=db.transaction(METADATA_STORE,'readwrite'),done=transactionDone(tx);
      tx.objectStore(METADATA_STORE).put(draft);
      await done;return runId;
    }finally{db.close();}
  }

  async function appendDownload(context,runId,kind,rows){
    const part=normalizeContext(context);
    if(!SUPPORTED_KINDS.includes(kind)||!Array.isArray(rows)||rows.length>500)throw new Error('Bloque de respaldo inválido.');
    if(rows.length===0)return null;
    const field=kind==='tickets'?'id':kind==='portafolio'?'id_portafolio':'id_ins_fl';
    const db=await openDatabase();
    try{
      const tx=db.transaction([METADATA_STORE,CHUNK_STORE],'readwrite'),done=transactionDone(tx);
      const metas=tx.objectStore(METADATA_STORE),chunks=tx.objectStore(CHUNK_STORE);
      const draft=await requestResult(metas.get(`draft:${runId}`));
      if(!draft||draft.partition_key!==part.partition_key||!draft.kinds.includes(kind))throw new Error('Generación de respaldo desconocida.');
      let last=draft.last_ids[kind];
      for(const row of rows){
        const id=Number(row?.[field]);
        if(!Number.isSafeInteger(id)||id<=last)throw new Error('IDs duplicados o fuera de orden en el bloque.');
        last=id;
      }
      if(draft.counts[kind]+rows.length>draft.expected[kind])throw new Error('La descarga excede el total declarado por Aiven.');
      const partNum=draft.parts[kind];
      const bytes=sizeOf(rows);
      chunks.put({key:`${runId}:${kind}:${partNum}`,run_id:runId,kind,part:partNum,rows});
      draft.counts[kind]+=rows.length;
      draft.parts[kind]+=1;
      draft.last_ids[kind]=last;
      draft.byte_size+=bytes;
      metas.put(draft);
      await done;return {count:draft.counts[kind],last_id:last};
    }finally{db.close();}
  }

  async function deleteChunkRun(db,runId){
    if(!runId)return;
    const tx=db.transaction(CHUNK_STORE,'readwrite'),done=transactionDone(tx);
    const store=tx.objectStore(CHUNK_STORE);
    const keys=await requestResult(store.index('run_id').getAllKeys(runId));
    for(const key of keys)store.delete(key);
    await done;
  }

  // Solo ahora, después de verificar TODAS las páginas, se conmuta la copia visible.
  // Atomicidad: snapshots y metadata se actualizan en una misma transacción.
  async function finishDownload(context,runId,manifest){
    const part=normalizeContext(context);
    if(!isHash(manifest?.scope_signature))throw new Error('La firma final no es válida.');
    const db=await openDatabase();
    let previousRun=null;
    try{
      const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
      const snaps=tx.objectStore(SNAPSHOT_STORE),meta=tx.objectStore(METADATA_STORE);
      const draft=await requestResult(meta.get(`draft:${runId}`));
      const before=await requestResult(snaps.get(part.partition_key));
      if(!draft||draft.partition_key!==part.partition_key||draft.scope_signature!==manifest.scope_signature)
        throw new Error('El alcance cambió durante la descarga.');
      for(const kind of draft.kinds){
        if(draft.expected[kind]!==Number(manifest.kinds[kind].count)||draft.counts[kind]!==draft.expected[kind])
          throw new Error(`Respaldo incompleto: ${kind}.`);
      }
      previousRun=before?.run_id||null;
      const now=new Date().toISOString();
      const row={...part,schema_version:2,read_only:true,downloaded_at:now,
        expires_at:new Date(Date.now()+SNAPSHOT_TTL_MS).toISOString(),
        source_updated_at:manifest.generated_at||null,
        record_count:Object.values(draft.counts).reduce((a,b)=>a+b,0),
        byte_size:draft.byte_size,run_id:runId,scope_signature:manifest.scope_signature,
        kind_counts:{...draft.counts},
        payload:{alcance:manifest.alcance,data:Object.fromEntries(draft.kinds.map(k=>[k,[]]))}};
      snaps.put(row);
      meta.put({key:`snapshot:${part.partition_key}`,partition_key:part.partition_key,
        downloaded_at:now,expires_at:row.expires_at,record_count:row.record_count,byte_size:row.byte_size,
        scope_signature:row.scope_signature,read_only:true});
      meta.delete(`draft:${runId}`);
      await done;
      if(previousRun&&previousRun!==runId){
        try{await deleteChunkRun(db,previousRun);}catch(error){console.warn('[Offline] Limpieza de respaldo previo pendiente.',error);}
      }
      return row;
    }finally{db.close();}
  }

  async function abandonDownload(context,runId){
    if(!runId)return;
    const part=normalizeContext(context),db=await openDatabase();
    try{
      const tx=db.transaction(METADATA_STORE,'readwrite'),done=transactionDone(tx),meta=tx.objectStore(METADATA_STORE);
      const draft=await requestResult(meta.get(`draft:${runId}`));
      if(draft&&draft.partition_key===part.partition_key)meta.delete(draft.key);
      await done;
      if(draft&&draft.partition_key===part.partition_key)await deleteChunkRun(db,runId);
    }finally{db.close();}
  }

  async function getSnapshot(context){
    const part=normalizeContext(context),db=await openDatabase();
    try{
      const tx=db.transaction(SNAPSHOT_STORE,'readonly'),done=transactionDone(tx);
      const row=await requestResult(tx.objectStore(SNAPSHOT_STORE).get(part.partition_key));
      await done;
      if(row&&!snapshotIsFresh(row)){
        await deleteSnapshotRows(db,[row]);
        return null;
      }
      if(!row||row.schema_version!==2)return row||null;
      if(!row.run_id)throw new Error('La copia offline no contiene generación válida.');
      const txChunks=db.transaction(CHUNK_STORE,'readonly'),doneChunks=transactionDone(txChunks);
      const chunks=await requestResult(txChunks.objectStore(CHUNK_STORE).index('run_id').getAll(row.run_id));
      await doneChunks;
      const data=Object.fromEntries(Object.keys(row.kind_counts||{}).map(k=>[k,[]]));
      for(const kind of Object.keys(data)){ 
        const parts=chunks.filter(c=>c.kind===kind).sort((a,b)=>a.part-b.part);
        parts.forEach((c,i)=>{if(c.part!==i)throw new Error('Faltan bloques del respaldo offline.');data[kind].push(...c.rows);});
        if(data[kind].length!==Number(row.kind_counts?.[kind]||0))throw new Error('La copia offline tiene bloques incompletos.');
      }
      return {...row,payload:{ok:true,data,alcance:row.payload?.alcance}};
    }finally{db.close();}
  }
  async function listSnapshots(filter){
    const actor=positiveId(filter?.actor_user_id||filter?.actorUserId,'usuario actor');
    const effective=positiveId(filter?.effective_user_id||filter?.effectiveUserId,'usuario efectivo');
    const db=await openDatabase();
    try{
      const tx=db.transaction(SNAPSHOT_STORE,'readonly'),done=transactionDone(tx);
      const rows=await requestResult(tx.objectStore(SNAPSHOT_STORE).getAll());
      await done;
      const matching=(rows||[]).filter(r=>r.actor_user_id===actor&&r.effective_user_id===effective);
      const expired=matching.filter(row=>!snapshotIsFresh(row));
      await deleteSnapshotRows(db,expired);
      return matching.filter(row=>snapshotIsFresh(row));
    }finally{db.close();}
  }

  // Solo se ejecuta después de obtener un catálogo NUEVO del servidor.
  // Nunca elimina outbox ni intentos de escritura (reservados para fases posteriores).
  async function pruneSnapshots(filter,authorizedSignatures){
    const actor=positiveId(filter?.actor_user_id,'usuario actor');
    const effective=positiveId(filter?.effective_user_id,'usuario efectivo');
    const allowed=new Map(Object.entries(authorizedSignatures||{}));
    const db=await openDatabase();
    try{
      const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
      const snaps=tx.objectStore(SNAPSHOT_STORE),meta=tx.objectStore(METADATA_STORE);
      const rows=await requestResult(snaps.getAll());
      const removed=[];
      for(const row of rows){
        if(row.actor_user_id!==actor||row.effective_user_id!==effective)continue;
        if(!snapshotIsFresh(row)){
          snaps.delete(row.partition_key);meta.delete(`snapshot:${row.partition_key}`);
          if(row.run_id)removed.push(row.run_id);
          continue;
        }
        const key=`${row.domain}:${row.dataset}`;
        const expected=allowed.get(key);
        const signature=typeof expected==='string'?expected:expected?.signature;
        if(isHash(signature)&&row.schema_version===2&&row.scope_signature===signature)continue;
        // Migración: mantener el respaldo F1 solo si las zonas vuelven a coincidir
        // exactamente con el alcance validado por el backend. Nunca para CORELLIAN,
        // porque el legado no contiene una lista comprobable de personas visibles.
        if(row.schema_version===1&&row.domain==='UNITED'&&isHash(signature)&&
           expected&&typeof expected==='object'){
          const before=row.payload?.alcance?.zona_ids;
          const after=expected.zone_ids;
          const sanitize=a=>[...new Set(a.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))].sort((a,b)=>a-b);
          if(before===null&&after===null)continue;
          if(Array.isArray(before)&&Array.isArray(after)){
            const x=sanitize(before),y=sanitize(after);
            if(x.length>0&&x.length===y.length&&x.every((v,i)=>v===y[i]))continue;
          }
        }
        snaps.delete(row.partition_key);meta.delete(`snapshot:${row.partition_key}`);
        if(row.run_id)removed.push(row.run_id);
      }
      await done;
      for(const runId of removed){try{await deleteChunkRun(db,runId);}catch(error){console.warn('[Offline] Limpieza pendiente.',error);}}
      return removed.length;
    }finally{db.close();}
  }

  // Fase 3. Navegacion de las generaciones completas sin materializar
  // el universo completo en RAM. Nunca consulta backend ni Cache Storage.
  const READER_KINDS=Object.freeze({
    'UNITED:OPERACION-RESUMEN-DIA':Object.freeze(['tickets','portafolio']),
    'CORELLIAN:INSTALACIONES-PROYECTOS':Object.freeze(['proyectos'])
  });
  const READER_IDENTIFIERS=Object.freeze({tickets:'id',portafolio:'id_portafolio',proyectos:'id_ins_fl'});

  function requireReaderSignature(signature){
    if(!isHash(signature))throw new Error('No se confirmó la firma del alcance autorizado.');
    return signature;
  }
  function readerKinds(part){
    const kinds=READER_KINDS[`${part.domain}:${part.dataset}`];
    if(!kinds)throw new Error('No existe lector certificado para este módulo.');
    return kinds;
  }
  function assertSnapshotReaderRow(row,part,signature,expectedRun){
    if(!row||row.partition_key!==part.partition_key||row.schema_version!==2||row.read_only!==true||
       row.actor_user_id!==part.actor_user_id||row.effective_user_id!==part.effective_user_id||
       row.domain!==part.domain||row.dataset!==part.dataset||
       row.scope_signature!==signature||typeof row.run_id!=='string'||!row.run_id)
      throw new Error('Respaldo sin validar, incompleto o fuera del alcance vigente.');
    if(!snapshotIsFresh(row))throw new Error('La copia offline caducó y debe descargarse nuevamente.');
    if(expectedRun&&row.run_id!==expectedRun)throw new Error('La copia fue renovada. Abre nuevamente el módulo.');
    const kinds=readerKinds(part),counts=row.kind_counts;
    if(!counts||Object.keys(counts).length!==kinds.length||
       kinds.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0)||
       kinds.reduce((sum,k)=>sum+counts[k],0)!==row.record_count)
      throw new Error('El manifiesto local del módulo está incompleto.');
    return kinds;
  }
  async function readerRow(db,part,signature,run){
    const tx=db.transaction(SNAPSHOT_STORE,'readonly'),done=transactionDone(tx);
    const row=await requestResult(tx.objectStore(SNAPSHOT_STORE).get(part.partition_key));
    await done;
    if(row&&!snapshotIsFresh(row)){
      await deleteSnapshotRows(db,[row]);
      throw new Error('La copia offline caducó y fue purgada. Descárgala nuevamente.');
    }
    assertSnapshotReaderRow(row,part,signature,run);
    return row;
  }
  async function readerChunkKeys(db,run,kind){
    const tx=db.transaction(CHUNK_STORE,'readonly'),done=transactionDone(tx);
    const all=await requestResult(tx.objectStore(CHUNK_STORE).index('run_id').getAllKeys(run));
    await done;
    const prefix=`${run}:${kind}:`;
    const values=(all||[]).filter(key=>typeof key==='string'&&key.startsWith(prefix))
      .map(key=>({key,part:Number(key.slice(prefix.length))}));
    if(values.some(v=>!Number.isSafeInteger(v.part)||v.part<0))throw new Error('Índice de bloques fuera de formato.');
    values.sort((a,b)=>a.part-b.part);
    for(let i=0;i<values.length;i++)if(values[i].part!==i)throw new Error('Faltan bloques en el respaldo del módulo.');
    return values;
  }
  function verifyChunk(chunk,run,kind,part,lastId){
    const field=READER_IDENTIFIERS[kind];
    if(!chunk||chunk.run_id!==run||chunk.kind!==kind||chunk.part!==part||
       !Array.isArray(chunk.rows)||!chunk.rows.length||chunk.rows.length>500)
      throw new Error('Un bloque local no corresponde al respaldo validado.');
    for(const record of chunk.rows){
      const id=Number(record?.[field]);
      if(!Number.isSafeInteger(id)||id<=lastId)throw new Error('Bloque local duplicado o desordenado.');
      lastId=id;
    }
    return lastId;
  }
  async function verifiedSnapshot(context,scopeSignature){
    const part=normalizeContext(context),sig=requireReaderSignature(scopeSignature);
    const db=await openDatabase();
    try{
      const row=await readerRow(db,part,sig),kinds=readerKinds(part);
      const tx=db.transaction(CHUNK_STORE,'readonly'),done=transactionDone(tx),store=tx.objectStore(CHUNK_STORE);
      try{
        // Enumeracion de claves pequeña; los datos se leen por separado por bloque.
        const allKeys=await requestResult(store.index('run_id').getAllKeys(row.run_id));
        let actualBlocks=0;
        for(const kind of kinds){
          const prefix=`${row.run_id}:${kind}:`;
          const keys=(allKeys||[]).filter(k=>typeof k==='string'&&k.startsWith(prefix))
            .map(k=>({key:k,part:Number(k.slice(prefix.length))})).sort((a,b)=>a.part-b.part);
          let lastId=0,count=0;
          for(let i=0;i<keys.length;i++){
            if(keys[i].part!==i)throw new Error(`Faltan bloques de ${kind}.`);
            const chunk=await requestResult(store.get(keys[i].key));
            lastId=verifyChunk(chunk,row.run_id,kind,i,lastId);
            count+=chunk.rows.length;
          }
          if(count!==row.kind_counts[kind])throw new Error(`El respaldo de ${kind} no está completo.`);
          actualBlocks+=keys.length;
        }
        if(actualBlocks!==(allKeys||[]).length)throw new Error('El respaldo incluye bloques no reconocidos.');
      }finally{await done;}
      return {
        schema_version:2,read_only:true,partition_key:row.partition_key,run_id:row.run_id,
        actor_user_id:row.actor_user_id,effective_user_id:row.effective_user_id,
        domain:row.domain,dataset:row.dataset,scope_signature:row.scope_signature,
        downloaded_at:row.downloaded_at,record_count:row.record_count,
        byte_size:row.byte_size,kind_counts:{...row.kind_counts}
      };
    }finally{db.close();}
  }
  function normalizeReaderText(value){
    return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
  }
  function recordMatches(record,term){
    if(!term)return true;
    return Object.values(record||{}).some(value=>
      (typeof value==='string'||typeof value==='number')&&normalizeReaderText(value).includes(term));
  }
  async function readSnapshotPage(context,options={}){
    const part=normalizeContext(context),sig=requireReaderSignature(options.scope_signature);
    const kind=String(options.kind||'');
    if(!readerKinds(part).includes(kind))throw new Error('Tipo de registros fuera del módulo autorizado.');
    const limit=Number(options.limit??30),after=Number(options.after_id??0);
    const term=String(options.search||'').trim();
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||
       !Number.isSafeInteger(after)||after<0||term.length>120)
      throw new Error('Parámetros de navegación local inválidos.');
    const search=normalizeReaderText(term),db=await openDatabase();
    try{
      const row=await readerRow(db,part,sig,options.run_id);
      const keys=await readerChunkKeys(db,row.run_id,kind);
      if(keys.length===0){
        if(row.kind_counts[kind]!==0)throw new Error('Faltan bloques del respaldo offline.');
        return {kind,rows:[],has_more:false,next_cursor:after,
          total_records:0,run_id:row.run_id,scope_signature:sig};
      }
      const tx=db.transaction(CHUNK_STORE,'readonly'),done=transactionDone(tx),store=tx.objectStore(CHUNK_STORE);
      let rows=[],lastReadId=0,total=0,hasMore=false;
      try{
        for(let i=0;i<keys.length;i++){
          const chunk=await requestResult(store.get(keys[i].key));
          lastReadId=verifyChunk(chunk,row.run_id,kind,i,lastReadId);
          total+=chunk.rows.length;
          for(const record of chunk.rows){
            const id=Number(record[READER_IDENTIFIERS[kind]]);
            if(id<=after||!recordMatches(record,search))continue;
            if(rows.length===limit){hasMore=true;break;}
            rows.push(record);
          }
          if(hasMore)break;
        }
      }finally{await done;}
      // Si se recorrió hasta el final, también se comprueba el total.
      if(!hasMore&&total!==row.kind_counts[kind])
        throw new Error('El conjunto local dejó de estar completo.');
      return {kind,rows,has_more:hasMore,
        next_cursor:rows.length?Number(rows[rows.length-1][READER_IDENTIFIERS[kind]]):after,
        total_records:row.kind_counts[kind],run_id:row.run_id,scope_signature:sig};
    }finally{db.close();}
  }

  async function healthCheck(){
    const db=await openDatabase();
    const marker=window.crypto?.randomUUID?.()||`offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try{
      const tx=db.transaction(DIAGNOSTIC_STORE,'readwrite'),done=transactionDone(tx),store=tx.objectStore(DIAGNOSTIC_STORE);
      await requestResult(store.put({key:'health-check',marker,created_at:new Date().toISOString()}));
      const saved=await requestResult(store.get('health-check'));
      if(saved?.marker!==marker){try{tx.abort();}catch(_error){}throw new Error('La escritura local no pudo verificarse.');}
      await requestResult(store.delete('health-check'));
      await done;return true;
    }finally{db.close();}
  }
  // El navegador puede quedar sin conexión al crear estos registros. No
  // se ejecuta ninguna petición HTTP ni cambia la fotografía del respaldo.
  function actionIdentity(context){
    return {actor_user_id:positiveId(context?.actor_user_id||context?.actorUserId,'usuario actor'),
      effective_user_id:positiveId(context?.effective_user_id||context?.effectiveUserId,'usuario efectivo')};
  }
  function outboxChangeEvent(){
    if(typeof document?.dispatchEvent==='function'&&typeof CustomEvent==='function'){
      document.dispatchEvent(new CustomEvent('mantto:offline-outbox-changed'));
    }
  }
  function requireOutboxAction(part,action,kind){
    const config=OUTBOX_ACTIONS[String(action||'')];
    if(!config||config.dataset!==`${part.domain}:${part.dataset}`||config.kind!==kind)
      throw new Error('Operación no autorizada para este conjunto offline.');
    return config;
  }
  function newOutboxId(){
    if(typeof window.crypto?.randomUUID==='function')return window.crypto.randomUUID();
    if(typeof window.crypto?.getRandomValues==='function'){
      const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
      const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
      return `outbox-${hex}`;
    }
    throw new Error('El dispositivo no ofrece identificadores aleatorios seguros para operaciones pendientes.');
  }
  function validateText(value){
    if(typeof value!=='string')throw new Error('Escribe el comentario o movimiento.');
    const text=value.trim();
    if(!text||text.length>2000)throw new Error('El texto debe tener de 1 a 2000 caracteres.');
    if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))
      throw new Error('El texto contiene caracteres de control no permitidos.');
    return text;
  }
  function recordAnchor(kind,row){
    // Anclas basadas exclusivamente en la fila verificada del respaldo.
    if(kind==='tickets')return String(row.ticket||row.id);
    if(kind==='portafolio')return String(row.numero_equipo||row.id_portafolio);
    return String(row.id_proyecto||row.id_ins_fl);
  }
  async function enqueueOfflineAction(context,input={}){
    const part=normalizeContext(context);
    const identityRevision=offlineIdentityRevision;
    const action=String(input.action||'');
    const kind=String(input.kind||'');
    requireOutboxAction(part,action,kind);
    const recordId=positiveId(input.record_id,'el registro');
    const signature=requireReaderSignature(input.scope_signature);
    const runId=String(input.run_id||'');
    if(!runId)throw new Error('Falta la generación del respaldo.');
    const text=validateText(input.text);
    const access=readCachedAccess(part.actor_user_id,part.effective_user_id);
    if(!access)throw new Error('Tu autorización offline local venció. Vuelve a conectar y validar permisos.');
    if(access.viewer_read_only===true)throw new Error('Modo Visor: no se permiten operaciones offline.');
    const allowed=(Array.isArray(access.catalog_modules)?access.catalog_modules:[]).some(m=>
      m.domain===part.domain&&m.scope?.scope_signature===signature&&
      Array.isArray(m.datasets)&&m.datasets.includes(part.dataset.toLowerCase()));
    if(!allowed)throw new Error('El módulo ya no figura en el alcance autorizado.');
    // No confiar en id/identificadores enviados por la vista: reabrir el
    // registro exacto desde los bloques autorizados, sin usar API.
    const page=await readSnapshotPage(part,{scope_signature:signature,
      run_id:runId,kind,after_id:recordId-1,limit:1});
    const key=READER_IDENTIFIERS[kind];
    const record=page.rows[0];
    if(Number(record?.[key])!==recordId)throw new Error('No se localizó el registro dentro de tu respaldo autorizado.');
    if(identityRevision!==offlineIdentityRevision)throw new Error('La identidad cambió durante la captura offline.');
    const id=newOutboxId();
    const operation={id,idempotency_key:id,schema_version:4,
      actor_user_id:part.actor_user_id,effective_user_id:part.effective_user_id,
      domain:part.domain,dataset:part.dataset,kind,
      action,record_id:recordId,reference:recordAnchor(kind,record),
      source_run_id:runId,scope_signature:signature,
      payload:{text},status:'PENDIENTE_SINCRONIZACION',
      created_at:new Date().toISOString(),attempts:0,server_ack:null};
    const db=await openDatabase();
    try{
      const tx=db.transaction([SNAPSHOT_STORE,OUTBOX_STORE],'readwrite'),done=transactionDone(tx);
      const snapshot=await requestResult(tx.objectStore(SNAPSHOT_STORE).get(part.partition_key));
      assertSnapshotReaderRow(snapshot,part,signature,runId);
      if(identityRevision!==offlineIdentityRevision)throw new Error('La identidad cambió durante la captura offline.');
      const outbox=tx.objectStore(OUTBOX_STORE);
      const entries=await requestResult(outbox.getAll());
      // ACK ya confirmado en Aiven no consume cupo de pendientes.
      const count=(entries||[]).filter(e=>e.actor_user_id===part.actor_user_id&&
        e.effective_user_id===part.effective_user_id&&e.status!=='SINCRONIZADO').length;
      // Retencion local limitada; el acuse durable permanece en Aiven.
      const cutoff=Date.now()-30*24*60*60*1000;
      for(const old of entries||[]){
        if(old.status==='SINCRONIZADO'&&Number.isFinite(Date.parse(old.synced_at))&&
           Date.parse(old.synced_at)<cutoff)outbox.delete(old.id);
      }
      if(count>=OUTBOX_MAX_PER_USER)throw new Error('Se alcanzó el límite de operaciones pendientes.');
      const existing=await requestResult(outbox.get(id));
      if(existing)throw new Error('Identificador de operación duplicado; inténtalo otra vez.');
      await requestResult(outbox.put(operation));
      await done;
    }finally{db.close();}
    outboxChangeEvent();
    return operation;
  }
  async function listPendingActions(context,options={}){
    const {actor_user_id:actor,effective_user_id:effective}=actionIdentity(context);
    const limit=Number(options.limit??1000);
    if(!Number.isSafeInteger(limit)||limit<1||limit>OUTBOX_MAX_PER_USER)
      throw new Error('Límite de consulta offline inválido.');
    const db=await openDatabase();
    try{
      const tx=db.transaction(OUTBOX_STORE,'readonly'),done=transactionDone(tx);
      const rows=await requestResult(tx.objectStore(OUTBOX_STORE).getAll());
      await done;
      return (rows||[]).filter(x=>x.actor_user_id===actor&&x.effective_user_id===effective&&
        ['PENDIENTE_SINCRONIZACION','ENVIANDO','REQUIERE_REVISION'].includes(x.status))
        .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0,limit);
    }finally{db.close();}
  }
  async function discardPendingAction(context,actionId){
    const {actor_user_id:actor,effective_user_id:effective}=actionIdentity(context);
    const key=String(actionId||'');
    if(!key)throw new Error('Operación no identificada.');
    const db=await openDatabase();
    try{
      const tx=db.transaction(OUTBOX_STORE,'readwrite'),done=transactionDone(tx);
      const store=tx.objectStore(OUTBOX_STORE);
      const row=await requestResult(store.get(key));
      if(!row||row.actor_user_id!==actor||row.effective_user_id!==effective||
        !['PENDIENTE_SINCRONIZACION','REQUIERE_REVISION'].includes(row.status))throw new Error('La operación no está disponible para esta identidad o estado.');
      await requestResult(store.delete(key));
      await done;
    }finally{db.close();}
    outboxChangeEvent();
    return true;
  }
  async function outboxStatus(context){
    const db=await openDatabase();
    try{
      const tx=db.transaction(OUTBOX_STORE,'readonly'),done=transactionDone(tx);
      const records=await requestResult(tx.objectStore(OUTBOX_STORE).getAll());
      await done;
      const actor=Number(context?.actor_user_id||context?.actorUserId);
      const effective=Number(context?.effective_user_id||context?.effectiveUserId);
      const scoped=Number.isSafeInteger(actor)&&actor>0&&Number.isSafeInteger(effective)&&effective>0;
      const count=(records||[]).filter(row=>['PENDIENTE_SINCRONIZACION','ENVIANDO','REQUIERE_REVISION'].includes(row.status)&&
        (!scoped||(row.actor_user_id===actor&&row.effective_user_id===effective))).length;
      const conflicts=(records||[]).filter(row=>row.status==='REQUIERE_REVISION'&&
        (!scoped||(row.actor_user_id===actor&&row.effective_user_id===effective))).length;
      return {enabled:true,uploads_enabled:true,count,conflicts,reason:conflicts?'Hay operaciones que requieren revisión.':null};
    }finally{db.close();}
  }
  // Fase 5: control de envio por identidad y token de reclamacion. El ACK
  // verificado cambia ENVIANDO -> SINCRONIZADO; nunca se deduce por estar online.
  const SEND_LEASE_MS=2*60*1000;
  function sameOutboxIdentity(row,identity){
    return row?.actor_user_id===identity.actor_user_id&&
      row?.effective_user_id===identity.effective_user_id;
  }
  async function listSendableActions(context,limit=30){
    const identity=actionIdentity(context),now=Date.now();
    const db=await openDatabase();
    try{
      const tx=db.transaction(OUTBOX_STORE,'readonly'),done=transactionDone(tx);
      const items=await requestResult(tx.objectStore(OUTBOX_STORE).getAll());await done;
      return (items||[]).filter(row=>sameOutboxIdentity(row,identity)&&(
        (row.status==='PENDIENTE_SINCRONIZACION'&&(!row.next_retry_at||Date.parse(row.next_retry_at)<=now))||
        (row.status==='ENVIANDO'&&now-Date.parse(row.claimed_at||0)>SEND_LEASE_MS)))
        .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0,Math.min(30,Math.max(1,Number(limit)||1)));
    }finally{db.close();}
  }
  async function claimPendingAction(context,actionId){
    const identity=actionIdentity(context),revision=offlineIdentityRevision;
    const key=String(actionId||''),now=Date.now();
    if(!key)throw new Error('Identificador de envio faltante.');
    const db=await openDatabase();
    let claimed=null;
    try{
      const tx=db.transaction(OUTBOX_STORE,'readwrite'),done=transactionDone(tx),store=tx.objectStore(OUTBOX_STORE);
      const row=await requestResult(store.get(key));
      if(!sameOutboxIdentity(row,identity)||revision!==offlineIdentityRevision)
        throw new Error('La identidad ya no corresponde al pendiente.');
      if(!((row.status==='PENDIENTE_SINCRONIZACION'&&(!row.next_retry_at||Date.parse(row.next_retry_at)<=now))||
        (row.status==='ENVIANDO'&&now-Date.parse(row.claimed_at||0)>SEND_LEASE_MS)))
        throw new Error('La operación aún no está disponible para envío.');
      const token=newOutboxId();
      claimed={...row,status:'ENVIANDO',claimed_at:new Date(now).toISOString(),claim_token:token,
        attempts:Math.min(100000,Number(row.attempts||0)+1),last_error:null};
      await requestResult(store.put(claimed));await done;
    }finally{db.close();}
    outboxChangeEvent();return claimed;
  }
  async function settlePendingAction(context,actionId,claimToken,settlement){
    const identity=actionIdentity(context),revision=offlineIdentityRevision;
    const key=String(actionId||''),token=String(claimToken||'');
    if(!key||!token||!settlement||!['ACK','RETRY','CONFLICT'].includes(settlement.state))
      throw new Error('Resultado de sincronización inválido.');
    const db=await openDatabase();let updated=null;
    try{
      const tx=db.transaction(OUTBOX_STORE,'readwrite'),done=transactionDone(tx),store=tx.objectStore(OUTBOX_STORE);
      const row=await requestResult(store.get(key));
      if(!sameOutboxIdentity(row,identity)||row.status!=='ENVIANDO'||row.claim_token!==token||
        revision!==offlineIdentityRevision)throw new Error('La identidad o la reclamación cambiaron.');
      const now=new Date();
      if(settlement.state==='ACK'){
        const ack=settlement.ack;
        if(!ack||ack.idempotency_key!==row.idempotency_key||
           !Number.isSafeInteger(Number(ack.id_interaccion))||Number(ack.id_interaccion)<1||
           Number(ack.record_id)!==Number(row.record_id)||ack.action!==row.action)
          throw new Error('Aiven no confirmó esta operación de forma verificable.');
        updated={...row,status:'SINCRONIZADO',server_ack:ack,synced_at:now.toISOString(),
          next_retry_at:null,last_error:null,claim_token:null};
      }else if(settlement.state==='RETRY'){
        const delay=Math.min(30*60*1000,Math.max(60000,2**Math.min(8,Number(row.attempts||1))*30000));
        updated={...row,status:'PENDIENTE_SINCRONIZACION',claim_token:null,
          last_error:String(settlement.reason||'No se confirmó la entrega').slice(0,300),
          next_retry_at:new Date(now.getTime()+delay).toISOString()};
      }else{
        updated={...row,status:'REQUIERE_REVISION',claim_token:null,next_retry_at:null,
          last_error:String(settlement.reason||'Conflicto o permisos no vigentes').slice(0,300)};
      }
      await requestResult(store.put(updated));await done;
    }finally{db.close();}
    outboxChangeEvent();return updated;
  }
  async function requeueReviewedAction(context,actionId){
    const identity=actionIdentity(context),key=String(actionId||'');
    const db=await openDatabase();let result;
    try{
      const tx=db.transaction(OUTBOX_STORE,'readwrite'),done=transactionDone(tx),store=tx.objectStore(OUTBOX_STORE);
      const row=await requestResult(store.get(key));
      if(!sameOutboxIdentity(row,identity)||row.status!=='REQUIERE_REVISION')
        throw new Error('No se localizó el pendiente que requiere revisión.');
      result={...row,status:'PENDIENTE_SINCRONIZACION',next_retry_at:null,last_error:null};
      await requestResult(store.put(result));await done;
    }finally{db.close();}
    outboxChangeEvent();return result;
  }

  // Revalidar todos los módulos autorizados desde catálogo fresco, aunque el
  // usuario haya desmarcado uno en su selección. Se eliminan intenciones de
  // módulos/zonas revocados, pero desmarcar un módulo NO borra borradores.
  async function pruneOutbox(context,allowedSignatures={}){
    const {actor_user_id:actor,effective_user_id:effective}=actionIdentity(context);
    const allowed=new Map(Object.entries(allowedSignatures||{}));
    const db=await openDatabase();let removed=0;
    try{
      const tx=db.transaction(OUTBOX_STORE,'readwrite'),done=transactionDone(tx);
      const store=tx.objectStore(OUTBOX_STORE),rows=await requestResult(store.getAll());
      for(const item of rows||[]){
        if(item.actor_user_id!==actor||item.effective_user_id!==effective)continue;
        if(allowed.get(`${item.domain}:${item.dataset}`)===item.scope_signature)continue;
        store.delete(item.id);removed++;
      }
      await done;
    }finally{db.close();}
    if(removed)outboxChangeEvent();
    return removed;
  }
  function clearManagedLocalState(){
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key&&MANAGED_LOCAL_PREFIXES.some(prefix=>key.startsWith(prefix)))localStorage.removeItem(key);
    }
  }
  function clearManagedLocalStateOutsideIdentity(actor,effective){
    const keepAccessKey=`${ACCESS_PREFIX}${actor}:${effective}`;
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(!key||!MANAGED_LOCAL_PREFIXES.some(prefix=>key.startsWith(prefix)))continue;
      if(key===keepAccessKey)continue;
      localStorage.removeItem(key);
    }
  }
  function readCachedAccess(actorUserId,effectiveUserId){
    const actor=Number(actorUserId),effective=Number(effectiveUserId);
    if(!Number.isSafeInteger(actor)||actor<=0||!Number.isSafeInteger(effective)||effective<=0)return null;
    try{
      const item=JSON.parse(localStorage.getItem(`${ACCESS_PREFIX}${actor}:${effective}`)||'null');
      const ts=new Date(item?.saved_at||0).getTime();
      if(!item?.data||!Number.isFinite(ts)||Date.now()+CLOCK_SKEW_MS<ts||Date.now()-ts>ACCESS_TTL_MS){
        localStorage.removeItem(`${ACCESS_PREFIX}${actor}:${effective}`);
        return null;
      }
      if(item.data.permission_code!==OFFLINE_PERMISSION||Number(item.data.effective_user_id)!==effective){
        localStorage.removeItem(`${ACCESS_PREFIX}${actor}:${effective}`);
        return null;
      }
      return item.data;
    }catch(_error){return null;}
  }
  async function purgeExpiredData(){
    if(!window.indexedDB)return 0;
    const db=await openDatabase();
    try{
      const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
      const snapshots=tx.objectStore(SNAPSHOT_STORE),metadata=tx.objectStore(METADATA_STORE);
      const rows=await requestResult(snapshots.getAll());
      const metas=await requestResult(metadata.getAll());
      const expired=(rows||[]).filter(row=>!snapshotIsFresh(row));
      const staleRuns=[];
      for(const row of expired){
        snapshots.delete(row.partition_key);
        metadata.delete(`snapshot:${row.partition_key}`);
        if(row.run_id)staleRuns.push(row.run_id);
      }
      for(const meta of metas||[]){
        if(!String(meta?.key||'').startsWith('draft:'))continue;
        const started=timestampMs(meta.started_at);
        if(started&&started<=Date.now()+CLOCK_SKEW_MS&&Date.now()-started<=DRAFT_TTL_MS)continue;
        metadata.delete(meta.key);
        if(meta.run_id)staleRuns.push(meta.run_id);
      }
      await done;
      for(const runId of [...new Set(staleRuns)]){
        try{await deleteChunkRun(db,runId);}catch(error){console.warn('[Offline] Limpieza de bloques temporales pendiente.',error);}
      }
      return expired.length;
    }finally{db.close();}
  }
  async function purgeOutsideIdentity(actorUserId,effectiveUserId){
    const actor=positiveId(actorUserId,'usuario actor'),effective=positiveId(effectiveUserId,'usuario efectivo');
    clearManagedLocalStateOutsideIdentity(actor,effective);
    if(!window.indexedDB)return 0;
    const db=await openDatabase();
    try{
      const tx=db.transaction([SNAPSHOT_STORE,METADATA_STORE],'readwrite'),done=transactionDone(tx);
      const snapshots=tx.objectStore(SNAPSHOT_STORE),metadata=tx.objectStore(METADATA_STORE);
      const rows=await requestResult(snapshots.getAll());
      const metas=await requestResult(metadata.getAll());
      const removed=(rows||[]).filter(row=>row.actor_user_id!==actor||row.effective_user_id!==effective);
      const staleRuns=[];
      for(const row of removed){
        snapshots.delete(row.partition_key);
        metadata.delete(`snapshot:${row.partition_key}`);
        if(row.run_id)staleRuns.push(row.run_id);
      }
      for(const meta of metas||[]){
        if(!String(meta?.key||'').startsWith('draft:')||partitionMatchesIdentity(meta.partition_key,actor,effective))continue;
        metadata.delete(meta.key);
        if(meta.run_id)staleRuns.push(meta.run_id);
      }
      await done;
      for(const runId of [...new Set(staleRuns)]){
        try{await deleteChunkRun(db,runId);}catch(error){console.warn('[Offline] Limpieza de identidad anterior pendiente.',error);}
      }
      return removed.length;
    }finally{db.close();}
  }
  async function purgeAll(){
    clearManagedLocalState();
    if(!window.indexedDB)return true;
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess=()=>{outboxChangeEvent();resolve(true);};
      request.onerror=()=>reject(request.error||new Error('No fue posible borrar IndexedDB.'));
      request.onblocked=()=>reject(new Error('No se pudieron purgar las copias porque otra pestaña mantiene la base abierta. Cierra las demás pestañas y elimina los datos locales.')); 
    });
  }
  document.addEventListener('mantto:view-user-changed',event=>{
    offlineIdentityRevision++;
    const actor=Number(event?.detail?.actor?.id_SB||event?.detail?.actor?.id||0);
    const effective=Number(event?.detail?.user?.id_SB||event?.detail?.user?.id||0);
    if(!actor||!effective)return Promise.resolve(false);
    return purgeOutsideIdentity(actor,effective).catch(error=>console.warn('[Modo Offline] No fue posible aislar la identidad activa.',error));
  });
  const purgeClosedSession=eventName=>{
    document.addEventListener(eventName,()=>{
      offlineIdentityRevision++;
      return purgeAll().catch(error=>console.warn('[Modo Offline] No fue posible purgar IndexedDB al cerrar sesión.',error));
    });
  };
  purgeClosedSession('mantto:logout');
  purgeClosedSession('mantto:session-expired');
  document.addEventListener('mantto:auth-ready',()=>{
    return purgeExpiredData().catch(error=>console.warn('[Modo Offline] No fue posible completar la purga por caducidad.',error));
  });
  window.ManttoOfflineStorage={databaseName:DB_NAME,normalizeContext,
    saveSnapshot,getSnapshot,listSnapshots,healthCheck,outboxStatus,readCachedAccess,
    hasCachedAccess(actor,effective){return Boolean(readCachedAccess(actor,effective));},
    beginDownload,appendDownload,finishDownload,abandonDownload,pruneSnapshots,
    verifiedSnapshot,readSnapshotPage,purgeAll,purgeExpiredData,purgeOutsideIdentity,
    enqueueOfflineAction,listPendingActions,discardPendingAction,pruneOutbox,
    listSendableActions,claimPendingAction,settlePendingAction,requeueReviewedAction};
})();
