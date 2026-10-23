'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_5_V001]
// GET pc: datos crudos Aiven + dos vistas previas temporales F4/F5.
// No reemplaza ni actualiza valores persistidos. GAS sigue activo GC+VA+MP.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {PC_COLUMNS_UNI}=require('./cobranza-uni-administracion.constants');
const {todayMexicoCity_uni,previewPcLocalRows_uni}=
  require('./cobranza-uni-administracion.pc-formulas');
const {previewPcRelationsFromAiven_uni}=
  require('./cobranza-uni-administracion.pc-relations-service');
const {parseListPcQuery_uni,buildPcListQuery_uni}=
  require('./cobranza-uni-administracion.pc-query');

async function listVentaAdicionalAdmin_uni(req,dependencies={}){
  const params=parseListPcQuery_uni(req.query||{});
  const scopeBuilder=dependencies.scopeBuilder||scope.buildCobranzaProjectScopeSql_uni;
  const sql=buildPcListQuery_uni(params,scopeBuilder(req,'pc'));
  const conn=dependencies.connection||await db.getConnection();
  try{
    const [countRows]=await conn.query(sql.countSql,sql.countParams);
    const total=Number(countRows?.[0]?.total);
    if(!Number.isSafeInteger(total)||total<0)throw new Error('Conteo de registros no confiable.');
    const offset=(params.page-1)*params.pageSize;
    const [rows]=total>offset?await conn.query(sql.selectSql,sql.selectParams):[[]];
    const cutoff=todayMexicoCity_uni(dependencies.now||new Date());
    let relationPreview=null;
    let formulaRows=rows;
    if(rows.length){
      const relation=(dependencies.relationsPreview||previewPcRelationsFromAiven_uni);
      const computed=await relation(req,conn,rows,cutoff,{scopeBuilder});
      if(computed?.mode!=='preview_only'||!Array.isArray(computed.rows)||
        !Array.isArray(computed.formula_rows)||computed.formula_rows.length!==rows.length)
        throw new Error('Vistas relacionadas no confiables.');
      // No publicar una segunda copia de la fila de origen por el API.
      const {formula_rows,...publicPreview}=computed;
      relationPreview=publicPreview;
      formulaRows=formula_rows;
    }
    return {
      ok:true,source:'aiven',table:'pc',primary_key:'id_pc',readonly:true,
      columns:PC_COLUMNS_UNI,rows,total,
      formula_preview:previewPcLocalRows_uni(formulaRows,{cutoffIso:cutoff}),
      relation_preview:relationPreview,
      page:params.page,page_size:params.pageSize,
      pages:Math.ceil(total/params.pageSize),sort:params.sort,order:params.order
    };
  }finally{if(!dependencies.connection)conn.release();}
}
module.exports=Object.freeze({listVentaAdicionalAdmin_uni});
