# FIX Backend Ventas - Visibilidad por reporta_a V012

## Regla
- Acceso total: roles 1, 5, 7 y 47.
- Gerentes: roles 48, 50 y 54. Ven sus cotizaciones y las de usuarios activos cuyo `usuarios.reporta_a` sea el `id_SB` del gerente.
- Asesor Comercial e Ingeniería de Ventas: solo sus cotizaciones.
- Otros roles sin regla específica: solo sus cotizaciones.

## Alcance
La misma regla se aplica a listado, KPIs, detalle, comentarios, archivos y operaciones de escritura.

## Endpoint de catálogos
`GET /api/ventas/cotizaciones/catalogos` devuelve `visibilidad.acceso_total` para que el frontend oculte filtros globales a usuarios restringidos.

## Pendientes
- Poblar y validar `usuarios.reporta_a` para todos los asesores.
- La jerarquía actual considera reportes directos, no niveles recursivos.
- Definir posteriormente reglas específicas para auxiliares administrativos de Ventas.
