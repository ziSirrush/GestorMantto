USE mydb;

-- SOLO LECTURA.
-- Verifica los prerrequisitos de BD ya aplicados antes de desplegar el código.

SELECT
    c.TABLE_NAME,
    c.COLUMN_NAME,
    c.COLUMN_TYPE,
    c.IS_NULLABLE
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
  AND (
        (c.TABLE_NAME = 'cobranza_fuente_cor'
         AND c.COLUMN_NAME IN (
             'orden_hito',
             'fecha_programada',
             'fecha_notificada',
             'estatus_hito'
         ))
        OR c.TABLE_NAME = 'cobranza_equipos_cor'
      )
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

SHOW CREATE TABLE cobranza_equipos_cor;

SELECT
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE,
    kcu.COLUMN_NAME,
    kcu.REFERENCED_TABLE_NAME,
    kcu.REFERENCED_COLUMN_NAME
FROM information_schema.TABLE_CONSTRAINTS tc
LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND kcu.TABLE_NAME = tc.TABLE_NAME
 AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
  AND tc.TABLE_NAME = 'cobranza_equipos_cor'
ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;
