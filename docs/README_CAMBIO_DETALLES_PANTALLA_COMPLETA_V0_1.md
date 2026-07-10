# Cambio de detalles a vista principal V0.1

Fecha: 2026-07-10
Estado: Pruebas antes de despliegue

## Objetivo

Sustituir las ventanas flotantes globales de Proyecto, Equipo y Ticket por una vista principal dentro de Mantto Gestor, manteniendo el encabezado, panel lateral, barra contextual, sesión y Nori.

## Cambios aplicados

- `core/details.js`
  - El detalle global ahora se renderiza en `view-detalle`.
  - Se agregó botón `Regresar`.
  - Proyecto, Equipo, Ticket y Equipo crítico generan navegación mediante `ManttoRouter`.
  - Los enlaces relacionados dentro de un detalle abren una nueva vista de detalle, sin superponer ventanas.
  - Se añadió adaptación responsive para móvil/PWA.

- `core/router.js`
  - Nueva ruta interna `detalle`.
  - Historial significativo: módulo -> detalle -> detalle relacionado.
  - Se conserva la posición vertical del módulo al regresar con el botón interno.
  - La URL distingue el tipo e identificador del detalle.

- `modules/proyectos/proyectos.js`
  - El botón `Ver` abre el detalle global de Proyecto en pantalla completa.

- `modules/portafolio/portafolio.js`
  - El botón `Ver` abre el detalle global de Equipo en pantalla completa.

- `modules/resumen-dia/resumen-dia.js`
  - El clic en Ticket abre el detalle global de Ticket en pantalla completa.
  - Proyecto y Equipo ya utilizaban el controlador global y heredan el nuevo comportamiento.

- `index.html`
  - Se actualizaron versiones de caché de los archivos modificados.

## Alcance de esta prueba

Los modales utilizados para listas de KPIs o agrupaciones permanecen temporalmente sin cambios. Solo los identificadores y acciones directas de Proyecto, Equipo y Ticket redirigen a pantalla de detalle, que es la solicitud de Dirección.

## Validaciones recomendadas

1. Abrir Proyecto desde Proyectos, Resumen del Día, Críticos o Movimientos.
2. Abrir Equipo desde Portafolio o desde un Proyecto.
3. Abrir Ticket desde Resumen del Día o desde las tablas relacionadas.
4. Navegar Proyecto -> Equipo -> Ticket.
5. Usar `Regresar` y el botón Atrás del navegador.
6. Confirmar que el módulo anterior conserva filtros cargados y posición de scroll.
7. Revisar escritorio y pantalla móvil.
