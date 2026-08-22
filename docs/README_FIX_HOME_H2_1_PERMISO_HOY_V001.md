# FIX HOME H2.1 - Permiso correcto de Boton HOY

## Causa
H2 uso `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.ABRIR_RESUMEN_DEL_DIA` para decidir si el boton HOY era visible.

La estructura real separa dos acciones del subelemento `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY`:

- `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.VER`: controla visibilidad.
- `GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.ABRIR_RESUMEN_DEL_DIA`: controla la accion de abrir Resumen del Dia.

## Correccion
- El boton HOY se muestra solo cuando `.VER` es efectivo.
- El click a Resumen del Dia requiere ademas `.ABRIR_RESUMEN_DEL_DIA`.
- Si tiene `.VER` pero no `.ABRIR_RESUMEN_DEL_DIA`, el boton permanece visible pero la navegacion se bloquea.
- Si no tiene `.VER`, el boton permanece oculto.

## Archivos modificados
- `core/app.js`

No se modifican backend, Push, Notificaciones, Aiven ni H1.
