# FASE 3 - PM&M Frontend V001

Fecha: 19/08/2026
Modulo: Instalaciones > PM&M
Estado: Desarrollo

## Alcance

Se integra la vista real de PM&M sobre el frontend de Contexto.zip.

La vista consume exclusivamente los endpoints preparados en Fase 2:

- GET /api/instalaciones/pmm/03-pm?page=N
- GET /api/instalaciones/pmm/04-m?page=N

## Tabla 03-PM

- SUP
- NOTIF (alertas reutilizadas desde Reporte de Instalaciones)
- %OC
- Posible Recepcion de Cubo
- Proyecto
- Referencia en sitio
- Comentario

## Tabla 04-M

- SUP
- NOTIF (alertas reutilizadas desde Reporte de Instalaciones)
- %MO
- Proyecto
- Referencia en sitio
- CCR
- Subcontratista
- Inicio montaje
- Fin montaje planeado
- Fin montaje modificado
- Fin montaje real
- Dias restantes
- Comentarios

## Reglas aplicadas

- Paginacion independiente de 30 registros por tabla.
- No se recalculan alertas en frontend.
- Los codigos y configuracion visual llegan desde el backend de PM&M, que reutiliza Reporte de Instalaciones.
- Proyecto abre el detalle estandarizado de proyecto Corellian.
- Referencia en sitio abre el detalle estandarizado de equipo Corellian usando proyecto + referencia.
- Un 403 de una tabla oculta solo esa tabla; la otra puede seguir disponible si el usuario tiene permiso.
- El modulo no muestra indicadores tecnicos de conexion a Aiven.
- Responsive/PWA: las tablas conservan todos los encabezados y usan desplazamiento horizontal en pantallas angostas.

## Archivos modificados

- index.html
- core/router.js

## Archivos nuevos

- modules/instalaciones-pmm/instalaciones-pmm_cor.html
- modules/instalaciones-pmm/instalaciones-pmm_cor.css
- modules/instalaciones-pmm/instalaciones-pmm_cor.js
- docs/README_FASE_3_PMM_FRONTEND_V001.md

## No incluido

- No hay cambios de backend en esta fase.
- No hay SQL en esta fase.
- No se modifican Reporte de Instalaciones, Dashboard Instalaciones, Documentacion Pendiente ni otros modulos operativos.
