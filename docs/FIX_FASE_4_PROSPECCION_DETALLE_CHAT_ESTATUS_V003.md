# FIX Fase 4 Prospección — Detalle, chat y estatus V003

## Base

- Última versión respaldada antes de Prospección.
- Fase 4A Detalle de Prospección.
- FIX visual limpio V002.
- Comportamiento del módulo Detalle de Cotización como patrón funcional y visual.

## Cambios

1. El estatus se edita desde el resumen superior, como en Detalle de Cotización.
2. Los valores se obtienen exclusivamente de `catalogo_general`, área `Ventas`, elemento `Estatus Pros`.
3. El cambio actualiza la prospección y registra historial.
4. Interacciones funciona como chat: comentario, archivos o ambos.
5. Los archivos se cargan a Google Drive y se relacionan con `ventas_prospeccion_comentarios` y `ventas_prospeccion_archivos`.
6. Máximo 4 archivos de 12 MB por comentario.
7. Se conserva el diseño clean del detalle de Cotización con clases aisladas de Prospección.

## Base de datos

No requiere migración adicional. Utiliza tablas existentes.

## Orden de instalación

1. Reemplazar los cuatro archivos backend incluidos.
2. Reemplazar los tres archivos del frontend incluidos.
3. Reiniciar backend.
4. Recargar frontend sin caché.

## Nota Google Drive

La cuenta del usuario autenticado debe conservar conexión OAuth y permisos de escritura en la carpeta configurada para Prospección.
