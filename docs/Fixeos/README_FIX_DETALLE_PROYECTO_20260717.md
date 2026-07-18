# FIX Detalle Proyecto - 2026-07-17

## Alcance

Este paquete modifica exclusivamente el componente global **Detalle Proyecto** y su endpoint de datos.

## Archivos modificados

- `core/details.js`
- `backend/src/controllers/data.controller.js`

## Cambios aplicados

### Elemento 1 - Detalle del Proyecto

Se muestran los campos en el orden aprobado:

- Ciudad
- Estado
- Estatus Serv.
- Zona Op.
- Dirección
- Fecha instalación
- Fecha entrega
- Término garantía
- Fecha recepción mantenimiento
- Mes inicio gratuitos
- Mes término gratuitos
- Mes objetivo inicio cobranza
- Fecha ingreso portafolio
- Superintendente
- Supervisor

Las fechas usan el formato `DD/MM/AAAA` mediante el formateador existente.

### Elemento 2 - KPIs y Rings

Distribución aprobada **3-4-3**:

- 3 KPIs de equipos:
  - Equipos activos
  - Equipos detenidos
  - Equipos críticos del año actual
- 4 KPIs de llamadas del año actual:
  - Total de llamadas
  - Responsabilidad BLT
  - Responsabilidad Cliente
  - Sin Responsable
- 3 rings horizontales:
  - Total de llamadas por responsabilidad
  - Llamadas BLT distribuidas por equipo
  - Llamadas Cliente distribuidas por equipo

El criterio de equipo crítico conserva la regla vigente: **3 o más llamadas BLT durante el año actual**.

### Elemento 3 - Equipos del Proyecto

- Se retiraron únicamente los KPIs `Total de equipos` y `Parados` de esta sección.
- Se conservan los indicadores visuales.
- Se conserva la tabla sin cambios en columnas, cálculos, clics y navegación.

### Elemento 4 - Tickets del Proyecto

- Se agregó la barra de indicadores visuales.
- Se agregaron los emojis correspondientes junto al No. Ticket.
- Se conserva el resto de la tabla, filtro anual, clics y navegación.

## Backend

El endpoint de detalle ahora devuelve:

- Los campos adicionales del proyecto.
- `project_metrics` con los siete KPIs.
- `project_distributions` con los datos de los tres rings.

Los cálculos pesados permanecen en backend, conforme a la Constitución del proyecto.

## Instalación

Copiar los archivos respetando sus rutas. Después:

1. Desplegar primero el backend.
2. Verificar `/api/health`.
3. Verificar que la ruta `/api/proyectos/detalle/:proyecto` responda JSON.
4. Publicar el frontend.
5. Probar el Detalle Proyecto desde al menos dos módulos distintos.

## Validaciones realizadas

- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`
- Revisión de contenido del ZIP para confirmar que solo incluye archivos modificados y este README.

## Nota

No se modificó la vista principal de Proyectos de Mantenimiento ni otros módulos congelados.
