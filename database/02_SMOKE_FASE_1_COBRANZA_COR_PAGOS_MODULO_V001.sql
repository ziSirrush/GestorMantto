USE mydb;

-- FASE 1 - SMOKE SOLO LECTURA.

-- 1) Orden esperado del panel de Cobranza CORELLIAN.
SELECT
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
ORDER BY pm.orden, pm.id_modulo;

-- Esperado relevante:
-- COBRANZA_DASHBOARD       | 10
-- COBRANZA_ESTADOS_CUENTA | 20
-- COBRANZA_PAGOS           | 30
-- COBRANZA_ADITIVAS        | 40

-- 2) Cadena completa del permiso visual nuevo.
SELECT
  pa.codigo AS agrupacion_codigo,
  pa.empresa AS agrupacion_empresa,
  pm.codigo AS modulo_codigo,
  pm.ruta_frontend,
  pe.codigo AS elemento_codigo,
  pe.tipo AS elemento_tipo,
  ps.codigo AS subelemento_codigo,
  pac.codigo AS accion_codigo,
  psa.codigo_permiso,
  psa.activo AS permiso_activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_subelementos ps
  ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_acciones pac
  ON pac.id_accion = psa.id_accion
WHERE psa.codigo_permiso = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

-- Esperado: exactamente una fila activa, enlazada con COBRANZA_PAGOS.

-- 3) Esta fase NO debe asignar permisos automaticamente.
-- La consulta de rol es informativa: 0 es valido inmediatamente despues de Fase 1.
-- No se consulta una tabla de excepciones por usuario porque esta Fase 1 no escribe asignaciones
-- y no se debe inventar un nombre de tabla que no fue verificado en la base actual.
SELECT
  COUNT(*) AS asignaciones_rol_existentes
FROM rol_permisos rp
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND rp.permitido = 1;
