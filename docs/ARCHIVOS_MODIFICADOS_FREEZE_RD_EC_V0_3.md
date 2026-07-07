# Freeze RD + Equipos Criticos V0.3

## Objetivo
Corregir la tabla de Proyectos Criticos para que consulte proyectos reales derivados de Portafolio + Tickets Aiven y pueda enlazar con el modulo Proyectos.

## Archivos modificados
- backend/src/controllers/criticos.controller.js
- pruebas/core/router.js
- pruebas/modules/proyectos/proyectos.js

## Cambios
- Se reemplazo la consulta de Proyectos Criticos por una agregacion basada en `portafolio` como fuente de proyectos.
- Se mantienen criterios configurables: fallas BLT minimas, dias, fallas por equipo, zona y proyecto.
- El boton Ver de Proyectos Criticos abre el modulo Proyectos y solicita el detalle del proyecto seleccionado.
- Se expone `ManttoProyectos.openDetail` y `ManttoProyectos.formatProyectoName` para integracion segura entre modulos.

## No modificado
- Resumen del Dia queda sin cambios.
- Portafolio queda sin cambios.
- Home queda sin cambios.
