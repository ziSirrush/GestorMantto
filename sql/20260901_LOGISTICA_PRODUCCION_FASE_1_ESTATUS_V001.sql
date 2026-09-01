/*
  [Aster | 2026-09-01 | ASTER-MG | FASE 1 LOGISTICA PRODUCCION SEMIAUTOMATICO V001]

  Objetivo:
  - Completar el catalogo que el backend de Logistica -> Produccion YA consulta.
  - Reutilizar en Produccion los 12 estatus funcionales definidos por Reporte de Logistica.
  - No crea tablas.
  - No agrega columnas.
  - No elimina ni desactiva registros ajenos.

  Contrato existente del backend:
    area     = 'Logistica'
    elemento = 'Estatus Produccion'
*/

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

START TRANSACTION;

INSERT INTO catalogo_general
  (area, elemento, articulo, descripcion, orden, activo)
VALUES
  ('Logistica','Estatus Produccion','SIN PRODUCCIÓN / Documentación Pendiente','Estatus funcional reutilizado del pipeline de Reporte de Logística.',1,1),
  ('Logistica','Estatus Produccion','SIN PRODUCCIÓN / Primera Visita a Obra','Estatus funcional reutilizado del pipeline de Reporte de Logística.',2,1),
  ('Logistica','Estatus Produccion','SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente','Estatus funcional reutilizado del pipeline de Reporte de Logística.',3,1),
  ('Logistica','Estatus Produccion','SIN PRODUCCIÓN / Programados a Producción','Estatus funcional reutilizado del pipeline de Reporte de Logística.',4,1),
  ('Logistica','Estatus Produccion','EN PRODUCCIÓN','Estatus funcional reutilizado del pipeline de Reporte de Logística.',5,1),
  ('Logistica','Estatus Produccion','PARADOS POR CLIENTE','Estatus funcional reutilizado del pipeline de Reporte de Logística.',6,1),
  ('Logistica','Estatus Produccion','PENDIENTE PAGO LIBERACIÓN','Estatus funcional reutilizado del pipeline de Reporte de Logística.',7,1),
  ('Logistica','Estatus Produccion','PROGRAMADO','Estatus funcional reutilizado del pipeline de Reporte de Logística.',8,1),
  ('Logistica','Estatus Produccion','EN TRÁNSITO','Estatus funcional reutilizado del pipeline de Reporte de Logística.',9,1),
  ('Logistica','Estatus Produccion','PROGRAMA ENTREGA','Estatus funcional reutilizado del pipeline de Reporte de Logística.',10,1),
  ('Logistica','Estatus Produccion','ALMACENADOS','Estatus funcional reutilizado del pipeline de Reporte de Logística.',11,1),
  ('Logistica','Estatus Produccion','ENTREGADO','Estatus funcional reutilizado del pipeline de Reporte de Logística.',12,1)
ON DUPLICATE KEY UPDATE
  articulo=VALUES(articulo),
  descripcion=VALUES(descripcion),
  orden=VALUES(orden),
  activo=1;

COMMIT;

/* Verificacion: el bloque canonico esperado contiene 12 estatus activos. */
SELECT id_catalogo, area, elemento, articulo, orden, activo
FROM catalogo_general
WHERE area='Logistica'
  AND elemento='Estatus Produccion'
ORDER BY orden, articulo;
