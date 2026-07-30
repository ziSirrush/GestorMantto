const db=require('../../config/db');
async function getConnection(){return db.getConnection();}
async function list(connection,{area,elemento}){const clauses=['activo=1'],params=[];if(area){clauses.push('area=?');params.push(area);}if(elemento){clauses.push('elemento=?');params.push(elemento);}const [rows]=await connection.query(`SELECT id_catalogo,area,elemento,articulo,descripcion,orden FROM catalogo_general WHERE ${clauses.join(' AND ')} ORDER BY area,elemento,orden,articulo`,params);return rows;}
module.exports={getConnection,list};
