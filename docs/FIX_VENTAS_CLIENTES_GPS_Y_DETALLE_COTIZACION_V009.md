# FIX Ventas Clientes GPS y Detalle Cotización V009

## Base acumulativa
- Local Ver 1400 hrs.
- Fase 1, Fase 2 y Fase 3 de Ventas Clientes.
- Ajustes de asignación comercial V005/V006.
- Editar cliente alineado V007.
- Actividad comercial V008.

## Cambios
1. Crear y editar cliente incorporan captura opcional de ubicación GPS.
2. La coordenada se guarda en `ventas_clientes.ubicacion` como `latitud, longitud`.
3. Se muestra vínculo “Abrir en mapa” cuando el contenido es una coordenada válida.
4. Rechazar o fallar el permiso GPS no bloquea el formulario.
5. Las filas de Actividad comercial son clicables y navegan por router usando `id_cotizacion`.
6. Se agrega una vista completa `ventas-cotizaciones-detalle`, sin modal, drawer ni overlay.
7. La barra contextual global conserva el regreso al detalle del cliente.
8. La vista muestra información, comentarios y archivos existentes desde Aiven.

## Requisitos
- GPS del navegador requiere HTTPS o localhost y autorización del usuario.
- No requiere SQL ni cambios backend.
