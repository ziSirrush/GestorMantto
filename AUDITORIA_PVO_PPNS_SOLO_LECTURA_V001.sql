-- BLT NOW / Logistica > PVO-Produccion
-- Diagnostico SOLO LECTURA. No altera ninguna fila ni estructura.
-- Ejecutar en Aiven MySQL para obtener evidencia actual; contrastar cada resultado
-- con fuentes y archivos antes de aprobar una eventual correccion de datos.
-- El numero de filas puede diferir del respaldo del 07/10/2026.

SELECT
    p.id_produccion,
    p.id_log_ops,
    p.modo_registro,
    p.origen_registro,
    p.ppns AS ppns_pvo,
    p.proyecto AS proyecto_pvo_historico,
    l.id_ppns AS ppns_logistica,
    l.proyecto AS proyecto_logistica,
    p.created_at,
    p.updated_at,
    (
      SELECT COUNT(*)
      FROM logistica_produccion_archivos a
      WHERE a.id_produccion = p.id_produccion
        AND a.activo = 1
    ) AS archivos_activos,
    (
      SELECT COUNT(*)
      FROM ins_fl i
      WHERE i.activo = 1
        AND TRIM(i.id_proyecto) = TRIM(p.ppns)
    ) AS equipos_instalaciones_mismo_ppns,
    CASE
      WHEN l.id_log_ops IS NULL THEN 'LOG_OPS_INEXISTENTE'
      WHEN p.ppns IS NULL OR TRIM(p.ppns) = '' THEN 'PPNS_PVO_VACIO'
      WHEN TRIM(l.id_ppns) <> TRIM(p.ppns) THEN 'PPNS_DIFERENTE'
      ELSE 'COINCIDE'
    END AS estado_integridad
FROM logistica_produccion p
LEFT JOIN log_ops l
  ON l.id_log_ops = p.id_log_ops
WHERE p.activo = 1
  AND p.id_log_ops IS NOT NULL
  AND (
      l.id_log_ops IS NULL
      OR p.ppns IS NULL
      OR TRIM(p.ppns) = ''
      OR TRIM(l.id_ppns) <> TRIM(p.ppns)
  )
ORDER BY p.id_produccion;

-- Consulta focalizada de proyectos reportados (solo lectura).
-- No usa nombres como llaves: se filtra por PPNS conocido.
SELECT
    l.id_log_ops, l.id_ppns, l.proyecto,
    p.id_produccion, p.ppns AS ppns_pvo,
    p.proyecto AS proyecto_pvo_historico,
    p.created_at, p.updated_at
FROM log_ops l
LEFT JOIN logistica_produccion p ON p.id_log_ops = l.id_log_ops
WHERE TRIM(l.id_ppns) IN ('P15439','P15341','P15523','P15288')
   OR TRIM(p.ppns) IN ('P15439','P15341','P15523','P15288')
ORDER BY l.id_ppns,l.id_log_ops,p.id_produccion;
