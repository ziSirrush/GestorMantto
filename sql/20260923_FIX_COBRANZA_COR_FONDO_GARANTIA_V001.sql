-- [Aster | 2026-09-23 | ASTER-MG | COBRANZA COR FONDO GARANTIA V001]
-- Ejecutar en Aiven ANTES de desplegar el backend/frontend de este FIX.
-- Cambio aditivo: no elimina ni transforma columnas existentes.
-- Convencion del porcentaje: se almacena como fraccion decimal.
-- Ejemplo: 10% = 0.100000.

ALTER TABLE cobranza_fuente_cor
    ADD COLUMN fondo_garantia TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '0=desactivado, 1=activo'
        AFTER porcentaje,
    ADD COLUMN porcentaje_fondo_garantia DECIMAL(10,6) NOT NULL DEFAULT 0.000000
        COMMENT 'Fraccion decimal; 0.100000 equivale a 10%'
        AFTER fondo_garantia;
