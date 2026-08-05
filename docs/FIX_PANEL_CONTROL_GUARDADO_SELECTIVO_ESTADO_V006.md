# FIX_PANEL_CONTROL_GUARDADO_SELECTIVO_ESTADO_V006

## Objetivo

Corregir el guardado de permisos del Panel de Control para que no recargue toda la aplicación y mostrar una barra de estado debajo del botón **Guardar cambios**.

## Archivos modificados

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Comportamiento

1. Envía únicamente las casillas modificadas del usuario o rol seleccionado.
2. Verifica que Aiven procese la cantidad completa.
3. Relee únicamente los permisos del usuario o rol seleccionado.
4. Confirma uno por uno los valores guardados.
5. Actualiza en segundo plano solo el registro seleccionado.
6. Conserva pestaña, filtros, búsquedas, agrupaciones abiertas y posiciones de scroll.
7. No ejecuta `window.location.reload()` ni recarga el `bootstrap` completo.

## Barra de estado

La barra usa etapas reales del proceso:

- 10%: preparación.
- 35%: envío a Aiven.
- 70%: respuesta procesada y verificación.
- 90%: actualización selectiva de la vista.
- 100%: guardado confirmado.

En caso de error conserva los cambios pendientes y muestra el mensaje correspondiente.

## Alcance

- Solo frontend.
- No modifica el Visor de Usuarios.
- No modifica rutas ni controladores.
- No ejecuta SQL.
- No asigna roles, empresas o permisos automáticamente.
