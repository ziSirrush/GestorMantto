# Ventas - Fase 1 / Subfase 3

## Cambios
- Se agregó `GET /api/ventas/cotizaciones/catalogos`.
- Se protegieron listado, detalle y CRUD con permisos granulares: VER, CREAR, EDITAR y ELIMINAR.
- Se agregó middleware que respeta permisos heredados por rol y excepciones por usuario vigentes.
- Se agregó SQL idempotente para registrar Ventas > Cotizaciones y asignar inicialmente los cuatro permisos a todos los roles activos.

## Catálogos
El endpoint devuelve asesores, administrativos y valores distintos operativos de estatus, zonas, estados, ciudades, tipos de proyecto, tipos de equipos, monedas y años.

## Orden de despliegue
1. Ejecutar `sql/20260728_VENTAS_COTIZACIONES_PERMISOS.sql` en Aiven.
2. Publicar los archivos JavaScript.
3. Probar con JWT válido los endpoints protegidos.

## Validaciones realizadas
- `node --check` en todos los archivos JavaScript modificados.
- `npm run check` sobre el backend acumulativo.
- Revisión de rutas para evitar conflicto entre `/catalogos` y `/:id`.
- Consultas parametrizadas en resolución de permisos.

No se ejecutaron pruebas reales contra Aiven por no disponer de credenciales productivas en el entorno local.
