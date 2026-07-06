# Freeze Resumen del Dia + Equipos Criticos V0.1

## Objetivo
Relacionar Resumen del Dia y Equipos Criticos con el modulo Proyectos antes de congelarlos definitivamente.

## Archivos modificados
- `pruebas/core/router.js`
- `pruebas/modules/proyectos/proyectos.js`
- `pruebas/modules/resumen-dia/resumen-dia.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.js`

## Cambios
- Router permite abrir `Proyectos` con payload/id de proyecto.
- Modulo Proyectos expone `openProject(proyecto)` para recibir navegacion desde otros modulos.
- Resumen del Dia mantiene clave real Aiven, pero muestra nombres legibles para codigos tipo fecha.
- Resumen del Dia abre detalle de Proyecto desde top proyectos y detalle de ticket.
- Equipos Criticos abre el modulo Proyectos al seleccionar un proyecto critico.
- Equipos Criticos mantiene su detalle de equipo intacto.

## Notas
- No se modificaron backend, Home, Portafolio ni Panel de Control.
- La clave real de Aiven se conserva para consultas; solo cambia la representacion visual cuando aplica.
