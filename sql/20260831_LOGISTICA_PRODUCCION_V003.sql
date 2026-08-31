/*
  LOGISTICA: PRODUCCION / PVO / DOCUMENTOS / CORTES SEMANALES (V003)
  Aplicar de forma controlada en Aiven.
  No incluye valores de Estatus Produccion; la lista funcional sigue pendiente.
*/

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logistica_produccion` (
  `id_produccion` bigint unsigned NOT NULL AUTO_INCREMENT,
  `id_log_ops` bigint unsigned DEFAULT NULL,
  `ppns_referencia` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proyecto_referencia` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_estatus_produccion` bigint unsigned DEFAULT NULL,
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
  KEY `idx_logistica_produccion_ppns_ref` (`ppns_referencia`),
  KEY `idx_logistica_produccion_estatus` (`id_estatus_produccion`,`activo`),
  KEY `idx_logistica_produccion_semana` (`anio_registro`,`semana_registro`,`activo`),
  CONSTRAINT `fk_log_prod_log_ops` FOREIGN KEY (`id_log_ops`) REFERENCES `log_ops` (`id_log_ops`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_estatus` FOREIGN KEY (`id_estatus_produccion`) REFERENCES `catalogo_general` (`id_catalogo`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_created_by` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_log_prod_semana` CHECK (`semana_registro` BETWEEN 1 AND 53),
  CONSTRAINT `chk_log_prod_anio` CHECK (`anio_registro` BETWEEN 2000 AND 2100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logistica_produccion_archivos` (
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
  CONSTRAINT `fk_log_prod_arch_produccion` FOREIGN KEY (`id_produccion`) REFERENCES `logistica_produccion` (`id_produccion`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_arch_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_arch_eliminado_por` FOREIGN KEY (`eliminado_por`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_log_prod_arch_tipo` CHECK (`tipo_archivo` IN ('CPVO','GM')),
  CONSTRAINT `chk_log_prod_arch_slot` CHECK ((`tipo_archivo`='CPVO' AND `numero_archivo` BETWEEN 1 AND 2) OR (`tipo_archivo`='GM' AND `numero_archivo` BETWEEN 1 AND 10)),
  CONSTRAINT `chk_log_prod_arch_tamanio_25mb` CHECK (`tamanio_bytes` IS NULL OR `tamanio_bytes` <= 26214400)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logistica_produccion_comentarios` (
  `id_comentario` bigint unsigned NOT NULL AUTO_INCREMENT,
  `id_produccion` bigint unsigned NOT NULL,
  `id_usuario` bigint DEFAULT NULL,
  `autor_legacy` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comentario` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_comentario_padre` bigint unsigned DEFAULT NULL,
  `origen` enum('USUARIO','MIGRACION','SISTEMA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USUARIO',
  `editado` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_comentario`),
  KEY `idx_log_prod_comentarios` (`id_produccion`,`activo`,`created_at`),
  KEY `idx_log_prod_comentarios_usuario` (`id_usuario`),
  KEY `idx_log_prod_comentarios_padre` (`id_comentario_padre`),
  CONSTRAINT `fk_log_prod_com_produccion` FOREIGN KEY (`id_produccion`) REFERENCES `logistica_produccion` (`id_produccion`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_com_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_prod_com_padre` FOREIGN KEY (`id_comentario_padre`) REFERENCES `logistica_produccion_comentarios` (`id_comentario`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logistica_cortes_semanales` (
  `id_corte` bigint unsigned NOT NULL AUTO_INCREMENT,
  `anio_iso` smallint unsigned NOT NULL,
  `semana_iso` tinyint unsigned NOT NULL,
  `fecha_corte` datetime NOT NULL,
  `id_corte_anterior` bigint unsigned DEFAULT NULL,
  `total_log_ops` int unsigned NOT NULL DEFAULT 0,
  `total_movimientos` int unsigned NOT NULL DEFAULT 0,
  `total_ingresos` int unsigned NOT NULL DEFAULT 0,
  `total_cambios_estatus` int unsigned NOT NULL DEFAULT 0,
  `snapshot_json` json NOT NULL,
  `movimientos_json` json NOT NULL,
  `estado` enum('GENERANDO','CERRADO','ERROR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GENERANDO',
  `hash_contenido` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generado_por` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_corte`),
  UNIQUE KEY `uq_logistica_corte_semana` (`anio_iso`,`semana_iso`),
  KEY `idx_logistica_corte_fecha` (`fecha_corte`),
  KEY `idx_logistica_corte_estado` (`estado`),
  CONSTRAINT `fk_logistica_corte_anterior` FOREIGN KEY (`id_corte_anterior`) REFERENCES `logistica_cortes_semanales` (`id_corte`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_logistica_corte_usuario` FOREIGN KEY (`generado_por`) REFERENCES `usuarios` (`id_SB`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_logistica_corte_semana` CHECK (`semana_iso` BETWEEN 1 AND 53),
  CONSTRAINT `chk_logistica_corte_anio` CHECK (`anio_iso` BETWEEN 2000 AND 2100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO estados_visuales (codigo,nombre,descripcion,categoria,emoji,prioridad,activo) VALUES
('FALTA_ARCHIVO_PVO','Falta Archivo PVO','El registro de Produccion no tiene ningun archivo CPVO activo.','OPERACION','📍',390,1),
('FALTA_PPNS','Falta PPNS','El registro de Produccion no tiene un PPNS valido relacionado con log_ops.','OPERACION','🥨',400,1),
('FALTAN_DOCS_PROD','Faltan Docs de Prod','El registro no tiene archivos de Produccion activos (regla provisional V1).','OPERACION','💾',410,1)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),descripcion=VALUES(descripcion),categoria=VALUES(categoria),emoji=VALUES(emoji),prioridad=VALUES(prioridad),activo=VALUES(activo);
