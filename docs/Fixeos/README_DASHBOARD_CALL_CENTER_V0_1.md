# Dashboard Call Center V0.1

Estado: Desarrollo / Pruebas
Fecha: 2026-07-07

## Alcance

Se prepara el módulo independiente `Dashboard Call Center` dentro de `pruebas/modules/callcenter/`.

Incluye:

- Vista modular `callcenter.html`.
- Estilos aislados `callcenter.css` con prefijo `cc-`.
- Lógica modular `callcenter.js` expuesta como `window.ManttoCallCenter`.
- Integración en `pruebas/index.html`.
- Integración de ruta en `pruebas/core/router.js`.

## Funcionalidad incluida

- Filtro de período: desde / hasta.
- Filtro de zona operativa.
- KPIs de tickets, cerrados, en curso, abiertos, responsabilidad BLT y responsabilidad cliente.
- Alertas: atrapados, filtraciones, voltaje, equipos críticos y fuera de SLA.
- Promedios de llegada y cierre.
- Donas de estado, responsabilidad y causa de falla.
- Barras por zona, tipo de equipo y estado.
- Tabla: Equipos con más llamadas del período.
- Tabla: Proyectos con más llamadas del período.
- Tabla principal de tickets del período con columnas configurables.
- Ventana flotante para detalles al hacer clic en KPIs, donas o barras.

## Fuente de datos

El módulo consulta Aiven mediante backend:

- `/api/tickets?limit=20000`
- `/api/portafolio/equipos?page=1&page_size=20000`
- Fallbacks: `/api/tickets`, `/api/portafolio?limit=20000`, `/api/portafolio`

## Notas técnicas

- No modifica módulos congelados.
- No toca Home, Resumen del Día, Equipos Críticos, Portafolio ni Proyectos.
- Las tablas retiradas de Resumen del Día quedan incorporadas aquí.
- Los cálculos siguen en frontend por ser preparación modular inicial. Cuando el volumen crezca, debe migrarse a backend agregado según la Constitución del proyecto.
