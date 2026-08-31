USE mydb;

-- ============================================================
-- [Aster | 2026-08-30 | ASTER-MG]
-- ALMACEN - CARGA DE INFORMACION - PERMISO INDEPENDIENTE V001
--
-- Crea UN modulo nuevo dentro de la agrupacion ALMACEN:
--   ALMACEN_CARGA -> almacen-carga
--
-- IMPORTANTE:
-- - NO crea tablas nuevas.
-- - NO modifica almacen_fuente_excel.
-- - NO otorga el permiso a ningun rol ni usuario.
-- - El acceso queda DENEGADO por defecto hasta asignarlo desde
--   Panel de Control a los pocos roles/usuarios autorizados.
-- - Idempotente.
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_almacen_carga_permiso_v001$$
CREATE PROCEDURE sp_almacen_carga_permiso_v001()
BEGIN
  DECLARE v_agrupacion BIGINT DEFAULT NULL;
  DECLARE v_modulo BIGINT DEFAULT NULL;
  DECLARE v_elemento BIGINT DEFAULT NULL;
  DECLARE v_subelemento BIGINT DEFAULT NULL;
  DECLARE v_accion BIGINT DEFAULT NULL;

  SELECT id_agrupacion INTO v_agrupacion
  FROM perm_agrupaciones
  WHERE codigo='ALMACEN'
  LIMIT 1;

  IF v_agrupacion IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='No existe la agrupacion ALMACEN en perm_agrupaciones.';
  END IF;

  SELECT id_accion INTO v_accion
  FROM perm_acciones
  WHERE codigo='ACCESO_VISUAL' AND activo=1
  LIMIT 1;

  IF v_accion IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='No existe la accion ACCESO_VISUAL activa en perm_acciones.';
  END IF;

  START TRANSACTION;

  IF NOT EXISTS (
    SELECT 1 FROM perm_modulos WHERE codigo='ALMACEN_CARGA'
  ) THEN
    INSERT INTO perm_modulos
      (id_agrupacion,codigo,nombre,ruta_frontend,orden,activo)
    VALUES
      (v_agrupacion,'ALMACEN_CARGA','Carga de Información','almacen-carga',70,1);
  END IF;

  UPDATE perm_modulos
  SET id_agrupacion=v_agrupacion,
      nombre='Carga de Información',
      ruta_frontend='almacen-carga',
      orden=70,
      activo=1
  WHERE codigo='ALMACEN_CARGA';

  SELECT id_modulo INTO v_modulo
  FROM perm_modulos
  WHERE codigo='ALMACEN_CARGA'
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM perm_elementos WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL'
  ) THEN
    INSERT INTO perm_elementos
      (id_modulo,codigo,nombre,tipo,orden,activo)
    VALUES
      (v_modulo,'ALMACEN_CARGA_ACCESO_VISUAL','Acceso visual','VISUAL',0,1);
  END IF;

  UPDATE perm_elementos
  SET id_modulo=v_modulo,nombre='Acceso visual',tipo='VISUAL',orden=0,activo=1
  WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL';

  SELECT id_elemento INTO v_elemento
  FROM perm_elementos
  WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL'
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM perm_subelementos WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL_MODULO'
  ) THEN
    INSERT INTO perm_subelementos
      (id_elemento,codigo,nombre,orden,activo)
    VALUES
      (v_elemento,'ALMACEN_CARGA_ACCESO_VISUAL_MODULO','Mostrar módulo',0,1);
  END IF;

  UPDATE perm_subelementos
  SET id_elemento=v_elemento,nombre='Mostrar módulo',orden=0,activo=1
  WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL_MODULO';

  SELECT id_subelemento INTO v_subelemento
  FROM perm_subelementos
  WHERE codigo='ALMACEN_CARGA_ACCESO_VISUAL_MODULO'
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM perm_subelemento_acciones
    WHERE codigo_permiso='ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  ) THEN
    INSERT INTO perm_subelemento_acciones
      (id_subelemento,id_accion,codigo_permiso,activo)
    VALUES
      (v_subelemento,v_accion,'ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',1);
  END IF;

  UPDATE perm_subelemento_acciones
  SET id_subelemento=v_subelemento,id_accion=v_accion,activo=1
  WHERE codigo_permiso='ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

  COMMIT;
END$$

CALL sp_almacen_carga_permiso_v001()$$
DROP PROCEDURE sp_almacen_carga_permiso_v001$$
DELIMITER ;

-- ============================================================
-- VALIDACION - MODULO Y PERMISO
-- ============================================================
SELECT
  m.id_modulo,m.codigo,m.nombre,m.ruta_frontend,m.orden,m.activo,
  psa.id_subelemento_accion,psa.codigo_permiso,psa.activo AS permiso_activo
FROM perm_modulos m
JOIN perm_elementos e ON e.id_modulo=m.id_modulo
JOIN perm_subelementos s ON s.id_elemento=e.id_elemento
JOIN perm_subelemento_acciones psa ON psa.id_subelemento=s.id_subelemento
WHERE m.codigo='ALMACEN_CARGA';

-- Debe devolver 0 filas si nadie ha recibido acceso todavia.
SELECT rp.*
FROM rol_permisos rp
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion=rp.id_subelemento_accion
WHERE psa.codigo_permiso='ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

SELECT up.*
FROM usuario_permisos up
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion=up.id_subelemento_accion
WHERE psa.codigo_permiso='ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
