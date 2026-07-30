# FIX Nueva Cotización V002

## Objetivo
Permitir que la búsqueda de Cliente utilice todos los clientes visibles para el usuario según el alcance de Ventas.

## Cambios
- Backend: el máximo de `page_size` pasa de 200 a 5000.
- Frontend: reconoce la respuesta oficial del listado en `data` y conserva compatibilidad con `clientes`.
- Frontend: elimina el recorte visual de 80 coincidencias.
- No cambia las reglas de acceso total, gerente o asesor.
- No requiere SQL ni volver a cargar clientes.

## Archivos
- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
