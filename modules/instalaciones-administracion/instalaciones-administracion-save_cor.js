/* [Aster | 2026-10-13 | ASTER-MG | FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001]
 * Guardado MANUAL de borradores en la pantalla secundaria de Instalaciones Administracion.
 * El backend es la autoridad de sesion, permiso, puerta CORELLIAN, scope,
 * pertenencia de proyecto, concurrencia y auditoria. Nada se guarda sin click.
 */
(function (root, factory) {
  'use strict';
  const api=factory();
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  if (root) root.ManttoInstalacionesSave_cor=api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const TECHNICAL_FIELDS=new Set(['id_ins_fl','created_at','updated_at']);
  const MAX_EQUIPMENTS_PER_SAVE=30;
  function knownError(message, code, properties={}) {
    const e=new Error(message);e.code=code;
    return Object.assign(e,properties);
  }
  function isSafeId(value) {
    return Number.isSafeInteger(Number(value)) && Number(value)>0;
  }
  function scalar(value) {
    return value===null || ['string','number','boolean'].includes(typeof value);
  }
  function buildPlan(drafts, options={}) {
    const {projectKey,groups,visibleFields,canEdit,isViewingAs}=options;
    if (!/^P:.{1,100}$|^R:[1-9]\d{0,14}$/.test(String(projectKey||'')))
      throw knownError('Proyecto seleccionado invalido. Actualiza antes de guardar.','FASE3_PROJECT_KEY');
    if (isViewingAs || typeof canEdit!=='function')
      throw knownError('El Visor o una sesion sin permisos de edicion no puede guardar.','FASE3_EDIT_DENIED');
    if (!Array.isArray(drafts)||!Array.isArray(groups)||!Array.isArray(visibleFields))
      throw knownError('El contrato o los borradores no estan disponibles.','FASE3_INVALID_CONTEXT');
    const allowedFields=new Set(visibleFields);
    const editors=new Map();
    for (const group of groups) {
      if (!group || !canEdit(group) || group?.permissions?.can_view!==true) continue;
      for (const field of group.editable_fields||[]) {
        if (!group.fields?.includes(field) || TECHNICAL_FIELDS.has(field) || !allowedFields.has(field)) continue;
        if (editors.has(field))
          throw knownError('Contrato ambiguo: un campo pertenece a dos grupos.','FASE3_AMBIGUOUS_FIELD');
        editors.set(field,group.key);
      }
    }
    const byEquipment=new Map();
    const seen=new Set();
    for (const draft of drafts) {
      const id=Number(draft?.id_ins_fl),field=draft?.field;
      if (!isSafeId(id) || typeof field!=='string' || !editors.has(field) ||
          draft.project_key!==projectKey || !scalar(draft.original) || !scalar(draft.value))
        throw knownError('Existe un borrador fuera del proyecto, de tus permisos o con datos invalidos. Descarta y actualiza.',
          'FASE3_INVALID_DRAFT');
      const signature=id+':'+field;
      if (seen.has(signature))throw knownError('Campo duplicado en borradores.','FASE3_DUPLICATE_DRAFT');
      seen.add(signature);
      const groupKey=editors.get(field);
      if (!byEquipment.has(id))byEquipment.set(id,{id,groups:{},drafts:[]});
      const record=byEquipment.get(id);
      if (!record.groups[groupKey])record.groups[groupKey]={changes:{},expected:{}};
      record.groups[groupKey].changes[field]=draft.value;
      record.groups[groupKey].expected[field]=draft.original;
      record.drafts.push({...draft});
    }
    return [...byEquipment.values()].sort((a,b)=>a.id-b.id);
  }
  // La capa cliente confirma inmediatamente con GET cada equipo modificado.
  // Esto es intencionalmente una transaccion por equipo (no un lote multi-equipo):
  // cada PATCH del backend es atomico con su auditoria.
  async function savePlan(plan, options={}) {
    const {projectKey,api,current,canonicalCompare,onConfirmed,onProgress}=options;
    if(!Array.isArray(plan)||typeof api!=='function'||typeof current!=='function'||
       typeof canonicalCompare!=='function'||typeof onConfirmed!=='function')
      throw knownError('Guardado no inicializado correctamente.','FASE3_MISSING_ADAPTER');
    if(plan.length>MAX_EQUIPMENTS_PER_SAVE)
      throw knownError('Una operacion admite como maximo 30 equipos.','FASE3_BATCH_LIMIT');
    let verified=0;
    for(const record of plan) {
      if(!current())throw knownError('La sesion o proyecto cambio. Guardado interrumpido.','FASE3_CONTEXT_CHANGED',
        {verified});
      if(typeof onProgress==='function')onProgress({verified,total:plan.length,id:record.id});
      let committed=false;
      try {
        const response=await api('/api/instalaciones/administracion/proyectos/'+
          encodeURIComponent(projectKey)+'/equipos/'+encodeURIComponent(record.id)+'/tabla',{
            method:'PATCH',body:JSON.stringify({groups:record.groups})
          });
        if(!current())throw knownError('La sesion cambio durante el guardado; verifica el resultado.','FASE3_CONTEXT_CHANGED');
        if(!response || response.ok!==true)
          throw knownError(response?.message||'El servidor no confirmo la operacion.','FASE3_PATCH_NOT_CONFIRMED');
        committed=true;
        // El PATCH NO devuelve los valores; la relectura vuelve a verificar alcance.
        const read=await api('/api/instalaciones/administracion/registros/'+encodeURIComponent(record.id));
        if(!current())throw knownError('La sesion cambio al confirmar la lectura.','FASE3_CONTEXT_CHANGED');
        if(!read?.data||Number(read.data.id_ins_fl)!==record.id)
          throw knownError('El equipo no pudo verificarse despues del guardado.','FASE3_RECHECK_FAILED');
        for (const draft of record.drafts) {
          if (!Object.prototype.hasOwnProperty.call(read.data,draft.field) ||
              canonicalCompare(draft.field,read.data[draft.field])!==canonicalCompare(draft.field,draft.value))
            throw knownError('La relectura no coincide con el valor enviado. No se reintentara automaticamente.',
              'FASE3_RECHECK_MISMATCH',{field:draft.field});
        }
        await onConfirmed(record,read.data);
        if(!current())throw knownError('La sesion cambio durante la confirmacion.','FASE3_CONTEXT_CHANGED');
        verified++;
      }catch(error) {
        // Si hubo respuesta de PATCH correcta pero fallo GET, NO reintentar:
        // el cambio pudo persistir y haber revocado el alcance del actor.
        error.committed=Boolean(committed);
        error.verified=verified;
        error.failedId=record.id;
        throw error;
      }
    }
    return {verified,total:plan.length};
  }
  return Object.freeze({buildPlan,savePlan,MAX_EQUIPMENTS_PER_SAVE});
});
