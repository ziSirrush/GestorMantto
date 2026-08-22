# FIX V012 - Venta Adicional sin tablas relacionadas + Proyecto a Gestión de Crédito

## Base acumulativa
Este FIX parte de la implementación V011 de Cobranza United / Venta Adicional y conserva la lógica existente de Gestión de Crédito, Mantenimiento Preventivo y Venta Adicional.

## Cambios
1. Detalle Venta Adicional:
   - Se eliminan visualmente las dos tablas relacionadas: Mantenimiento Preventivo y Gestión de Crédito.
   - Se conservan los botones superiores de navegación a Proyecto, Gestión de Crédito y MP cuando existe relación.
   - No se elimina la carga de relaciones porque esos datos siguen resolviendo los botones de navegación.

2. Detalle Proyecto United / Portafolio:
   - Se agrega el botón `🛡️ Ir a Gestión de Crédito` en el encabezado del bloque United del Detalle Proyecto.
   - No se modifica `core/details.js`; el puente se integra desde el módulo Cobranza United mediante MutationObserver, sin polling ni timers.
   - El botón usa el proyecto técnico de la ruta actual para navegar a Gestión de Crédito.
   - Gestión de Crédito intenta resolver el registro por proyecto y abre su detalle. Si no existe coincidencia exacta, abre la MAIN con el proyecto aplicado en la búsqueda.

## Archivos modificados
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`

## Backend / Aiven
Sin cambios de backend, SQL, tablas ni configuración de Aiven.

## Validación
- `node --check modules/cobranza-uni/cobranza-uni.js`: OK.
- No se modifican `index.html`, sidebar, permisos ni `core/router.js`.
- No se agregan timers ni consultas periódicas.
