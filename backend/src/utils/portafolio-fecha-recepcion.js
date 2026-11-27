'use strict';

// Normalización compartida de la fecha de recepción registrada en Portafolio.
function receptionDateSql_uni(alias = 'p'){const a=String(alias);if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(a))throw new Error('Alias SQL inválido para recepción de mantenimiento.');return`COALESCE(STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento),''),'%Y-%m-%d'),STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento),''),'%d/%m/%Y'),STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento),''),'%d-%m-%Y'))`;}

module.exports = { receptionDateSql_uni };
