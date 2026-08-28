# FIX VA - Estatus de cartera y carga

## Alcance
Cobranza United -> Venta Adicional (VA).

## Cambios
1. `backend/src/controllers/cobranza-uni-cuartos-v2.controller.js`
   - La consulta MAIN de Venta Adicional excluye registros donde `pc.estatus_cartera IS NULL`.
   - También excluye `estatus_cartera = 'Inactivo'`, ignorando mayusculas/minusculas y espacios laterales.
   - El filtro se aplica antes de construir `rows`, por lo que afecta de forma consistente la tabla, catalogos y KPI de VA.
   - No se modifica ni elimina ningun registro de la BD.

2. `modules/cobranza-uni/cobranza-uni.js`
   - La carga inicial de Venta Adicional deja de mostrar `Consultando Aiven...` y `Cargando tabla pc...`.
   - Muestra un unico estado limpio: `Obteniendo informacion...` (en interfaz se conserva el acento: `Obteniendo información...`).

## No modificado
- Mantenimiento Preventivo (MP).
- Gestion de Credito.
- Rutas.
- Esquema de BD.
- Sincronizacion `pc` / `id_pc`.
- Detalle de Venta Adicional.

## Validaciones
- `node --check modules/cobranza-uni/cobranza-uni.js`: OK.
- `node --check backend/src/controllers/cobranza-uni-cuartos-v2.controller.js`: OK.
- Diff contra `main`: solo los cambios descritos arriba.
