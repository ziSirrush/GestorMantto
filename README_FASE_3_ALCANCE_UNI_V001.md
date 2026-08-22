# FASE 3 - ALCANCE_UNI V001

## Base verificada

Repositorio: `ziSirrush/GestorMantto`  
Rama: `main`  
Commit base revisado: `f03066618a6c329eab8669f2d61a0d5b546e9c4e`

Prerequisitos conceptuales:

- Fase 1 `alcance_gnral` V001.
- Fase 2 `alcance_cor` V001.

## Objetivo

Crear el motor independiente `alcance_uni` para informacion de agrupaciones con `perm_agrupaciones.empresa = 'UNITED'`.

UNITED se filtra por **Zona Operativa activa**, no por `REPORTA_A`, `REL_ADMIN` ni por quien creo el registro.

Regla acordada para una consulta humana UNITED:

1. el usuario debe tener el permiso funcional correspondiente;
2. el registro debe pertenecer a una de sus Zonas Operativas activas.

Si cualquiera de las dos condiciones falla, el registro no es visible.

`alcance_uni` resuelve exclusivamente la segunda condicion. El permiso funcional sigue perteneciendo al Guard/capa superior.

## Estructura real reutilizada

No se agrega ni modifica ninguna tabla.

Estructura verificada en el esquema actual:

### `usuario_zop`

- `usuario_id` -> `usuarios.id_SB`;
- `zona_id` -> `z_op.id_zona`;
- `estado` indica si la relacion esta activa.

### `z_op`

- `id_zona`;
- `zona`;
- `nombre`;
- `estado`.

### `portafolio`

- `zona_id` tiene FK hacia `z_op.id_zona`;
- `zona_operativa` existe tambien como texto, pero el motor usa el FK `zona_id` como fuente estructurada.

La implementacion actual de Notificaciones ya utiliza `usuario_zop.estado = 1` y `usuario_zop.zona_id` para validar destinatarios por Zona Operativa. La Fase 3 conserva el mismo criterio.

## Archivos incluidos

- `backend/src/services/alcance/alcance-uni.service.js`
- `backend/scripts/test-alcance-uni.js`
- `ADR_ALCANCE_UNI_V001.md`
- `README_FASE_3_ALCANCE_UNI_V001.md`

## Contrato creado

### `resolveAlcanceUni_uni(executor, source, options)`

Resuelve el usuario efectivo mediante `req.contextUser || req.user`, conservando compatibilidad con Viewer.

Devuelve:

- motor y empresa;
- estado de llave maestra;
- Zonas Operativas activas completas;
- `zona_ids`;
- `zona_codigos`;
- si el modulo debe aplicar filtro zonal.

Solo se consideran zonas donde:

- `usuario_zop.estado = 1`;
- `z_op.estado = 1`.

Un usuario sin Zona Operativa activa no obtiene acceso implícito: los builders fallan cerrado con `1 = 0`.

### `buildZoneIdScopeSql_uni(...)`

Builder generico para tablas que tengan una columna FK real a `z_op.id_zona`.

### `buildPortafolioScopeSql_uni(...)`

Builder especifico para `portafolio.zona_id`.

### `buildTicketScopeSql_uni(...)`

`tickets` no tiene FK directa a `z_op` en la estructura actual. Para no asumir que `tickets.zona` equivale al catalogo de Zona Operativa, el alcance del Ticket se deriva mediante `portafolio.zona_id`.

Se conservan los enlaces Ticket -> Portafolio ya usados por el backend actual:

- `tickets.codigo_equipo` -> `portafolio.numero_equipo`;
- `tickets.proyecto` -> `portafolio.proyecto`;
- `tickets.proyecto_padre` -> `portafolio.proyecto`.

Si el Ticket no puede relacionarse con un registro activo de Portafolio dentro de una Zona Operativa autorizada, no pasa el filtro zonal.

### `alcanceUniAllowsZone_uni(context, zoneId)`

Permite reutilizar el mismo contexto para validar una Zona Operativa concreta, incluyendo futuras capas de informacion cruzada y notificaciones.

## Llaves maestras

El motor no detecta roles por nombre ni inventa una llave maestra nueva.

Admite `{ masterAccess: true }` unicamente si una capa superior ya valido la llave maestra UNITED.

Con ella:

- no consulta `usuario_zop`;
- `requiere_filtro_zona = false`;
- los builders devuelven `1 = 1`.

Esto no elimina la necesidad de validar correctamente la llave maestra en la capa superior durante la integracion.

## Seguridad

- No hay fallback por personas para UNITED.
- No hay fallback por `created_by`.
- Relacion de usuario y Zona Operativa deben estar activas.
- Zona Operativa del catalogo debe estar activa.
- Usuario sin zonas falla cerrado.
- Columnas y aliases SQL se validan antes de interpolarlos.
- `tickets.zona` no se interpreta automaticamente como `z_op.zona`.
- M2M/Sync/Webhook permanece fuera del alcance humano.

## Notificaciones UNITED

Esta fase no modifica Notificaciones, pero su contrato queda alineado con la norma ya acordada:

- evento UNITED con Zona Operativa autorizada -> el usuario puede ser destinatario si tambien cumple las demas reglas de notificacion;
- evento UNITED fuera de sus zonas -> no se notifica.

El backend actual ya contiene una comprobacion zonal basada en `usuario_zop`, por lo que la integracion posterior debera reutilizarla y no crear una segunda tabla de zonas.

## Informacion cruzada

Todavia no se activa la tercera capa. En una fase posterior cada bloque de una vista compuesta validara de forma independiente:

`permiso funcional + alcance del motor correspondiente`.

Ejemplo acordado: acceso a Portafolio no concede automaticamente acceso al bloque Tickets.

## Alcance deliberadamente NO incluido

Todavia no se modifica:

- Guard actual;
- seleccion automatica por `perm_agrupaciones.empresa`;
- rutas/controladores de modulos;
- Panel de Control;
- frontend;
- SQL/Aiven;
- capa de informacion cruzada;
- notificaciones existentes.

Aplicar solo esta Fase 3 no cambia el comportamiento productivo de los modulos.

## Validaciones realizadas

- `node --check backend/src/services/alcance/alcance-uni.service.js`
- `node --check backend/scripts/test-alcance-uni.js`
- `node backend/scripts/test-alcance-uni.js`

Resultado esperado: `ALCANCE_UNI_V001: OK`.
