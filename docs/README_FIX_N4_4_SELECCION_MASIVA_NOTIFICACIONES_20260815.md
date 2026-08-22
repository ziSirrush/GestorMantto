# FIX N4.4 - Seleccion masiva de Roles y Politicas

Fecha: 2026-08-15

## Alcance

Correctivo exclusivamente de frontend para `Panel de Control > Notificaciones`.

Se conserva el modelo aprobado de tres paneles:

1. `Interacciones` = maestro.
2. `Rol` = una fila independiente por rol.
3. `Politica` = una fila independiente alineada 1:1 con el rol correspondiente.

No se modifica N1, N2, N3, N5 ni N6. No incluye SQL ni cambios de backend.

## Cambios

### Panel Rol

Se agrega el switch `Seleccionar todo`.

- Si no todos los roles visibles estan activos, al activarlo habilita todos los roles visibles para la interaccion seleccionada.
- Si todos los roles visibles ya estan activos, al apagarlo deshabilita todos los roles visibles.
- Cuando existe una seleccion parcial, el switch muestra estado intermedio (`indeterminate`).
- El contador indica `X de N roles visibles activos`.

`Roles visibles` significa los roles que permanecen despues de aplicar la busqueda y el filtro de empresa. Con filtros vacios aplica a todos los roles del panel.

### Panel Politica

Se agregan dos acciones masivas:

- `Obligatorio todo`
- `Opcional todo`

Estas acciones:

- afectan exclusivamente a los roles visibles que ya estan activos para la interaccion;
- nunca activan un rol deshabilitado;
- mantienen deshabilitada la politica de los roles que no reciben la interaccion.

### Persistencia

Las acciones masivas utilizan el mismo `notificationDirty` y el mismo guardado PUT existente de N2.
No se realizan llamadas HTTP por cada rol. Los cambios quedan acumulados y se envian juntos al presionar Guardar cambios.

## Archivos modificados

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Validaciones realizadas

- `node --check modules/panel-control/panel-control.js`: OK.
- Orden alfabetico de roles conservado: OK.
- Politica masiva solo sobre roles activos: OK.
- Seleccion masiva utiliza los roles visibles: OK.
- Estado parcial del switch Seleccionar todo: OK.
- Balance de llaves CSS: OK.
- Proyecto completo: `npm run check` -> `Estructura base validada correctamente.`

## Aplicacion

Aplicar sobre la version que ya contiene N4.3 reemplazando unicamente los dos archivos incluidos.
