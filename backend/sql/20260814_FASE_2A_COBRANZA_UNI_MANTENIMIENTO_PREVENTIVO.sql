-- Mantto Gestor · Fase 2-A · Mantenimiento Preventivo United
-- Solo registra el módulo/permisos visuales. No crea ni altera tablas operativas.
START TRANSACTION;

INSERT INTO perm_modulos (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO', 'Mantenimiento Preventivo', 'cobranza-uni-mp-pro', 25, 1
FROM perm_agrupaciones
WHERE codigo = 'COBRANZA_UNI'
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), ruta_frontend = VALUES(ruta_frontend), orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT id_modulo, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL', 'Acceso visual', 'VISUAL', 0, 1
FROM perm_modulos WHERE codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO'
ON DUPLICATE KEY UPDATE id_modulo = VALUES(id_modulo), nombre = VALUES(nombre), tipo = VALUES(tipo), orden = 0, activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT id_elemento, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO', 'Mostrar modulo', 0, 1
FROM perm_elementos WHERE codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE id_elemento = VALUES(id_elemento), nombre = VALUES(nombre), orden = 0, activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 1
FROM perm_subelementos ps
JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE ps.codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO'
ON DUPLICATE KEY UPDATE id_subelemento = VALUES(id_subelemento), id_accion = VALUES(id_accion), activo = 1, updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT pm.codigo, pm.nombre, pm.ruta_frontend, pm.orden, pm.activo
FROM perm_modulos pm
WHERE pm.codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO';
