# FIX N4.2 · Roles alfabeticos + eventos de Direccion

Fecha: 2026-08-15

## Causa encontrada

1. N4.1 conservaba el orden recibido por el backend para los roles (`empresa`, `nivel`, `rol`), por eso el panel Rol no quedaba alfabetico globalmente.
2. El Panel de Control NO inventa ni hardcodea interacciones: N2 lee dinamicamente `notificacion_eventos WHERE activo = 1`. Por tanto, las tres nuevas interacciones de Direccion no pueden aparecer si sus filas de catalogo no existen o estan inactivas en Aiven.

## Cambios

### `modules/panel-control/panel-control.js`
- El panel Rol se ordena alfabeticamente por `rol` usando `localeCompare(..., 'es')`.
- El mismo arreglo ordenado alimenta el panel Politica, por lo que la correspondencia fila Rol ↔ fila Politica permanece 1:1.
- No cambia la logica maestro Interacciones → Roles/Politicas.

### `backend/sql/20260815_fix_n4_2_eventos_direccion.sql`
- Garantiza que existan y esten activos:
  - `FALLA_EQUIPO_CRITICO` · Falla en Equipo Critico
  - `PERSONA_ATRAPADA` · Persona Atrapada
  - `NUEVO_EQUIPO_CRITICO` · Nuevo Equipo Critico
- Es idempotente.
- No altera esquema.
- No asigna roles ni politicas.
- No modifica `notificacion_evento_roles`.

## Aplicacion

1. Reemplazar `modules/panel-control/panel-control.js`.
2. Ejecutar en Aiven `backend/sql/20260815_fix_n4_2_eventos_direccion.sql`.
3. Confirmar que el SELECT final devuelve las 3 filas con `activo = 1`.
4. Recargar Panel de Control > Notificaciones. Las 3 interacciones deben aparecer en el panel maestro Interacciones.
5. Configurar los roles y politicas desde la interfaz y guardar.

## Validaciones realizadas

- `node --check modules/panel-control/panel-control.js`: OK.
- Verificado que el orden alfabetico se aplica antes de renderizar Rol y Politica.
- Verificado que ambos paneles usan el mismo arreglo `roles`, conservando alineacion 1:1.
- SQL revisado: sin `CREATE`, `ALTER`, `DROP` ni cambios de esquema.
- SQL no escribe en `notificacion_evento_roles`.
