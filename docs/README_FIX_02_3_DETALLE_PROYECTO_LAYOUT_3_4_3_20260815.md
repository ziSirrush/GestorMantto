# FIX 02.3 - Detalle Proyecto - Layout KPI 3-4-3

## Alcance
Cambio exclusivamente visual en el orden de los KPI de **Indicadores del Proyecto**.

Nuevo orden:
1. Estatus de equipos: 3 tarjetas.
2. Llamadas: 4 tarjetas.
3. Cobranza: 3 tarjetas.
4. Graficas existentes, sin cambios.

## Archivo modificado
- `core/details.js`

## No se modifica
- Backend.
- Consultas.
- Calculos.
- Datos.
- Navegacion.
- Funciones de Cobranza.
- Formateo global de proyectos.
- CSS.
- Otros modulos.

## Validacion
- `node --check core/details.js`: OK.
- Diff revisado: una sola linea funcional cambia el orden de renderizado de los bloques KPI.
