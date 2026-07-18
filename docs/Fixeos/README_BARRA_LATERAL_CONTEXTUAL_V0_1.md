# Barra lateral contextual V0.1

## Alcance

Se reorganizó la navegación lateral de Mantto Gestor en grupos desplegables por proceso, conservando accesos independientes para Inicio, Usuarios y Panel de Control.

## Grupos

- Operación
- Portafolio
- Cobranza
- Logística
- Instalaciones
- Ventas

## Comportamiento

- Solo un grupo permanece abierto a la vez.
- Los módulos ya integrados conservan sus rutas y funcionalidad.
- Los accesos nuevos abren la vista global "En construcción / En desarrollo".
- La barra conserva el comportamiento responsive y el colapsado existente.
- Al volver a expandirla se abre el grupo correspondiente a la ruta activa.

## Permisos temporales

Cada acceso cuenta con un identificador `data-permission` independiente.
En esta versión todos los permisos se encuentran habilitados mediante `TEMP_SIDEBAR_PERMISSIONS` en `core/app.js`.

Esta estructura es temporal hasta implementar el catálogo definitivo y las validaciones frontend/backend del Panel de Control.

## Archivos modificados

- `index.html`
- `styles/base.css`
- `core/app.js`
- `core/router.js`
