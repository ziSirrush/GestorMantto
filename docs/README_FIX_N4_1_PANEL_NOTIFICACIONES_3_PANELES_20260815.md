# FIX N4.1 - Panel de Control > Notificaciones - 3 paneles

Fecha: 2026-08-15

## Causa encontrada

La Fase N4 original agrupaba `Rol + Politica + Estado` dentro de una sola fila del panel derecho. Eso no respetaba el flujo aprobado.

El comportamiento correcto es:

`Interacciones (maestro) -> Roles -> Politica`

- **Interacciones** es el unico maestro.
- Al cambiar la interaccion seleccionada se actualizan los paneles **Rol** y **Politica** para esa interaccion.
- No se selecciona un rol para abrir otro formulario.
- Cada fila del panel **Rol** corresponde exactamente a la misma fila del panel **Politica**.
- Si un rol esta inactivo para la interaccion, su fila de Politica queda deshabilitada y ese rol no recibe la notificacion.
- Si un rol esta activo, su politica puede ser `OBLIGATORIA` u `OPCIONAL`.

## Cambio aplicado

La pantalla de Notificaciones queda dividida en tres paneles independientes:

1. **Interacciones - Maestro**
   - Mantiene buscador y lista de interacciones.
   - La interaccion activa controla los otros dos paneles.

2. **Rol**
   - Muestra todos los roles filtrados para la interaccion seleccionada.
   - Cada rol conserva su switch independiente.
   - Encendido = el rol recibe la interaccion, sujeto al motor N3.
   - Apagado = no recibe.

3. **Politica**
   - Conserva una fila por cada rol visible, en el mismo orden.
   - `Obligatoria` y `Opcional` se habilitan solo cuando el rol correspondiente esta activo.
   - Si el rol esta apagado, la politica queda bloqueada y muestra `No recibe`.

Los paneles **Rol** y **Politica** usan filas de la misma altura y scroll vertical sincronizado para que la correspondencia fila a fila no se pierda.

## Archivos modificados

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## No modificado

- No se modifica N1 ni la tabla `notificacion_evento_roles`.
- No se modifica N2 ni sus endpoints GET/PUT de la matriz.
- No se modifica el motor N3.
- No se modifica N5 Mi Perfil.
- No se modifica N6 ni los disparadores de interacciones reales.
- No se modifica `index.html`.
- No hay SQL ni cambios de esquema.

## Validaciones realizadas

- `node --check modules/panel-control/panel-control.js`: OK.
- Balance de llaves CSS: OK.
- Confirmada presencia de los tres paneles: Interacciones, Rol y Politica.
- Confirmado que ambos paneles dependientes se construyen con la misma lista ordenada de roles.
- Confirmado que las filas Rol/Politica tienen la misma altura y scroll sincronizado.
- Confirmado que los botones de Politica quedan `disabled` cuando el rol esta inactivo.
- Confirmado que el guardado sigue usando el mismo payload `codigo_evento + id_rol + habilitado + politica` de N2.
- No se realizaron conexiones ni escrituras a Aiven.

## Aplicacion

Reemplazar unicamente los dos archivos incluidos conservando su ruta. Este FIX sustituye la presentacion N4; N5 y N6 pueden permanecer aplicados porque no modifican estos dos archivos.
