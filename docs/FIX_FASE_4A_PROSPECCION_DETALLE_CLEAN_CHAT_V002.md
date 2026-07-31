# FIX Fase 4A - Detalle de Prospección limpio y seguimiento tipo chat

## Objetivo
Alinear el detalle de Prospección con el diseño vigente de Detalle de Cotización y conservar el seguimiento como una conversación.

## Alcance
- Solo frontend del módulo `ventas-prospeccion-detalle`.
- No modifica base de datos, backend, rutas ni otros módulos.
- Mantiene la Fase 4A en modo solo lectura.

## Cambios
- Encabezado, estado de conexión, botones, KPIs y tarjeta principal basados en Detalle de Cotización.
- Secciones interiores: Cliente y contacto, Proyecto, Visita y ubicación, Comentario inicial, Evidencias e Interacciones.
- Interacciones renderizadas como chat con avatar, usuario, fecha, comentario y adjuntos dentro del mensaje correspondiente.
- Evidencias iniciales separadas de los archivos de seguimiento.
- Botones para regresar, actualizar y abrir la visita en Mapa Prospección.
- Responsive alineado al patrón visual de Cotizaciones.

## Regla de archivos
- `id_com_pors IS NULL`: evidencia de la visita.
- `id_com_pors` con valor: adjunto del seguimiento correspondiente.
