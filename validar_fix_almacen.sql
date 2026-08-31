USE mydb;

-- SOLO LECTURA. No modifica Aiven.
-- Validacion del catalogo esperado para el FIX V002 de integracion de Almacen.

SELECT
    m.id_modulo,
    m.codigo,
    m.nombre,
    m.ruta_frontend,
    m.orden,
    m.activo
FROM perm_modulos m
JOIN perm_agrupaciones a
  ON a.id_agrupacion = m.id_agrupacion
WHERE a.codigo = 'ALMACEN'
ORDER BY m.orden, m.id_modulo;

SELECT
    m.codigo AS modulo,
    psa.codigo_permiso,
    psa.activo AS permiso_activo
FROM perm_modulos m
JOIN perm_elementos e
  ON e.id_modulo = m.id_modulo
JOIN perm_subelementos s
  ON s.id_elemento = e.id_elemento
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento = s.id_subelemento
WHERE m.codigo IN (
    'ALMACEN_DASHBOARD',
    'ALMACEN_INVENTARIOS',
    'ALMACEN_STOCK',
    'ALMACEN_PRESTAMOS',
    'ALMACEN_RESGUARDOS',
    'ALMACEN_AUDITORIA'
)
ORDER BY m.orden, psa.codigo_permiso;
