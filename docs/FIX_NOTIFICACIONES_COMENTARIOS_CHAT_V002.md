# FIX notificaciones de comentarios y actualización de chat V002

## Base utilizada
- Último FIX aprobado: `FIX_CRITICO_NOTIFICACIONES_DESTINO_REAL_V001`.
- Última versión publicada disponible: `Ultima Ver 1325hrs - 2707`, para recuperar el archivo real `core/details.js` sin inventar nombres ni contratos.

## Problemas encontrados
1. La ruta de una notificación abría el detalle real del ticket, pero no distinguía si su origen era un comentario; por ello no posicionaba al usuario directamente en el chat.
2. El chat del Detalle Ticket solo se actualizaba al abrir el detalle o después de enviar una interacción propia.

## Cambios aplicados
- Las notificaciones identificadas como comentario agregan `focus: "chat"` al destino del ticket.
- Al abrir ese destino, Detalle Ticket desplaza la vista al chat y enfoca el campo de comentario.
- El chat consulta `/api/tickets/:ticket/interacciones` cada 10 segundos solamente cuando la carga inicial contiene al menos un comentario.
- La actualización reemplaza únicamente la lista de comentarios; no recarga todo el detalle ni borra lo escrito en el textarea.
- El polling se detiene al salir del detalle, al abrir otro tipo de detalle, al cerrar la vista o si el servidor devuelve una lista sin comentarios.
- Mientras la pestaña está oculta no se realizan consultas; al volver, se ejecuta una actualización inmediata si el polling seguía activo.
- Se conserva la posición del scroll cuando el usuario está leyendo mensajes anteriores; solo sigue el final cuando ya estaba cerca del último comentario.

## Archivos modificados
- `core/router.js`
- `core/details.js`
- `modules/home/home.js`

## Validaciones realizadas
- Sintaxis JavaScript con `node --check` en los tres archivos.
- Conservación de la ruta `detalle:ticket:<ticket>` y de `notificationId`.
- Sin cambios en backend, SQL, endpoints o módulos en Nevera.
- El intervalo de 10 segundos no se crea cuando el ticket no tiene comentarios.
