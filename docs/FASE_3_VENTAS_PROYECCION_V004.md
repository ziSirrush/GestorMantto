# Fase 3 · Ventas Proyección V004

## Objetivo

Cerrar la revisión funcional y visual del submódulo Proyección, conservando la fuente única `ventas_cotizaciones_cor`, la paginación backend de la Fase 2 y los acordeones independientes aprobados.

## Reglas confirmadas

Orden y peso comercial:

1. 🟠 En Contrato — peso 1
2. 🟢 Asignado — peso 2
3. Pre Asignado — peso 3
4. 🕓 En Espera de Definicion — peso 4
5. 🟡 Seguimiento con Probabilidad — peso 5

El peso 1 representa la etapa más cercana al contrato y el peso 5 la más lejana, conforme al catálogo de Desarrollo.

## Cambios

- Resumen general de cotizaciones y equipos.
- Resumen neutral por cercanía: pesos 1–3 y pesos 4–5.
- KPIs por etapa convertidos en filtros interactivos.
- Botones globales para expandir o contraer todos los acordeones.
- Cada acordeón continúa siendo independiente y pueden quedar varios abiertos.
- Encabezado de cada etapa muestra cotizaciones y equipos.
- Indicador de resultados visibles según la etapa seleccionada.
- Navegación por fila compatible con teclado.
- Registros sin identificador interno quedan deshabilitados y muestran `Sin ID interno`, sin disparar una notificación falsa.
- Se conserva la visibilidad comercial resuelta por backend.
- No se crean vistas paralelas: el detalle abre el Detalle de Cotización global.

## Base de datos

No agrega ni modifica tablas o columnas.
