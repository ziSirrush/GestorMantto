# Fase 3 — Nueva visita de Prospección

## Alcance
- Captura real de una visita desde el módulo Prospección.
- Clasificación excluyente: Nuevo, En instalación o Cotizado.
- Búsqueda en `ins_fl` agrupada por `id_proyecto` y búsqueda en `ventas_cotizaciones_cor`.
- Precarga editable de empresa, proyecto, ciudad, estado, tipo de proyecto y contacto.
- Selección de contactos desde `ventas_clientes_contactos` cuando existe relación de cliente.
- Captura GPS con autorización del navegador.
- Hasta 4 fotografías desde cámara o galería.
- Auditoría de creación en `ventas_prospeccion_historial`.
- `id_usuario` se toma de la sesión y no del formulario.

## Reglas obligatorias
Empresa, Proyecto, Contacto y Comentario.

## Orden de despliegue
1. Ejecutar `database/FASE_3_PROSPECCION_RELACIONES.sql` una sola vez.
2. Publicar los archivos backend.
3. Configurar `VENTAS_PROSPECCION_DRIVE_FOLDER_ID`.
4. Reautorizar Google para conceder `drive.file` cuando corresponda.
5. Publicar los tres archivos frontend.

## Endpoints nuevos
- `GET /api/ventas/prospeccion/catalogos-captura`
- `GET /api/ventas/prospeccion/fuentes?tipo=INSTALACION|COTIZADO&q=`
- `GET /api/ventas/prospeccion/contactos?id_cliente=`
- `POST /api/ventas/prospeccion` (`multipart/form-data`)

## Nota de relación con Instalaciones
La llave lógica se conserva en `ventas_prospecciones.id_proyecto_instalacion` y se valida contra `ins_fl.id_proyecto`. No existe FK física porque `ins_fl.id_proyecto` no es único de manera individual.
