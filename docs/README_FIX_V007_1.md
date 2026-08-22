# FIX V007.1 — Cobranza United

## Objetivo
1. Corregir la visibilidad de **Mantenimiento Preventivo** después de Fase 2-A.
2. Renombrar **Aditivas** a **Venta Adicional** sin cambiar su código interno ni su ruta, para no romper integraciones futuras.
3. Dejar la agrupación Cobranza United con sus cuatro módulos visibles/catalogados:
   - Dashboard Cobranza
   - Gestión de Crédito
   - Mantenimiento Preventivo
   - Venta Adicional

## Permisos
El SQL usa Gestión de Crédito como referencia de acceso: copia hacia Mantenimiento Preventivo las asignaciones existentes por rol y por usuario solo cuando no exista una configuración específica para MP.

No se crean tablas. No se tocan datos operativos. No se modifica el frontend MAIN de Mantenimiento Preventivo.

## Archivos modificados
- `index.html`
- `core/router.js`
- `modules/cobranza-uni/cobranza-uni.js`
- `backend/sql/20260814_FIX_V007_1_MP_VISIBILIDAD_VENTA_ADICIONAL.sql`

## Aplicación
1. Ejecutar el SQL en Aiven.
2. Publicar los tres archivos frontend respetando su ruta.
3. Cerrar sesión/entrar de nuevo si el portal conserva permisos de sesión.
4. Verificar Cobranza United y confirmar los cuatro módulos.

No requiere cambios del controlador de Mantenimiento Preventivo ni reinicio de backend por código; el SQL sí debe quedar aplicado en Aiven.
