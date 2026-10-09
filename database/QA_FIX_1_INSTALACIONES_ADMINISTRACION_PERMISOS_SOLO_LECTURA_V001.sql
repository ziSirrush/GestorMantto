-- [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
-- VALIDACION SQL SOLO LECTURA. No modifica la base de datos.
-- Lista permisos registrados (el permiso total no sustituye ACCESO_VISUAL).
SELECT psa.codigo_permiso, psa.activo,
       pa.codigo AS accion, pa.requiere_auditoria,
       ps.codigo AS subelemento, pm.codigo AS modulo, pg.empresa AS dominio
FROM perm_subelemento_acciones psa
INNER JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pg ON pg.id_agrupacion = pm.id_agrupacion
WHERE psa.codigo_permiso IN (
 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
)
ORDER BY psa.codigo_permiso;

-- Asignaciones explicitas de rol al permiso global (no garantiza efectividad:
-- tambien aplican anulaciones por usuario, estado, fechas y puerta CORELLIAN).
SELECT r.id_rol, r.nombre AS rol, rp.permitido AS concedido_rol
FROM rol_permisos rp
INNER JOIN roles r ON r.id_rol = rp.id_rol
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso =
 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
ORDER BY r.id_rol;

-- Permisos directos por usuario. No inferir permiso efectivo de esta lista.
SELECT up.id_usuario, up.permitido, up.activo, up.fecha_inicio, up.fecha_fin
FROM usuario_permisos up
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso =
 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
ORDER BY up.id_usuario;
