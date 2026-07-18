# Fix Dashboard Portafolio · KPI comerciales y Views

Fecha: 17/07/2026
Estado: Desarrollo / listo para pruebas

## Alcance

- Corrige la orientación de las categorías comerciales:
  - `No en Servicio`: `estatus_servicio` contiene "No en Servicio".
  - `Gratuito/Garantía`: equipo activo con `mes_termino_gratuitos` o `termino_garantia` informado.
  - `En Cobranza`: equipo activo que no pertenece a las dos categorías anteriores.
- Agrega KPI visible "No en Servicio".
- Distribuye los KPI en formato 5-2:
  - Fila 1: Total Portafolio, En Cobranza, Gratuito/Garantía, No en Servicio y Conversiones.
  - Fila 2: Funcionando y Parados.
- Los KPI En cobranza, Gratuito/Garantía y No en Servicio abren una View contextual dentro de Dashboard Portafolio.
- La navegación usa `ManttoRouter`, conserva historial y Back.
- La View usa la plantilla visual actual del módulo.
- Conserva filtros Zona, Tipo, Supervisor, Estado operativo y Buscar en las Views comerciales.
- Mantiene el filtro comercial fijo según el KPI seleccionado y permite refinar por Estado operativo.
- Paginación estándar: 30 filas.
- Agrega ordenamiento seguro por encabezados mediante whitelist en backend.
- Mantiene enlaces globales de Proyecto y Equipo.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `core/router.js`
- `index.html`
- `modules/portafolio/portafolio.js`
- `modules/portafolio/portafolio.css`

## Validaciones requeridas antes de deploy

1. Iniciar backend sin errores.
2. Confirmar `/api/health`.
3. Confirmar rutas `/api/portafolio/dashboard` y `/api/portafolio/equipos`.
4. Comparar que la suma de En Cobranza + Gratuito/Garantía + No en Servicio sea igual al total activo.
5. Probar Back nativo y botón "Dashboard Portafolio" desde cada View.
6. Probar todos los filtros, incluido Estado operativo, búsqueda, ordenamiento y paginación.
7. Verificar distribución visual 5-2 de los KPI en escritorio y responsive.
8. Probar enlaces de Proyecto y Equipo.

## Nota de datos

Los campos comerciales actuales son `varchar`; por estabilidad, este fix conserva la regla aprobada basada en clasificación existente y no introduce conversiones de fecha no verificadas.
