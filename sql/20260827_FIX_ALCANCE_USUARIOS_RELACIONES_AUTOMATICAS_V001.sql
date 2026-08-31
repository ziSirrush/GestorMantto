-- Mantto Gestor - Correccion de alcance automatico por jerarquia de usuarios
-- Fecha: 2026-08-27
-- Objetivo:
--   1. Activar REL_ADMIN para auxiliares que ya tienen usuarios relacionados.
--   2. Conservar una sola fila activa por bandera automatica.
--   3. Reparar REPORTA_A unicamente para los roles gerenciales oficiales.
--
-- El script es idempotente y no crea relaciones usuario-administrador nuevas.
-- Tampoco elimina relaciones historicas ni asigna auxiliares por inferencia.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP TEMPORARY TABLE IF EXISTS tmp_fix_alcance_automatico;
CREATE TEMPORARY TABLE tmp_fix_alcance_automatico (
  id_usuario BIGINT NOT NULL,
  tipo_alcance VARCHAR(20) NOT NULL,
  motivo VARCHAR(120) NOT NULL,
  PRIMARY KEY (id_usuario, tipo_alcance)
) ENGINE=MEMORY;

-- Una relacion administrativa solo se considera vigente cuando ambos usuarios
-- siguen activos. En el respaldo SABANA270826 esta regla detecta a YG.
INSERT IGNORE INTO tmp_fix_alcance_automatico (
  id_usuario,
  tipo_alcance,
  motivo
)
SELECT DISTINCT
  administrador.id_SB,
  'REL_ADMIN',
  'Tiene relaciones activas en usuarios_rel_admin'
FROM usuarios_rel_admin relacion
INNER JOIN usuarios administrador
  ON administrador.id_SB = relacion.id_admin
 AND administrador.estado = 1
INNER JOIN usuarios usuario_visible
  ON usuario_visible.id_SB = relacion.id_asesor
 AND usuario_visible.estado = 1;

-- Salvaguarda para los tres roles que el backend reconoce como gerencias
-- comerciales. No concede REPORTA_A a directores ni a otros superiores.
INSERT IGNORE INTO tmp_fix_alcance_automatico (
  id_usuario,
  tipo_alcance,
  motivo
)
SELECT DISTINCT
  gerente.id_SB,
  'REPORTA_A',
  'Gerencia comercial con reportes directos activos'
FROM usuarios gerente
INNER JOIN usuario_roles usuario_rol
  ON usuario_rol.id_usuario = gerente.id_SB
 AND usuario_rol.activo = 1
INNER JOIN roles rol
  ON rol.id_rol = usuario_rol.id_rol
 AND rol.estado = 1
 AND rol.codigo IN (
   'GERENTE_CUENTAS_CORPORATIVAS',
   'GERENTE_COMERCIAL_BC_SURESTE',
   'GERENTE_COMERCIAL_NORTE'
 )
INNER JOIN usuarios reporte
  ON reporte.reporta_a = gerente.id_SB
 AND reporte.estado = 1
WHERE gerente.estado = 1;

-- Preflight: estas son las banderas que deben existir y su estado actual.
SELECT
  candidato.id_usuario,
  usuario.iniciales,
  candidato.tipo_alcance,
  candidato.motivo,
  COUNT(alcance.id_alcance) AS filas_existentes,
  SUM(CASE WHEN alcance.activo = 1 THEN 1 ELSE 0 END) AS filas_activas
FROM tmp_fix_alcance_automatico candidato
INNER JOIN usuarios usuario
  ON usuario.id_SB = candidato.id_usuario
LEFT JOIN usuarios_alcance_informacion alcance
  ON alcance.id_usuario = candidato.id_usuario
 AND alcance.tipo_alcance = candidato.tipo_alcance
GROUP BY
  candidato.id_usuario,
  usuario.iniciales,
  candidato.tipo_alcance,
  candidato.motivo
ORDER BY candidato.id_usuario, candidato.tipo_alcance;

DROP TEMPORARY TABLE IF EXISTS tmp_fix_alcance_keeper;
CREATE TEMPORARY TABLE tmp_fix_alcance_keeper (
  id_usuario BIGINT NOT NULL,
  tipo_alcance VARCHAR(20) NOT NULL,
  id_alcance_keeper BIGINT NOT NULL,
  PRIMARY KEY (id_usuario, tipo_alcance)
) ENGINE=MEMORY;

INSERT INTO tmp_fix_alcance_keeper (
  id_usuario,
  tipo_alcance,
  id_alcance_keeper
)
SELECT
  alcance.id_usuario,
  alcance.tipo_alcance,
  MIN(alcance.id_alcance)
FROM usuarios_alcance_informacion alcance
INNER JOIN tmp_fix_alcance_automatico candidato
  ON candidato.id_usuario = alcance.id_usuario
 AND candidato.tipo_alcance = alcance.tipo_alcance
GROUP BY alcance.id_usuario, alcance.tipo_alcance;

START TRANSACTION;

-- Si ya habia filas, reactiva solamente la mas antigua y desactiva duplicados.
UPDATE usuarios_alcance_informacion alcance
INNER JOIN tmp_fix_alcance_keeper keeper
  ON keeper.id_usuario = alcance.id_usuario
 AND keeper.tipo_alcance = alcance.tipo_alcance
SET alcance.activo = CASE
      WHEN alcance.id_alcance = keeper.id_alcance_keeper THEN 1
      ELSE 0
    END,
    alcance.updated_at = CURRENT_TIMESTAMP;

-- Si la bandera nunca existio, crea una sola fila valida para el CHECK actual.
INSERT INTO usuarios_alcance_informacion (
  id_usuario,
  tipo_alcance,
  dominio,
  id_agrupacion,
  id_usuario_visible,
  activo
)
SELECT
  candidato.id_usuario,
  candidato.tipo_alcance,
  NULL,
  NULL,
  NULL,
  1
FROM tmp_fix_alcance_automatico candidato
LEFT JOIN tmp_fix_alcance_keeper keeper
  ON keeper.id_usuario = candidato.id_usuario
 AND keeper.tipo_alcance = candidato.tipo_alcance
WHERE keeper.id_alcance_keeper IS NULL;

COMMIT;

-- Postflight obligatorio: debe regresar cero filas.
SELECT
  candidato.id_usuario,
  usuario.iniciales,
  candidato.tipo_alcance,
  'FALTA_BANDERA_ACTIVA' AS hallazgo
FROM tmp_fix_alcance_automatico candidato
INNER JOIN usuarios usuario
  ON usuario.id_SB = candidato.id_usuario
WHERE NOT EXISTS (
  SELECT 1
  FROM usuarios_alcance_informacion alcance
  WHERE alcance.id_usuario = candidato.id_usuario
    AND alcance.tipo_alcance = candidato.tipo_alcance
    AND alcance.activo = 1
);

-- Postflight obligatorio: debe regresar cero filas.
SELECT
  alcance.id_usuario,
  usuario.iniciales,
  alcance.tipo_alcance,
  COUNT(*) AS filas_activas
FROM usuarios_alcance_informacion alcance
INNER JOIN tmp_fix_alcance_automatico candidato
  ON candidato.id_usuario = alcance.id_usuario
 AND candidato.tipo_alcance = alcance.tipo_alcance
INNER JOIN usuarios usuario
  ON usuario.id_SB = alcance.id_usuario
WHERE alcance.activo = 1
GROUP BY alcance.id_usuario, usuario.iniciales, alcance.tipo_alcance
HAVING COUNT(*) > 1;

-- Diagnostico manual: asesores comerciales activos sin auxiliar relacionado.
-- No se asignan automaticamente porque el auxiliar correcto es una decision
-- operativa. En SABANA270826 esta consulta detecta un asesor.
SELECT
  asesor.id_SB AS id_asesor,
  asesor.iniciales,
  asesor.reporta_a,
  superior.iniciales AS superior_iniciales,
  'SIN_RELACION_ADMINISTRATIVA' AS hallazgo
FROM usuarios asesor
INNER JOIN usuario_roles usuario_rol
  ON usuario_rol.id_usuario = asesor.id_SB
 AND usuario_rol.activo = 1
INNER JOIN roles rol
  ON rol.id_rol = usuario_rol.id_rol
 AND rol.estado = 1
 AND rol.codigo = 'ASESOR_COMERCIAL'
LEFT JOIN usuarios superior
  ON superior.id_SB = asesor.reporta_a
WHERE asesor.estado = 1
  AND NOT EXISTS (
    SELECT 1
    FROM usuarios_rel_admin relacion
    INNER JOIN usuarios administrador
      ON administrador.id_SB = relacion.id_admin
     AND administrador.estado = 1
    WHERE relacion.id_asesor = asesor.id_SB
  )
ORDER BY asesor.id_SB;

-- Diagnostico manual: relaciones que apuntan a usuarios inactivos.
-- No se eliminan para no perder la asignacion si el usuario se reactiva.
SELECT
  relacion.id_rel_admin,
  relacion.id_asesor,
  asesor.iniciales AS asesor_iniciales,
  relacion.id_admin,
  administrador.iniciales AS administrador_iniciales,
  CASE
    WHEN asesor.estado <> 1 AND administrador.estado <> 1 THEN 'AMBOS_INACTIVOS'
    WHEN asesor.estado <> 1 THEN 'USUARIO_VISIBLE_INACTIVO'
    ELSE 'ADMINISTRADOR_INACTIVO'
  END AS hallazgo
FROM usuarios_rel_admin relacion
INNER JOIN usuarios asesor
  ON asesor.id_SB = relacion.id_asesor
INNER JOIN usuarios administrador
  ON administrador.id_SB = relacion.id_admin
WHERE asesor.estado <> 1
   OR administrador.estado <> 1
ORDER BY relacion.id_rel_admin;

DROP TEMPORARY TABLE IF EXISTS tmp_fix_alcance_keeper;
DROP TEMPORARY TABLE IF EXISTS tmp_fix_alcance_automatico;
