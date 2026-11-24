/* Selectores de asignación ins_fl: Administración y Dashboard Modo Junta. */
(function(root,factory){
  'use strict';
  const exported=Object.freeze(factory());
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;
  if(root)root.ManttoInstalacionesPersonalSelectores_cor=exported;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const PERSONAL_FIELDS=new Set(['ajustador','subcontratista']);
  const stringValue=value=>value==null?'':String(value).trim();
  function error_cor(message,code){return Object.assign(new Error(message),{code});}
  function isPersonalField_cor(field) {return PERSONAL_FIELDS.has(field);}
  function personalValues_cor(field,catalog) {
    const values=catalog?.personal?.[field];
    return isPersonalField_cor(field)&&Array.isArray(values)?[...new Set(values.map(stringValue).filter(Boolean))]:null;
  }
  function personalOptions_cor(field,catalog,current,escape) {
    const values=personalValues_cor(field,catalog);
    const chosen=stringValue(current);
    const option=(value,label,selected=false,disabled=false)=>'<option value="'+escape(value)+'"'+
      (selected?' selected':'')+(disabled?' disabled':'')+'>'+escape(label)+'</option>';
    if(!values)return option(chosen,chosen||'Catálogo no disponible',true,true);
    return option('','Sin asignar',!chosen)+
      (chosen&&!values.includes(chosen)?option(chosen,chosen+' (valor actual)',true,true):'')+
      values.map(value=>option(value,value,value===chosen)).join('');
  }
  function assertPersonalCatalog_cor(data) {
    if(!Array.isArray(data?.personal?.ajustador) ||
       !(Array.isArray(data.personal.subcontratista)||data.personal.subcontratista===null))
      throw error_cor('Catálogo de personal no disponible.','ADMIN_PERSONAL_CATALOG_INVALID');
    return data;
  }

  function validatePersonalValue_cor(field,raw,fieldMeta={},catalog=null){
    const v=stringValue(raw);
    if (isPersonalField_cor(field)) {
      const values=personalValues_cor(field,catalog);
      if(!values)return {ok:false,error:'Catálogo de personal no disponible. Actualiza e inténtalo de nuevo.'};
      if(!v)return {ok:true,value:null};
      return values.includes(v)&&v.length<=Number(fieldMeta.max_length||255)
        ? {ok:true,value:v} : {ok:false,error:'Selecciona un valor del catálogo de personal activo.'};
    }

    return {ok:false,error:'Campo de asignación no válido.'};
  }
  return {isPersonalField_cor,personalValues_cor,personalOptions_cor,assertPersonalCatalog_cor,validatePersonalValue_cor};
});
