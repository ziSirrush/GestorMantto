# FIX Fase 3 - Resolución de cliente/contacto y aviso neutral V004

## Cambios

- La búsqueda de cotizaciones resuelve `id_cliente` en este orden: relación directa de la cotización, cliente del contacto relacionado y coincidencia normalizada por nombre de empresa.
- La búsqueda resuelve `id_contacto` por relación directa o por coincidencia de nombre, correo o teléfono dentro del cliente resuelto.
- Si la cotización conserva un contacto histórico en sus campos pero todavía no existe en el catálogo, se muestra como opción `Contacto · Cotización`; al guardar se registra como contacto nuevo y se relaciona con el cliente/cotización.
- La ausencia real de cliente ya no se presenta como error rojo. Se muestra como aviso informativo azul y discreto.
- No se modifican tablas ni módulos ajenos.
