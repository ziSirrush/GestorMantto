# Fix Dashboard Operativo - Criticidad por usuario

## Encontrado

Dashboard Operativo seguia determinando el estado `CRITICO` con una regla local basada en tickets del ano actual. Esto podia diferir de los parametros guardados por cada usuario.

## Cambios

- Lee `criticos_fallas` y `criticos_periodo` desde `/api/usuarios/me/criticos-preferencias`.
- Usa respaldo de `3 fallas RESP BLT / 35 dias` cuando no hay preferencias validas.
- Consulta `/api/equipos-criticos` con los parametros especificos del usuario.
- Los emojis `CRITICO` de equipos usan el mismo conjunto personalizado que Resumen, Equipos Criticos y Dashboard Call Center.
- Escucha `mantto:criticos-preferencias-updated` para refrescar el modulo cuando cambian los parametros.
- El estado del modulo muestra el criterio activo del usuario.
- No modifica MTBC, preventivos, confirmaciones, backend, SQL ni otros modulos.

## Archivo modificado

- `modules/dashboard-operativo/dashboard-operativo.js`

## Validaciones

- Sintaxis validada con `node --check`.
- Peticiones autenticadas mediante los encabezados existentes de `ManttoAuth`.
- Se conserva la estructura y los detalles United vigentes.
