-- [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
-- DESTRUCTIVO: elimina y recrea SOLO las tablas propias de Logistica > Produccion.
-- AUTORIZACION FUNCIONAL: el usuario prefirio borrar estas BD/tablas y recrearlas.
-- NO toca log_ops, ins_fl, usuarios, ventas_cotizaciones_cor, catalogo_general ni logistica_cortes_semanales.
--
-- Modelo corregido:
--   * SEMI_AUTOMATICO y MANUAL escriben en LAS MISMAS columnas.
--   * modo_registro solo conserva el origen de captura.
--   * comentario es un campo fijo del registro, no existe sistema/historial de comentarios.
--   * archivos solo se relacionan por id_produccion.
--
-- PRECONDICION:
-- catalogo_general debe contener los registros activos:
--   area='Logistica' AND elemento='Estatus Produccion'

USE mydb;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- No se desactivan FOREIGN_KEY_CHECKS: si existe una dependencia externa no contemplada,
-- el DROP debe fallar (fail-closed) en lugar de romper una FK silenciosamente.
DROP TABLE IF EXISTS `logistica_produccion_comentarios`;
DROP TABLE IF EXISTS `logistica_produccion_archivos`;
DROP TABLE IF EXISTS `logistica_produccion`;

CREATE TABLE `logistica_produccion` (
  `id_produccion` bigint unsigned NOT NULL AUTO_INCREMENT,
  `id_log_ops` bigint unsigned DEFAULT NULL,
  `modo_registro` enum('SEMI_AUTOMATICO','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SEMI_AUTOMATICO',

  `ppns` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proyecto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_cotizacion_venta` bigint unsigned DEFAULT NULL,
  `id_asesor` bigint DEFAULT NULL,
  `id_supervisor` bigint DEFAULT NULL,

  `fecha_pvo` date DEFAULT NULL,
  `fecha_pvo_fl` date DEFAULT NULL,
  `fecha_cubos` date DEFAULT NULL,
  `estatus_logistica` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  `id_estatus_produccion` bigint unsigned DEFAULT NULL,
  `comentario` text COLLATE utf8mb4_unicode_ci,

  `fecha_envio_docs_fabrica` date DEFAULT NULL,
  `fecha_envio_pago_fabrica` date DEFAULT NULL,

  `semana_registro` tinyint unsigned NOT NULL,
  `anio_registro` smallint unsigned NOT NULL,

  `origen_registro` enum('GESTOR','MIGRACION_SHEETS') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GESTOR',
  `legacy_source_key` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,

  `created_by` bigint DEFAULT NULL,
  `updated_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id_produccion`),
  UNIQUE KEY `uq_logistica_produccion_log_ops` (`id_log_ops`),
  UNIQUE KEY `uq_logistica_produccion_legacy_source` (`legacy_source_key`),

  KEY `idx_log_prod_ppns` (`ppns`),
  KEY `idx_log_prod_proyecto` (`proyecto`),
  KEY `idx_log_prod_modo` (`modo_registro`,`activo`),
  KEY `idx_log_prod_estatus` (`id_estatus_produccion`,`activo`),
  KEY `idx_log_prod_estatus_logistica` (`estatus_logistica`,`activo`),
  KEY `idx_log_prod_semana` (`anio_registro`,`semana_registro`,`activo`),
  KEY `idx_log_prod_venta` (`id_cotizacion_venta`),
  KEY `idx_log_prod_asesor` (`id_asesor`),
  KEY `idx_log_prod_supervisor` (`id_supervisor`),

  CONSTRAINT `fk_log_prod_log_ops`
    FOREIGN KEY (`id_log_ops`) REFERENCES `log_ops` (`id_log_ops`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_venta`
    FOREIGN KEY (`id_cotizacion_venta`) REFERENCES `ventas_cotizaciones_cor` (`id_cotizacion`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_asesor`
    FOREIGN KEY (`id_asesor`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_supervisor`
    FOREIGN KEY (`id_supervisor`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_estatus`
    FOREIGN KEY (`id_estatus_produccion`) REFERENCES `catalogo_general` (`id_catalogo`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_updated_by`
    FOREIGN KEY (`updated_by`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `chk_log_prod_semana` CHECK (`semana_registro` BETWEEN 1 AND 53),
  CONSTRAINT `chk_log_prod_anio` CHECK (`anio_registro` BETWEEN 2000 AND 2100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `logistica_produccion_archivos` (
  `id_archivo` bigint unsigned NOT NULL AUTO_INCREMENT,
  `id_produccion` bigint unsigned NOT NULL,
  `tipo_archivo` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero_archivo` tinyint unsigned NOT NULL,

  `nombre_archivo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extension` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mime_type` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tamanio_bytes` bigint unsigned DEFAULT NULL,

  `storage_provider` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AZURE_BLOB',
  `storage_container` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_blob_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_url` text COLLATE utf8mb4_unicode_ci,
  `origen_archivo` enum('NUEVO','LEGACY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NUEVO',

  `id_usuario` bigint DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `eliminado_por` bigint DEFAULT NULL,
  `eliminado_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id_archivo`),
  UNIQUE KEY `uq_log_prod_archivo_slot` (`id_produccion`,`tipo_archivo`,`numero_archivo`),
  KEY `idx_log_prod_archivos_produccion` (`id_produccion`,`activo`,`tipo_archivo`,`numero_archivo`),
  KEY `idx_log_prod_archivos_usuario` (`id_usuario`),

  CONSTRAINT `fk_log_prod_arch_produccion`
    FOREIGN KEY (`id_produccion`) REFERENCES `logistica_produccion` (`id_produccion`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_arch_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_arch_eliminado_por`
    FOREIGN KEY (`eliminado_por`) REFERENCES `usuarios` (`id_SB`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `chk_log_prod_arch_tipo` CHECK (`tipo_archivo` IN ('CPVO','GM')),
  CONSTRAINT `chk_log_prod_arch_slot` CHECK (
    (`tipo_archivo`='CPVO' AND `numero_archivo` BETWEEN 1 AND 2)
    OR (`tipo_archivo`='GM' AND `numero_archivo` BETWEEN 1 AND 10)
  ),
  CONSTRAINT `chk_log_prod_arch_tamanio_25mb` CHECK (
    `tamanio_bytes` IS NULL OR `tamanio_bytes` <= 26214400
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estados visuales ya usados por el modulo. No crea duplicados si ya existen.
INSERT INTO estados_visuales (codigo,nombre,descripcion,categoria,emoji,prioridad,activo) VALUES
('FALTA_ARCHIVO_PVO','Falta Archivo PVO','El registro de Produccion no tiene ningun archivo CPVO activo.','OPERACION','📍',390,1),
('FALTA_PPNS','Falta PPNS','El registro de Produccion no tiene un PPNS valido.','OPERACION','🥨',400,1),
('FALTAN_DOCS_PROD','Faltan Docs de Prod','El registro no tiene archivos de Produccion activos (regla provisional V1).','OPERACION','💾',410,1)
ON DUPLICATE KEY UPDATE
  nombre=VALUES(nombre),descripcion=VALUES(descripcion),categoria=VALUES(categoria),
  emoji=VALUES(emoji),prioridad=VALUES(prioridad),activo=VALUES(activo);

-- Verificacion estructural posterior.
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='logistica_produccion'
ORDER BY ORDINAL_POSITION;

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME IN ('logistica_produccion','logistica_produccion_archivos','logistica_produccion_comentarios')
ORDER BY TABLE_NAME;

-- Verifica el catalogo que consume Produccion; este FIX NO lo crea ni modifica.
SELECT id_catalogo,area,elemento,articulo,orden,activo
FROM catalogo_general
WHERE area='Logistica'
  AND elemento='Estatus Produccion'
  AND activo=1
ORDER BY orden,articulo;
