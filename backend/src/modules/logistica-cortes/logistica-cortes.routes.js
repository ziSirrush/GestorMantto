'use strict';
const express=require('express');
const db=require('../../config/db');
const {requireAuth}=require('../../middleware/auth.middleware');
const {runWeeklyClose}=require('../../jobs/logisticaCierreSemanal.job');
const router=express.Router();router.use(requireAuth);
function parse(row){if(!row)return row;for(const key of ['snapshot_json','movimientos_json'])if(typeof row[key]==='string')try{row[key]=JSON.parse(row[key]);}catch(_e){row[key]=[];}return row;}
router.get('/ultimo',async(_req,res,next)=>{try{const [r]=await db.query(`SELECT * FROM logistica_cortes_semanales WHERE estado='CERRADO' ORDER BY anio_iso DESC,semana_iso DESC LIMIT 1`);res.json({ok:true,data:r[0]?parse(r[0]):null});}catch(e){next(e);}});
router.get('/:anio/:semana',async(req,res,next)=>{try{const [r]=await db.query(`SELECT * FROM logistica_cortes_semanales WHERE anio_iso=? AND semana_iso=? LIMIT 1`,[req.params.anio,req.params.semana]);res.json({ok:true,data:r[0]?parse(r[0]):null});}catch(e){next(e);}});
router.get('/',async(_req,res,next)=>{try{const [r]=await db.query(`SELECT id_corte,anio_iso,semana_iso,fecha_corte,id_corte_anterior,total_log_ops,total_movimientos,total_ingresos,total_cambios_estatus,estado,hash_contenido,created_at FROM logistica_cortes_semanales ORDER BY anio_iso DESC,semana_iso DESC LIMIT 100`);res.json({ok:true,data:r});}catch(e){next(e);}});
router.post('/ejecutar',async(req,res,next)=>{try{const roles=new Set([req.user.rol,...(req.user.roles||[])]);if(![...roles].some(x=>String(x).startsWith('Programador')))return res.status(403).json({ok:false,message:'Ejecución manual reservada para Programador.'});res.json(await runWeeklyClose(new Date(),req.user.id_SB||req.user.id));}catch(e){next(e);}});
module.exports=router;
