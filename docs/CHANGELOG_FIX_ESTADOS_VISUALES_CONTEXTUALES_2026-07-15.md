# Fix de estados visuales por contexto

Fecha: 2026-07-15

## Cambios

- Resumen del Día: se restauró el renderizado de la tabla de tickets corrigiendo un acceso inseguro a `eqf`.
- KPI En críticos: ahora cuenta equipos críticos únicos del día, no tickets repetidos del mismo equipo.
- Tickets: conservan sus emojis propios (atrapado, filtración, voltaje, no funcionando y fuera de SLA) concatenados al número de ticket.
- Dashboard Operativo: los equipos críticos muestran `CRITICO` conforme al criterio de 3 fallas BLT en 35 días.
- Dashboard Portafolio: los equipos muestran criticidad además de su estado operativo; los tickets relacionados muestran sus estados visuales.
- Proyectos United: un proyecto muestra `CRITICO` cuando al menos uno de sus equipos cumple el criterio; en el detalle, cada equipo y ticket muestra sus estados propios.
- Dashboard Call Center: se mantuvo el emoji del ticket y se reforzó la marca de proyecto crítico en listados secundarios.
- Equipos Críticos: no se agregó el emoji `CRITICO` redundante dentro del módulo.

## Regla visual

- Proyecto: muestra `CRITICO` si contiene al menos un equipo crítico.
- Equipo: muestra sus estados aplicables.
- Ticket: muestra sus alertas propias.
- Módulo Equipos Críticos: omite `CRITICO` por redundancia contextual.
