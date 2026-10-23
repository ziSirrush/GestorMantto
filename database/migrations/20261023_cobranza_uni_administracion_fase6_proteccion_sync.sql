-- BLT NOW | COBRANZA UNI ADMINISTRACION | FASE 6 V001
-- REGISTRO DE PROTECCION MANUAL CONTRA GAS. APLICAR SOLO CON AUTORIZACION DBA.
-- Sin alteracion de gestion_credito ni de las tablas de otras administraciones.
-- ANTES de conceder permisos EDITAR y habilitar el nuevo administrador.
CREATE TABLE IF NOT EXISTS `cobranza_uni_gc_admin_guard` (
  `id_gc` BIGINT NOT NULL,
  `id_usuario` BIGINT NOT NULL,
  `campo` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_gc`),
  KEY `idx_gc_admin_guard_usuario` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- No genera ni revoca asignaciones de permisos.
-- Reconcilia manualmente casos bloqueados antes de eliminar un marcador.
