# FIX_DASHBOARD_MODO_JUNTA_CELDA_EDITABLE_V002

## Objetivo
Reemplazar la columna/boton `Editar` por una edicion contextual y responsiva sobre la propia celda a modificar dentro de `Instalaciones > Dashboard > Modo Junta`.

## Alcance de este fix
Este fix es de **acomodo e interaccion visual**. Abre el editor flotante con el control correcto y el valor actual, pero **no ejecuta UPDATE, no modifica Aiven y no agrega permisos de mutacion**.

## Comportamiento
- Se elimina por completo la columna `Editar`.
- Las celdas editables se identifican de forma discreta; el lapiz aparece al hover/focus y permanece tenue en dispositivos tactiles.
- Click/tap/Enter sobre una celda editable abre un editor flotante anclado a esa celda.
- En movil el editor se convierte en panel inferior responsivo para no salirse de pantalla.
- Solo puede existir un editor abierto a la vez.
- Click fuera, `Esc`, `Cancelar`, cambio de modo o recarga de la tabla cierran el editor.
- `Guardar` se muestra deshabilitado en esta vista previa para evitar que el usuario crea que el dato fue persistido.
- En Modo normal las tablas conservan el comportamiento previo y no muestran celdas editables.

## Campos visualmente editables
- `02-OC`: Estatus, Posible recepcion de cubo, Comentario.
- `03-PM`: Estatus, Posible recepcion de cubo, Comentario.
- `04-M`: Estatus, Comentario.
- `05-PA`: Estatus, Ajustador, Posible inicio de Ajuste, Comentario.
- `06-A`: Estatus, Fecha Inicio Ajuste, Fecha Fin Ajuste, Ajustador, Comentario.
- `07-PE`: Estatus, Comentario.
- `08-T`: Comentario.

`Estatus` usa el catalogo de secciones devuelto por el propio Dashboard (`01-SUS` a `08-T`).

## Columnas agregadas solo en Modo Junta cuando no existian en el reporte visual
- `02-OC`: Estatus y Posible recepcion de cubo.
- `03-PM`: Estatus.
- `04-M`: Estatus.
- `05-PA`: Estatus y Ajustador.
- `06-A`: Estatus.
- `07-PE`: Estatus y Comentario.
- `08-T`: Comentario.

Esto permite que la futura edicion ocurra exactamente sobre la celda que se sobreescribira, sin una columna de acciones adicional.

## Archivos modificados
- `index.html` - cache bust del CSS/JS del Dashboard.
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js` - render de celdas editables y editor flotante responsive.
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.css` - estados visuales y popup/bottom-sheet responsive.

## No modificado
- Backend.
- SQL/permisos.
- Aiven.
- Reporte de Instalaciones congelado.
- Ajuste congelado.
- Cobranza Corellian/United.

## Pendiente despues de validar el acomodo
Definir/autorizar el permiso de mutacion para Edicion rapida y despues implementar el endpoint backend que actualice exclusivamente el campo permitido de `ins_fl`, seguido de recarga selectiva del row confirmado por backend.
