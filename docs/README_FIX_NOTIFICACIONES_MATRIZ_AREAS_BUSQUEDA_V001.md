# FIX NOTIFICACIONES - MATRIZ, BUSQUEDA Y ROLES POR AREA V001

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Commit base: `bb70654b290dc16b41ecf614edf17578edc27721`
- Archivos originales verificados contra los blobs publicados:
  - `modules/panel-control/panel-control.js` -> `f770cca802c954bd354e45d3558ec227631065ac`
  - `modules/panel-control/panel-control.css` -> `2ea7a2268244763aafa69850c299f2fb96548e20`

## Causa del error al guardar Notificaciones
La llave interna de la matriz se construia con el separador real `\u0000`, pero al guardar se intentaba dividir usando el texto literal `\\u0000`.

Esto provocaba payloads como:
- `codigo_evento = "COMENTARIO\u000037"`
- `id_rol = null`

El FIX usa una sola constante `NOTIFICATION_KEY_SEPARATOR` tanto para construir como para separar la llave y valida que `codigo_evento` e `id_rol` sean validos antes del PUT.

## Cambios solicitados de interfaz
1. Las busquedas de Interacciones y Roles ya no filtran con cada caracter escrito.
   - El texto se captura sin reconstruir resultados.
   - La busqueda se aplica al presionar `Enter` o el boton `Buscar`.
2. Los roles de la matriz se agrupan por area.
   - El area se obtiene de usuarios activos cuyo Rol Principal coincide con el rol de la matriz, usando `usuarios.area` ya cargado por Panel de Control.
   - Si un rol no tiene un usuario activo con ese Rol Principal: `Sin area asignada`.
   - Si el mismo Rol Principal aparece en mas de un area: `Varias areas`.
   - Ningun rol se elimina por no tener area.
3. Cada area tiene un control `Seleccionar area`.
   - Activa o desactiva todos los roles visibles dentro de esa area.
   - Respeta los filtros de busqueda/empresa aplicados.
   - Se conserva tambien el control global `Seleccionar todo`.
4. La seleccion de politica `Obligatoria/Opcional` conserva el comportamiento existente; no se cambiaron reglas de negocio de notificaciones.

## Archivos modificados
- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## No modificado
- Backend
- Rutas
- SQL / Aiven
- Catalogo de roles
- Motor de notificaciones
- Reglas de Zona Operativa
- Permisos / Alcance de Informacion

## Validaciones realizadas
- `node --check modules/panel-control/panel-control.js`: OK.
- Prueba del separador: `COMENTARIO + rol 37` genera `{ codigo_evento: "COMENTARIO", id_rol: 37 }`: OK.
- Ya no existe `key.split('\\\\u0000')` en el archivo entregado: OK.
- Las busquedas de Notificaciones no ejecutan el filtrado/render por cada evento `input`: OK.
- Roles no se descartan si no se puede resolver un area: se muestran en `Sin area asignada`: OK.
- Sin commit ni push.

## Validacion runtime pendiente
Despues del deploy, probar al menos:
1. Cambiar un solo rol y guardar.
2. Activar varios roles de una misma area y guardar.
3. Activar `Seleccionar todo` y guardar.
4. Escribir varios caracteres en Buscar y confirmar que la lista no cambia hasta `Enter/Buscar`.
5. Revisar Network y confirmar que cada cambio envia `codigo_evento` limpio e `id_rol` numerico.
