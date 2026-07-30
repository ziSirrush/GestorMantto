const db = require('../../config/db');
const TABLE = 'ventas_clientes_contactos';
async function getConnection(){return db.getConnection();}
async function listByClient(connection,idCliente){const [rows]=await connection.query(`SELECT * FROM ${TABLE} WHERE id_cliente=? AND activo=1 ORDER BY contacto_principal DESC,nombre_contacto ASC,id_contacto ASC`,[idCliente]);return rows;}
async function findById(connection,idContacto,{includeInactive=false}={}){const [rows]=await connection.query(`SELECT * FROM ${TABLE} WHERE id_contacto=? ${includeInactive?'':'AND activo=1'} LIMIT 1`,[idContacto]);return rows[0]||null;}
async function insert(connection,data){const fields=Object.keys(data);const [result]=await connection.query(`INSERT INTO ${TABLE} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,fields.map(f=>data[f]));return result.insertId;}
async function update(connection,idContacto,data){const fields=Object.keys(data);if(!fields.length)return 0;const [r]=await connection.query(`UPDATE ${TABLE} SET ${fields.map(f=>`${f}=?`).join(',')} WHERE id_contacto=?`,[...fields.map(f=>data[f]),idContacto]);return r.affectedRows;}
async function unsetPrincipal(connection,idCliente){await connection.query(`UPDATE ${TABLE} SET contacto_principal=0 WHERE id_cliente=?`,[idCliente]);}
async function softDelete(connection,idContacto,actorId){const [r]=await connection.query(`UPDATE ${TABLE} SET activo=0,contacto_principal=0,updated_by=? WHERE id_contacto=? AND activo=1`,[actorId,idContacto]);return r.affectedRows;}
module.exports={getConnection,listByClient,findById,insert,update,unsetPrincipal,softDelete};
