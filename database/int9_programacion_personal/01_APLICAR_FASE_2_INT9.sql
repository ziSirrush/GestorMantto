-- [Mantto Gestor | 2026-10-16 | INT9 FASE 2 | AIVEN MYSQL 8]
-- DDL MANUAL: NO EJECUTAR SIN AUTORIZACION EXPLICITA DE LA NUEVA TABLA.
-- PRECONDICIONES: FASE 1 aplicada; PRECHECK revisado; backup restaurable.
-- NO incluye datos ficticios; NO modifica ins_fl ni personal, permisos o roles.
-- DDL MySQL causa commit implicito: no se revierte con ROLLBACK.
-- Justificacion: se necesita persistir relaciones historicas n:n entre
-- personas externas de instalaciones_personal y equipos ins_fl, con fechas
-- opcionales de relevo, borrado logico y trazabilidad de quien programa.
-- No existe entidad equivalente en la sabana del 07/10/2026; verificar Aiven.

CREATE TABLE `instalaciones_programacion_asignaciones` (
  `id_asignacion` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_personal` BIGINT UNSIGNED NOT NULL,
  `id_ins_fl` BIGINT UNSIGNED NOT NULL,
  `fecha_desde` DATE DEFAULT NULL,
  `fecha_hasta` DATE DEFAULT NULL,
  `notas` VARCHAR(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` BIGINT DEFAULT NULL,
  `updated_by` BIGINT DEFAULT NULL,
  -- MySQL no implementa indices UNIQUE filtrados como SQLite.
  -- Solo activo=1 ocupa unicidad; filas con NULL (baja logica) se conservan.
  `marca_activa` TINYINT
    GENERATED ALWAYS AS (CASE WHEN `activo`=1 THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (`id_asignacion`),
  UNIQUE KEY `uq_int9_asignacion_persona_equipo_activa`
    (`id_personal`,`id_ins_fl`,`marca_activa`),
  KEY `idx_int9_asignacion_equipo` (`id_ins_fl`,`activo`),
  KEY `idx_int9_asignacion_persona` (`id_personal`,`activo`),
  KEY `idx_int9_asignacion_created_by` (`created_by`),
  KEY `idx_int9_asignacion_updated_by` (`updated_by`),
  CONSTRAINT `fk_int9_asignacion_personal` FOREIGN KEY (`id_personal`)
    REFERENCES `instalaciones_personal` (`id_personal`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_int9_asignacion_equipo` FOREIGN KEY (`id_ins_fl`)
    REFERENCES `ins_fl` (`id_ins_fl`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_int9_asignacion_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_int9_asignacion_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_int9_asignacion_activo` CHECK (`activo` IN (0,1)),
  CONSTRAINT `chk_int9_asignacion_fechas` CHECK
    (`fecha_desde` IS NULL OR `fecha_hasta` IS NULL OR `fecha_hasta`>=`fecha_desde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
