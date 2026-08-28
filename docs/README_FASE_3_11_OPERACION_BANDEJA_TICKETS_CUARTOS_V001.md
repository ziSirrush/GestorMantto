# FASE 3/11 — OPERACION · Bandeja de Tickets · Cuartos UNITED V001

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama base: `main`
- Commit base revisado: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 3`
- Aplicar despues de Fase 1/11 y Fase 2/11.

## Alcance exacto de esta fase

El repositorio actual no contiene un modulo frontend independiente llamado **Bandeja de Tickets** ni un permiso funcional dedicado con ese nombre.

Por estabilidad, esta fase NO inventa:

- un modulo visible nuevo;
- una entrada nueva en el menu;
- permisos nuevos;
- tablas o columnas nuevas.

La fuente humana central que actualmente funciona como bandeja/base de Tickets es:

`GET /api/tickets`

Esa lectura ya esta protegida por el Guard General y por `buildTicketScopeSql_gnral()`; esta fase endurece su salida territorial para que el usuario no vea una etiqueta historica de otra zona en un Ticket que estructuralmente pertenece a uno de sus cuartos autorizados.

## Problema confirmado en la base actual

`tickets` no tiene `zona_id` ni FK directa a `z_op`; conserva `tickets.zona` como texto historico.

`portafolio` si contiene:

- `numero_equipo` UNIQUE;
- `zona_id` con FK a `z_op.id_zona`.

La regla aprobada existente para Tickets ya establece:

1. si existe `tickets.codigo_equipo`, la frontera territorial se deriva de `portafolio.numero_equipo -> portafolio.zona_id`;
2. solo si no existe codigo de equipo se permite resolver por `proyecto/proyecto_padre`;
3. el fallback por proyecto solo es valido cuando el universo Portafolio resuelve una sola `zona_id`;
4. `tickets.zona` no concede acceso.

Sin embargo, antes de esta fase `GET /api/tickets` devolvia `SELECT t.*`, por lo que la columna visual `zona` seguia siendo el texto historico aunque el filtro de seguridad ya fuera estructural.

## Cambio aplicado

Se modifica unicamente:

- `backend/src/modules/tickets/tickets-consultas_uni.js`

La lista ahora:

1. conserva `buildTicketScopeSql_gnral(req, 't')` como frontera de autorizacion;
2. resuelve `zona_id_oficial` por estructura;
3. resuelve `zona_oficial` mediante `z_op` activo;
4. reemplaza en la respuesta `zona` por `zona_oficial`;
5. nunca usa `tickets.zona` como fallback visual;
6. agrega a la respuesta los cuartos efectivos del usuario:
   - `alcance.zona_ids`
   - `alcance.zonas`.

### Ticket con codigo de equipo

`tickets.codigo_equipo -> portafolio.numero_equipo -> portafolio.zona_id -> z_op.zona`

`portafolio.numero_equipo` esta declarado UNIQUE en la estructura revisada, por lo que esta relacion es estructuralmente univoca.

### Ticket sin codigo de equipo

Se conserva exactamente la regla fail-closed ya aprobada:

- `proyecto` y `proyecto_padre` se consideran referencias alternativas;
- debe existir al menos una fila Portafolio relacionada;
- ninguna fila relacionada puede tener `zona_id` nulo;
- todas las filas relacionadas deben resolver a una sola `zona_id`.

Solo entonces se publica `zona_oficial` desde `z_op`.

## Compatibilidad

La forma principal de respuesta se conserva:

```json
{
  "ok": true,
  "source": "tickets",
  "data": []
}
```

Se agregan campos compatibles:

```json
{
  "alcance": {
    "zona_ids": [4, 5, 6],
    "zonas": ["CNA-01", "CNA-02", "CNA-03"]
  },
  "total": 0
}
```

Dentro de cada Ticket:

- `zona` = zona oficial;
- `zona_oficial` = zona oficial;
- `zona_id_oficial` = id estructural de la zona.

El valor historico `tickets.zona` no se expone como zona visible de la Bandeja.

## Lo que NO se toca en Fase 3/11

- `GET /api/tickets/:ticket` queda para **Fase 4/11 — Detalle del Ticket**.
- Comentarios, chat, Vo.Bo. y validaciones no se modifican.
- M2M `/tickets/sync` y `/tickets/sync-fechas-cdmx` no se modifican.
- No se modifica Dashboard Call Center, Resumen del Dia ni Dashboard Operativo desde esta entrega.
- No se modifica la BD.

## Archivo de validacion agregado

- `backend/scripts/test-fase-3-operacion-bandeja-tickets.js`

La prueba valida que:

- se conserve `buildTicketScopeSql_gnral`;
- el codigo de equipo se relacione con `portafolio.zona_id`;
- el fallback por proyecto conserve zona unica;
- la etiqueta oficial se obtenga desde `z_op`;
- una zona historica incorrecta sea reemplazada en la respuesta;
- se expongan los cuartos efectivos del usuario;
- se propaguen los parametros del alcance SQL.

## Prueba runtime recomendada — Tester 81

Con las asignaciones previamente verificadas para Tester `id_SB=81`:

- `4 -> CNA-01`
- `5 -> CNA-02`
- `6 -> CNA-03`

Despues de aplicar Fases 1, 2 y 3, ejecutar autenticado:

`GET /api/tickets`

La respuesta debe reportar:

```json
"alcance": {
  "zona_ids": [4, 5, 6],
  "zonas": ["CNA-01", "CNA-02", "CNA-03"]
}
```

Ningun registro debe mostrar en `data[].zona` una etiqueta fuera de la zona estructural obtenida por Portafolio/z_op.

Con la evidencia Workbench usada en Fases 1 y 2, se encontraron Tickets estructuralmente asociados a `CNA-01` que conservaban textos historicos distintos en `tickets.zona`; esta fase corrige precisamente esa discrepancia visual en la lista central.

## Limite de verificacion

La estructura, sintaxis e invariantes de esta entrega se validan localmente. **No puedo confirmar el comportamiento runtime contra Aiven/Azure** hasta aplicar el ZIP y ejecutar la consulta autenticada contra el backend desplegado/local.
