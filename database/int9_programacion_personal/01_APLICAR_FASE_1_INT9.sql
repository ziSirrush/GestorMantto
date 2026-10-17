-- [Mantto Gestor | 2026-10-16 | INT-9 FASE 1 | AIVEN MYSQL 8]
-- *** REQUIERE AUTORIZACION EXPLICITA PARA NUEVA TABLA Y PRECHECK APROBADO ***
-- Este archivo NO se ejecuta automaticamente; no contiene datos ficticios.
-- Justificacion: usuarios exige identidad de login, y `ins_fl.ajustador` /
-- `ins_fl.subcontratista` son texto por equipo, no personas independientes
-- con puesto, categoria, experiencia, baja y registro de quien los administro.
-- Una tabla unificada sustituye dos tablas del LAB.
-- DDL hace commit implicito en MySQL. Respaldo validado antes de ejecutar.

CREATE TABLE `instalaciones_personal` (
  `id_personal` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo_personal` ENUM('MONTADOR','AJUSTADOR') NOT NULL,
  `nombre` VARCHAR(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contratista` VARCHAR(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `puesto` ENUM('Mecánico','Ayudante') DEFAULT NULL,
  `categoria` VARCHAR(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `experiencia` VARCHAR(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` BIGINT DEFAULT NULL,
  `updated_by` BIGINT DEFAULT NULL,
  -- Unicidad para personas activas; las bajas no bloquean el reingreso.
  `nombre_activo` VARCHAR(180) COLLATE utf8mb4_unicode_ci
    GENERATED ALWAYS AS (CASE WHEN `activo`=1 THEN TRIM(`nombre`) ELSE NULL END) STORED,
  `contratista_activo` VARCHAR(160) COLLATE utf8mb4_unicode_ci
    GENERATED ALWAYS AS (CASE WHEN `activo`=1
      THEN CASE WHEN `tipo_personal`='MONTADOR' THEN TRIM(`contratista`) ELSE '' END
      ELSE NULL END) STORED,
  PRIMARY KEY (`id_personal`),
  UNIQUE KEY `uq_int9_personal_activo` (`tipo_personal`,`nombre_activo`,`contratista_activo`),
  KEY `idx_int9_personal_tipo_activo` (`tipo_personal`,`activo`,`nombre`),
  KEY `idx_int9_personal_contratista` (`contratista`),
  KEY `idx_int9_personal_created_by` (`created_by`),
  KEY `idx_int9_personal_updated_by` (`updated_by`),
  CONSTRAINT `fk_int9_personal_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_int9_personal_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_int9_personal_tipo_datos` CHECK (
    (`tipo_personal`='MONTADOR' AND `contratista` IS NOT NULL
       AND TRIM(`contratista`)<>'' AND `puesto` IS NOT NULL AND `experiencia` IS NULL)
    OR (`tipo_personal`='AJUSTADOR' AND `contratista` IS NULL AND `puesto` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- El catalogo es aditivo y utiliza identificadores reales, no IDs asumidos.
-- Ningun rol obtiene privilegios automaticamente. La concesion se hace
-- mediante los permisos nativos del Panel de Control y respeta el alcance.
START TRANSACTION;
INSERT INTO perm_modulos (id_agrupacion,codigo,nombre,ruta_frontend,orden,activo)
SELECT a.id_agrupacion,'INSTALACIONES_PROGRAMACION_PERSONAL',
       'Programación de Personal','instalaciones-programacion-personal',100,1
FROM perm_agrupaciones a
WHERE a.codigo='INSTALACIONES' AND a.activo=1
  AND NOT EXISTS(SELECT 1 FROM perm_modulos m
                 WHERE m.codigo='INSTALACIONES_PROGRAMACION_PERSONAL');

INSERT INTO perm_elementos (id_modulo,codigo,nombre,tipo,orden,activo)
SELECT m.id_modulo,'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO',
       'Programación y personal','VISTA',1,1
FROM perm_modulos m
WHERE m.codigo='INSTALACIONES_PROGRAMACION_PERSONAL'
  AND NOT EXISTS(SELECT 1 FROM perm_elementos e
                 WHERE e.codigo='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO');

INSERT INTO perm_subelementos (id_elemento,codigo,nombre,orden,activo)
SELECT e.id_elemento,'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION',
       'Catálogo y asignación de personal',1,1
FROM perm_elementos e
WHERE e.codigo='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO'
  AND NOT EXISTS(SELECT 1 FROM perm_subelementos s
                 WHERE s.codigo='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION');

INSERT INTO perm_subelemento_acciones (id_subelemento,id_accion,codigo_permiso,activo)
SELECT s.id_subelemento,a.id_accion,
       CONCAT('INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION.',a.codigo),1
FROM perm_subelementos s
JOIN perm_acciones a ON a.codigo IN ('VER','CREAR','EDITAR','DESACTIVAR') AND a.activo=1
WHERE s.codigo='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION'
  AND NOT EXISTS(SELECT 1 FROM perm_subelemento_acciones p
                 WHERE p.id_subelemento=s.id_subelemento AND p.id_accion=a.id_accion);
COMMIT;
