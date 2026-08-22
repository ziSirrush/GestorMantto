# FASE N4 - Panel de Control > Notificaciones

Fecha: 2026-08-15

## Base funcional

Esta fase es incremental sobre:

- N1: tabla `notificacion_evento_roles` ya creada en Aiven.
- N2: endpoints de administracion `GET/PUT /api/panel-control/notificaciones/matriz`.
- N3: motor central de destinatarios, Rol Principal y Zona Operativa.

## Alcance de N4

Se agrega la pestana **Notificaciones** dentro del Panel de Control existente para administrar visualmente la matriz:

`Interaccion -> Rol Principal -> Habilitado -> OBLIGATORIA / OPCIONAL`

La vista obtiene tanto las interacciones como los roles desde el backend; no contiene listas de roles hardcodeadas.

### Comportamiento

- Panel izquierdo: buscador y listado de interacciones activas.
- Panel derecho: roles disponibles para la interaccion seleccionada.
- Cada rol puede quedar deshabilitado (`No recibe`) o habilitado.
- Un rol habilitado debe tener politica `Obligatoria` u `Opcional` antes de poder guardar.
- No se asigna `Opcional` automaticamente a una relacion nueva.
- Si una relacion previamente guardada se encuentra inactiva y conserva una politica en Aiven, al reactivarla se reutiliza esa politica existente.
- El guardado utiliza el boton global **Guardar cambios** del Panel de Control.
- Solo se envian las celdas modificadas de la matriz.
- La respuesta del PUT se usa como readback para confirmar que todos los cambios quedaron guardados.
- Se conserva el contexto visual de la matriz despues del guardado (interaccion seleccionada y scrolls).
- La vista informa que la configuracion se evalua por Rol Principal y que el motor N3 valida Zona Operativa y relacion con el registro cuando corresponde.
- Los colores se mantienen dentro de la paleta azul/gris existente de Mantto Gestor; no se replica la codificacion de colores del boceto conceptual.

## Archivos modificados

1. `modules/panel-control/panel-control.js`
2. `modules/panel-control/panel-control.css`

No se modifica `index.html`, porque el Panel de Control ya carga ambos archivos existentes.

## Fuera de alcance

- No hay cambios de tablas, columnas ni migraciones.
- No hay cambios de backend en N4.
- No se modifica FIX 03 ni el motor N3.
- No se modifica Mi Perfil; corresponde a N5.
- No se conectan disparadores reales de Comentario ni de los eventos solicitados por Direccion; corresponde a N6.
- Zona Administrativa continua pendiente hasta contar con la tabla/relacion indicada por el usuario.

## Validaciones realizadas

- `node --check modules/panel-control/panel-control.js`: OK.
- Balance de llaves CSS: OK.
- `npm run check` desde `backend/`: OK, termina en `Estructura base validada correctamente.`
- Verificada presencia de los endpoints N2 en la base de trabajo: GET/PUT `/notificaciones/matriz` dentro del router de Panel de Control.
- Revisado el diff contra la version inmediatamente anterior a N4: solo se modifican los dos archivos frontend indicados.

## Validacion pendiente despues de aplicar

No puedo confirmar el comportamiento contra Aiven/entorno desplegado hasta aplicar N4 junto con N2 y N3 y probar la pestana desde una sesion autorizada.
