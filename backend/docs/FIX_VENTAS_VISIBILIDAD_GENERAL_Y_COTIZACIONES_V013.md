# FIX V013 - Visibilidad general de Ventas y recuperación de Cotizaciones

## Alcance

Este FIX centraliza la regla de visibilidad para toda la agrupación Ventas y la aplica al módulo Cotizaciones, único módulo de Ventas integrado actualmente.

## Regla de visibilidad

- Acceso total: Director General, Director Ventas, Jefa Administracion Ventas y Auxiliar Direccion.
- Gerentes comerciales: registros propios y de usuarios activos cuyo `usuarios.reporta_a` sea el `id_SB` del gerente.
- Demás usuarios: únicamente registros cuyo `id_asesor` coincida con su usuario.

La regla común vive en:

`backend/src/modules/ventas/ventas-visibility.service.js`

## Reglas recuperadas en Cotizaciones

1. El año se obtiene mediante `COALESCE(fecha_cotizacion, fecha_solicitud)`.
2. El año actual es el valor predeterminado; `anio=todos` elimina el filtro anual.
3. Los años disponibles se obtienen desde la misma expresión de fecha.
4. Los asesores se obtienen desde `usuarios_rel_admin.id_asesor`.
5. Los administrativos se obtienen desde `usuarios_rel_admin.id_admin`.
6. Las zonas provienen de los valores reales de `ventas_cotizaciones_cor.zona`.
7. Los usuarios con acceso total conservan los filtros Asesor y Administrativo; los demás no.

## Instalación

Reemplazar únicamente los archivos incluidos y reiniciar el backend.

No requiere SQL.
