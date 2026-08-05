# FIX Asignación a Redes V007

## Alcance

1. Corrige el responsive integral de la vista principal de Asignación a Redes.
2. Convierte la tabla en tarjetas legibles en pantallas móviles.
3. Corrige la barra contextual móvil para evitar texto y botón encimados.
4. Corrige los IDs oficiales de roles con acceso total de Ventas según DATA.sql.
5. El indicador técnico del módulo queda marcado como visible solo para Programador.

## Corrección de acceso total

Antes se usaban IDs incorrectos: `1, 4, 34, 39`.

Según DATA.sql, los roles oficiales configurados por nombre para acceso total son:

- 1 Director General
- 5 Director Ventas
- 7 Auxiliar Direccion
- 47 Jefa Administracion Ventas

Los gerentes 48, 50 y 54 conservan alcance jerárquico limitado. El rol 39 Asesor Comercial deja de recibir acceso total por error.

## Archivos modificados

- `index.html`
- `styles/base.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.html`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`
- `backend/src/modules/ventas/ventas-visibility.service.js`
