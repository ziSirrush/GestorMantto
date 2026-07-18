# Dashboard Call Center - Cambios de Direccion V0.2

## Integrado

- KPI y tabla paginada de Equipos No Funcionando.
- Resumen de llamadas de los ultimos 365 dias por proyecto y por equipo.
- Grafica de barras por Estado de la Republica en sustitucion de la grafica por estado del ticket.
- Nuevo criterio para Promedio de cierre:
  - ticket cerrado;
  - estatus final funcionando u operativo;
  - diferencia entre llegada y solucion;
  - respaldo con tiempo_solucion cuando las fechas no permiten calcularlo;
  - descarte de valores no positivos o mayores a 30 dias.
- Columnas configurables agregadas:
  - Zona Administrativa.
  - Zona de falla.
  - Tiempo Llegada.
  - Tiempo Solucion.
  - Tiempo Llegada II.
  - Tiempo Solucion II.
  - Ticket excede SLA.
- PPNS no se incorpora porque no existe en la fuente actual.
- Proyecto, Equipo y Ticket reutilizan ManttoDetails y la navegacion unificada de pantalla completa.

## Archivos modificados

- modules/callcenter/callcenter.html
- modules/callcenter/callcenter.css
- modules/callcenter/callcenter.js
