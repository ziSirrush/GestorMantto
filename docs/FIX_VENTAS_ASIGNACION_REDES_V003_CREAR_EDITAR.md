# FIX Ventas Asignación a Redes V003

## Alcance

- Agrega el botón **Crear nueva** en la vista principal.
- El botón solo se muestra cuando la backend devuelve `visibilidad.acceso_total = true` o `puede_asignar = true`.
- Agrega el botón **Editar** en la vista independiente de detalle, bajo la misma condición de acceso total.
- Agrega una vista independiente reutilizable para crear y editar.
- Refuerza la backend para que crear y editar el formulario general respondan 403 cuando el usuario no tiene acceso total.
- Conserva la actualización directa de estatus para asesores desde el detalle.

## Formulario

Campos:

1. Estatus — catálogo `Ventas / Estatus Pros`.
2. Nombre del contacto — obligatorio.
3. Teléfono.
4. Email.
5. Solicitud — obligatorio; catálogo `Ventas / Soli Red`.
6. Contacto vía — obligatorio; catálogo `Ventas / Tipo Contacto`.
7. Nombre de la empresa.
8. Nombre del proyecto.
9. Ciudad.
10. Estado — catálogo `General / Estado`.
11. Asignado a — obligatorio; usuarios activos asignables.
12. Información que envía.
13. Imagen 1.
14. Imagen 2.

La primera referencia a “Estado” del mapeado se implementa como **Estatus**, porque el registro contiene `id_estatus` para el flujo comercial y posteriormente `id_estado` para el estado geográfico.

## Archivos

### Frontend modificados

- `index.html`
- `core/router.js`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.html`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.html`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.css`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.js`

### Frontend nuevos

- `modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.html`
- `modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.css`
- `modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.js`

### Backend modificados

- `backend/src/modules/ventas-redes/ventas-redes.service.js`
- `backend/src/modules/ventas-redes/ventas-redes.controller.js`

## Endpoints utilizados

- `GET /api/ventas/redes/catalogos`
- `GET /api/ventas/redes/usuarios-asignables`
- `GET /api/ventas/redes/:id`
- `POST /api/ventas/redes`
- `PUT /api/ventas/redes/:id`
- `POST /api/ventas/redes/:id/archivos`

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check`.
- No incluye cambios SQL.
- No modifica Panel de Control, sidebar ni tablas.
