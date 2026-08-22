# FIX HOME H2.2 - Permiso efectivo del boton HOY

## Causa verificada
`core/app.js` consultaba los permisos del boton HOY mediante `ManttoPermissions.can(..., { defaultValue:false })`.
El endpoint `/api/panel-control/session-permissions` entrega para la sesion el valor `efectivo`, pero no entrega `configurado`, `heredado` ni `personalizado`.
`core/user-viewer.js` interpreta la ausencia de `configurado` como `false`; por ello `can(..., { defaultValue:false })` devolvia `false` incluso cuando `efectivo` era `true`.

## Cambio
Solo se modifica `core/app.js`.
El boton HOY consulta directamente `ManttoPermissions.state(codigo).efectivo` para:
- `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.VER`
- `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.ABRIR_RESUMEN_DEL_DIA`

Se conserva la regla acordada:
- VER efectivo: el boton se muestra.
- ABRIR_RESUMEN_DEL_DIA efectivo: el boton puede abrir Resumen del Dia.
- Sin VER efectivo: el boton no se muestra.

No se modifica el motor global de permisos, backend, H1, Pendientes, Notificaciones ni Push.
