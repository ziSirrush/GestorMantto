# Barra lateral contextual V0.1.6

## Cambio aplicado

Se añadió estado visual activo al grupo que contiene el módulo actual.

- Si el usuario está en Resumen del Día, Equipos Críticos, Dashboard Call Center o Dashboard Operativo, el encabezado Operación queda resaltado.
- Si está en Dashboard Portafolio, Movimientos o Proyectos de Mantenimiento, Portafolio queda resaltado.
- El mismo comportamiento aplica a Ventas, Logística, Instalaciones y Cobranza.
- Cuando la barra está contraída, se muestra solamente el emoji del grupo activo con el mismo estilo resaltado usado por los accesos directos.
- Cuando la barra está expandida, se resaltan el grupo y el submódulo activo.
- Inicio, Usuarios y Panel de Control conservan su comportamiento directo actual.

## Archivos modificados

- `core/router.js`
- `styles/base.css`
