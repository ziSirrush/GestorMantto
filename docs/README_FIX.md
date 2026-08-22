# FIX COBRANZA UNI · GESTIÓN DE CRÉDITO · RELACIONES REGISTRO A REGISTRO V006

Fecha: 14/08/2026
Base: V005

## Objetivo
Corregir la interpretación de V005. El Detalle de Gestión de Crédito ya no muestra una tabla-resumen de relaciones. Ahora muestra dos tablas independientes, estilo tabla de Tickets dentro de Proyecto United, con todos los registros relacionados al proyecto seleccionado:

1. **Mantenimiento Preventivo** → `detalle_mp_2026`
2. **Venta Adicional** → `pc`

## Relación aplicada
- Mantenimiento Preventivo: coincidencia por `idns` y, como relación alternativa del mismo proyecto, por `proyecto` normalizado.
- Venta Adicional: coincidencia por `proyecto` normalizado, porque `pc` no contiene `idns` en su estructura vigente.

## Optimización
Se agrega una sola consulta HTTP de detalle:

`GET /api/cobranza-uni/gestion-credito/:id/detalle`

La backend resuelve en la misma solicitud:
- registro vigente de `gestion_credito`;
- todos los registros relacionados de `detalle_mp_2026`;
- todos los registros relacionados de `pc`.

No se realizan fetch por fila ni un fetch independiente por cada tabla. La actualización desde el botón del detalle refresca únicamente este recurso relacionado, no toda la Main.

## Navegación
- **Ir a Proyecto** permanece funcional.
- **Ir a MP** permanece visible pero deshabilitado.
- **Ir a Venta Adicional** permanece visible pero deshabilitado.
- Cada registro presenta la acción `Abrir` deshabilitada, preparada visualmente para una fase posterior.

## Archivos modificados
- `backend/src/controllers/cobranza-uni.controller.js`
- `backend/src/routes/cobranza-uni.routes.js`
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`

## Base de datos
No crea tablas, no altera columnas y no modifica datos. Solo realiza SELECT sobre las tablas existentes.

## Validación ejecutada
- `node --check backend/src/controllers/cobranza-uni.controller.js`
- `node --check backend/src/routes/cobranza-uni.routes.js`
- `node --check modules/cobranza-uni/cobranza-uni.js`
