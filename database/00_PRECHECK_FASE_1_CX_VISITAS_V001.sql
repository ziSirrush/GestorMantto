-- [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 1 V001]
-- PRECHECK DE AIVEN / MySQL 8. SOLO LECTURA.
-- Ejecutar en la BD de desarrollo o destino validado ANTES de 01_APLICAR.
-- NO modifica tablas, datos, permisos, roles ni usuarios.
USE mydb;

SELECT DATABASE() AS esquema_seleccionado, VERSION() AS mysql_version,
       @@session.time_zone AS zona_sesion;

-- 1. La agrupacion, el modulo existente y la accion visual deben conservarse.
SELECT pa.id_agrupacion, pa.codigo AS agrupacion, pa.empresa,
       pm.id_modulo, pm.codigo AS modulo, pm.ruta_frontend, pm.orden,
       pa.activo AS agrupacion_activa, pm.activo AS modulo_activo
FROM perm_agrupaciones pa
LEFT JOIN perm_modulos pm ON pm.id_agrupacion = pa.id_agrupacion
                         AND pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
WHERE pa.codigo = 'CUSTOMER_EXPERIENCE';

SELECT psa.id_subelemento_accion, psa.codigo_permiso, psa.activo,
       pac.codigo AS accion, ps.codigo AS subelemento,
       pe.codigo AS elemento, pm.codigo AS modulo, pa.codigo AS agrupacion
FROM perm_subelemento_acciones psa
JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
WHERE psa.codigo_permiso = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

-- 2. Todas las acciones se REUTILIZAN, no se crean ni se modifican.
SELECT codigo, id_accion, nombre, requiere_auditoria, activo
FROM perm_acciones
WHERE codigo IN ('VER', 'CREAR', 'EDITAR', 'DESACTIVAR', 'VER_HISTORIAL')
ORDER BY codigo;

-- 3. Detectar tablas existentes antes de crear: NUNCA sobrescribir una tabla ajena.
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cx_visitas', 'cx_visitas_historial',
                     'cx_venta_instalacion_encuestas', 'cx_mantenimiento_encuestas')
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cx_visitas', 'cx_visitas_historial')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 4. Inspeccionar colisiones del catalogo funcional; no deben pertenecer a otro modulo.
SELECT pe.id_elemento, pe.codigo, pm.codigo AS modulo_propietario,
       ps.id_subelemento, ps.codigo AS subelemento,
       psa.codigo_permiso, psa.activo
FROM perm_elementos pe
LEFT JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
LEFT JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento
LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento
WHERE pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
   OR ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS'
ORDER BY pe.codigo, ps.codigo, psa.codigo_permiso;

-- 5. SEMAFORO automatizado del catalogo (no garantiza estructura de tablas preexistentes).
SELECT q.*,
       CASE WHEN q.agrupaciones_validas = 1
                 AND q.modulos_validos = 1
                 AND q.visuales_validos = 1
                 AND q.acciones_validas = 5
            THEN 'APTO_CATALOGO_PENDIENTE_REVISAR_ESQUEMA'
            ELSE 'BLOQUEADO_NO_EJECUTAR_APLICAR' END AS estado_precheck
FROM (
    SELECT
      (SELECT COUNT(*) FROM perm_agrupaciones
       WHERE codigo = 'CUSTOMER_EXPERIENCE' AND activo = 1
         AND UPPER(empresa) LIKE '%CORELLIAN%') AS agrupaciones_validas,
      (SELECT COUNT(*) FROM perm_modulos pm
       JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
       WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
         AND pm.ruta_frontend = 'cx-visitas' AND pm.activo = 1
         AND pa.codigo = 'CUSTOMER_EXPERIENCE'
         AND pa.activo = 1 AND UPPER(pa.empresa) LIKE '%CORELLIAN%') AS modulos_validos,
      (SELECT COUNT(*) FROM perm_subelemento_acciones psa
       JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
       JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
       JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
       JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
       WHERE psa.codigo_permiso = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
         AND psa.activo = 1 AND pac.codigo = 'ACCESO_VISUAL' AND pac.activo = 1
         AND ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO'
         AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL'
         AND pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS') AS visuales_validos,
      (SELECT COUNT(*) FROM perm_acciones
       WHERE codigo IN ('VER', 'CREAR', 'EDITAR', 'DESACTIVAR', 'VER_HISTORIAL')
         AND activo = 1) AS acciones_validas
) AS q;

-- ATENCION: Que el precheck sea APTO no autoriza desplegar por si solo.
-- Si cx_visitas o cx_visitas_historial ya existen, comparar definicion completa.
-- Nunca ejecutar el script con mysql --force ni sobre un esquema distinto a mydb.
