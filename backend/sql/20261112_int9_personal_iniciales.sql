-- BLT NOW / INT9 | 2026-11-12 | Migracion aditiva (NO se ejecuta automaticamente)
-- Ejecutar en mydb (Aiven) tras revisar respaldo y ventana de mantenimiento.
-- Antes de ejecutar: confirmar que la columna no existe mediante:
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'instalaciones_personal'
   AND COLUMN_NAME = 'iniciales';

-- Ejecutar SOLO si la consulta anterior no devuelve filas:
ALTER TABLE instalaciones_personal
  ADD COLUMN iniciales VARCHAR(30) CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL AFTER experiencia;

-- Verificacion posterior sin modificar datos:
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'instalaciones_personal'
   AND COLUMN_NAME = 'iniciales';
