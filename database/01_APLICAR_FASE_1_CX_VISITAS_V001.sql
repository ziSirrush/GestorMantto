-- [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 1 V001]
-- CAMBIO ADITIVO / AIVEN MySQL 8 / CX > VISITAS.
-- Base: ziSirrush/GestorMantto main c8923226 (Version 101526.4).
-- No genera datos, no asigna roles, no muestra el modulo, no crea endpoints.
-- REQUIERE: ejecutar y revisar primero 00_PRECHECK en la BD correcta.
-- NO ejecutar usando cliente mysql --force (debe detenerse ante error).
-- MySQL hace COMMIT implicito en DDL: los bloques no son atomicos entre si.
USE mydb;

-- I. GUARD DE PRECONDICIONES: aborta antes del DDL si no existe
-- CX/Visitas/Acceso visual correctamente enlazado o faltan acciones.
SET @cx_visitas_catalog_ok_v001 := (
  SELECT
      (SELECT COUNT(*) FROM perm_agrupaciones
        WHERE codigo = 'CUSTOMER_EXPERIENCE' AND activo = 1
          AND UPPER(empresa) LIKE '%CORELLIAN%') = 1
  AND (SELECT COUNT(*) FROM perm_modulos pm
       JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
       WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
         AND pm.ruta_frontend = 'cx-visitas' AND pm.activo = 1
         AND pa.codigo = 'CUSTOMER_EXPERIENCE' AND pa.activo = 1
         AND UPPER(pa.empresa) LIKE '%CORELLIAN%') = 1
  AND (SELECT COUNT(*) FROM perm_subelemento_acciones psa
       JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
       JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
       JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
       JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
       WHERE psa.codigo_permiso = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
         AND psa.activo = 1 AND pac.codigo = 'ACCESO_VISUAL' AND pac.activo = 1
         AND ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO'
         AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL'
         AND pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS') = 1
  AND (SELECT COUNT(*) FROM perm_acciones
       WHERE codigo IN ('VER', 'CREAR', 'EDITAR', 'DESACTIVAR', 'VER_HISTORIAL')
         AND activo = 1) = 5
  AND NOT EXISTS (
       SELECT 1 FROM perm_elementos pe
       JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
       WHERE pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
         AND pm.codigo <> 'CUSTOMER_EXPERIENCE_VISITAS')
  AND NOT EXISTS (
       SELECT 1 FROM perm_subelementos ps
       JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
       WHERE ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS'
         AND pe.codigo <> 'CUSTOMER_EXPERIENCE_VISITAS_GESTION')
  AND NOT EXISTS (
       SELECT 1 FROM perm_subelemento_acciones psa
       JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
       WHERE psa.codigo_permiso IN (
         'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
         'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
         'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
         'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
         'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
       ) AND ps.codigo <> 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS')
);

-- NO borramos tablas preexistentes: si existen, verificamos su estructura basica.
SET @cx_visitas_table_ok_v001 := (
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas') = 0
  OR (
    (SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas'
       AND ENGINE = 'InnoDB') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas'
           AND ((COLUMN_NAME = 'id_visita' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'id_usuario_creador' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'id_usuario_responsable' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'estado' AND DATA_TYPE = 'varchar')
             OR (COLUMN_NAME = 'inactivo' AND DATA_TYPE = 'tinyint')
             OR (COLUMN_NAME = 'referencia_origen' AND DATA_TYPE = 'varchar')
             OR (COLUMN_NAME = 'fecha_programada_utc' AND DATA_TYPE = 'datetime')
             OR (COLUMN_NAME = 'created_at' AND DATA_TYPE = 'datetime'))) = 8
  )
);
SET @cx_visitas_history_table_ok_v001 := (
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas_historial') = 0
  OR (
    (SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas_historial'
       AND ENGINE = 'InnoDB') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas_historial'
           AND ((COLUMN_NAME = 'id_evento' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'id_visita' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'id_actor_usuario' AND DATA_TYPE = 'bigint')
             OR (COLUMN_NAME = 'accion' AND DATA_TYPE = 'varchar')
             OR (COLUMN_NAME = 'detalle' AND DATA_TYPE = 'json')
             OR (COLUMN_NAME = 'created_at' AND DATA_TYPE = 'datetime'))) = 6
  )
);
SET @cx_visitas_ready_v001 :=
    (@cx_visitas_catalog_ok_v001 = 1)
    AND (@cx_visitas_table_ok_v001 = 1)
    AND (@cx_visitas_history_table_ok_v001 = 1);

-- Se usa un SELECT imposible para forzar un ERROR SQL sin CREATE ROUTINE;
-- nunca suprimir ese error ni continuar si ocurre.
SET @cx_visitas_guard_sql_v001 := IF(
    @cx_visitas_ready_v001 = 1,
    'SELECT ''CX_VISITAS_PRECHECK_OK'' AS resultado',
    'SELECT * FROM `__BLT_NOW_CX_VISITAS_PRECHECK_BLOQUEADO_V001__`'
);
PREPARE cx_visitas_guard_v001 FROM @cx_visitas_guard_sql_v001;
EXECUTE cx_visitas_guard_v001;
DEALLOCATE PREPARE cx_visitas_guard_v001;

-- II. ESQUEMA NUEVO: sin FK cruzadas a Ventas/Instalaciones ni a usuarios.
-- Los campos de referencia son voluntariamente neutrales, porque el flujo
-- de visitas y sus tipos no estan confirmados. No guardar credenciales/PII extra.
CREATE TABLE IF NOT EXISTS cx_visitas (
  id_visita BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario_creador BIGINT NOT NULL,
  id_usuario_responsable BIGINT DEFAULT NULL,
  id_usuario_ultima_modificacion BIGINT DEFAULT NULL,
  titulo VARCHAR(200) NOT NULL,
  objetivo TEXT NULL,
  resultado TEXT NULL,
  observaciones TEXT NULL,
  referencia_origen VARCHAR(40) DEFAULT NULL,
  referencia_id VARCHAR(120) DEFAULT NULL,
  proyecto_nombre VARCHAR(200) DEFAULT NULL,
  cliente_nombre VARCHAR(200) DEFAULT NULL,
  ubicacion VARCHAR(255) DEFAULT NULL,
  fecha_programada_utc DATETIME(3) DEFAULT NULL,
  fecha_realizada_utc DATETIME(3) DEFAULT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'BORRADOR',
  inactivo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_visita),
  KEY idx_cx_visitas_responsable_fecha (id_usuario_responsable, fecha_programada_utc),
  KEY idx_cx_visitas_creador_fecha (id_usuario_creador, fecha_programada_utc),
  KEY idx_cx_visitas_estado_fecha (inactivo, estado, fecha_programada_utc),
  KEY idx_cx_visitas_referencia (referencia_origen, referencia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Bitacora de eventos: Fase 2 debera INSERTAR con identidad real (actorUser).
-- No insertar mensajes ni historico desde esta migracion.
CREATE TABLE IF NOT EXISTS cx_visitas_historial (
  id_evento BIGINT NOT NULL AUTO_INCREMENT,
  id_visita BIGINT NOT NULL,
  id_actor_usuario BIGINT NOT NULL,
  accion VARCHAR(60) NOT NULL,
  detalle JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_evento),
  KEY idx_cx_visitas_historial_visita (id_visita, created_at),
  KEY idx_cx_visitas_historial_actor (id_actor_usuario, created_at),
  CONSTRAINT fk_cx_visitas_historial_visita
    FOREIGN KEY (id_visita) REFERENCES cx_visitas (id_visita)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- III. Verificacion del DDL antes de escribir en el catalogo de permisos.
SET @cx_visitas_ddl_ok_v001 := (
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
     ('cx_visitas', 'cx_visitas_historial') AND ENGINE = 'InnoDB') = 2
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas'
         AND COLUMN_NAME IN ('id_visita', 'id_usuario_creador',
           'id_usuario_responsable', 'estado', 'inactivo', 'fecha_programada_utc')) = 6
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cx_visitas_historial'
         AND COLUMN_NAME IN ('id_evento', 'id_visita', 'id_actor_usuario', 'accion')) = 4
);
SET @cx_visitas_ddl_guard_sql_v001 := IF(
    @cx_visitas_ddl_ok_v001 = 1,
    'SELECT ''CX_VISITAS_ESQUEMA_OK'' AS resultado',
    'SELECT * FROM `__BLT_NOW_CX_VISITAS_ESQUEMA_INVALIDO_V001__`'
);
PREPARE cx_visitas_schema_guard_v001 FROM @cx_visitas_ddl_guard_sql_v001;
EXECUTE cx_visitas_schema_guard_v001;
DEALLOCATE PREPARE cx_visitas_schema_guard_v001;

-- IV. CATALOGO INCREMENTAL: no reescribir permisos visuales existentes.
START TRANSACTION;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT pm.id_modulo,
       'CUSTOMER_EXPERIENCE_VISITAS_GESTION',
       'Gestion de visitas', 'TABLA', 10, 1
FROM perm_modulos pm
JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'CUSTOMER_EXPERIENCE'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pm.ruta_frontend = 'cx-visitas'
  AND pm.activo = 1
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo), nombre = VALUES(nombre),
  tipo = VALUES(tipo), orden = VALUES(orden), activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT pe.id_elemento,
       'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS',
       'Registros e historial', 10, 1
FROM perm_elementos pe
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento), nombre = VALUES(nombre),
  orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

-- Reutiliza: VER/CREAR/EDITAR/DESACTIVAR/VER_HISTORIAL.
-- Las acciones de escritura ya marcan requiere_auditoria en el catalogo actual.
INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pac.id_accion,
       CONCAT(ps.codigo, '.', pac.codigo), 1
FROM perm_subelementos ps
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
JOIN perm_acciones pac ON pac.codigo IN
  ('VER', 'CREAR', 'EDITAR', 'DESACTIVAR', 'VER_HISTORIAL')
  AND pac.activo = 1
WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
  AND ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion), activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- NO se conceden permisos en rol_permisos ni a usuarios particulares.
-- El modulo NO se muestra aun: core/app.js deja cx_visitas oculto
-- hasta la fase de integracion visual y validacion de seguridad.
-- Ejecutar ahora 02_SMOKE_FASE_1_CX_VISITAS_V001.sql.
