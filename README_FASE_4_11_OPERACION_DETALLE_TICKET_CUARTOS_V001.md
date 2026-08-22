# FASE 4/11 — OPERACION · Detalle Ticket · Cuartos UNITED V001

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama base: `main`
- Commit base revisado: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 3`
- Esta fase debe aplicarse **despues de Fase 3/11**, porque modifica el mismo archivo `tickets-consultas_uni.js` sobre la version canonizada de la Bandeja.

## Objetivo

Cerrar el alcance territorial del **Detalle Ticket** con la misma autoridad estructural aprobada para la Bandeja:

`usuario_zop -> z_op.id_zona -> portafolio.zona_id -> ticket relacionado`

El detalle debe llegar filtrado desde su primera lectura backend. `tickets.zona` no gobierna acceso ni la zona mostrada.

## Problema existente antes de esta fase

La lista central de Tickets queda canonizada en Fase 3/11, pero el detalle seguia ejecutando:

```sql
SELECT t.*
FROM tickets t
WHERE (t.ticket = ? OR t.folio = ?)
  AND <scope territorial>
```

El `scope` ya evitaba abrir registros fuera de los cuartos permitidos, pero la respuesta continuaba exponiendo `tickets.zona`, que en las pruebas Workbench mostro valores historicos diferentes de la zona estructural real de Portafolio.

Ejemplo real de la clase de inconsistencia observada:

- zona estructural por `portafolio.zona_id`: `CNA-01`
- texto historico de `tickets.zona`: `CNB-03`, `CNA-03`, etc.

Por eso el detalle podia estar autorizado correctamente y aun asi mostrar una zona incorrecta.

## Cambio aplicado

Se modifica unicamente:

- `backend/src/modules/tickets/tickets-consultas_uni.js`

`GET /api/tickets/:ticket` ahora:

1. conserva `buildTicketScopeSql_gnral(req, 't')`;
2. limita la consulta al Ticket/Folio solicitado;
3. si existe `codigo_equipo`, resuelve:
   `tickets.codigo_equipo -> portafolio.numero_equipo -> portafolio.zona_id`;
4. si no existe codigo, conserva el fallback fail-closed por `proyecto/proyecto_padre` de zona unica;
5. resuelve la etiqueta visible mediante `z_op.id_zona -> z_op.zona`;
6. reemplaza `data.zona` por la zona oficial;
7. expone adicionalmente:
   - `data.zona_oficial`
   - `data.zona_id_oficial`
   - `alcance.zona_ids`
   - `alcance.zonas`.

## Defensa ya existente que se conserva

No se cambian rutas porque la base actual ya protege:

- `GET /tickets/:ticket` con `ticketDetailGuard` + `requireTicketRecordScope_gnral`;
- `GET /tickets/:ticket/interacciones` con el mismo guard y alcance de registro;
- `POST /tickets/:ticket/comentarios` con guard de detalle + alcance de registro;
- validacion y Vo.Bo. con autenticacion, permiso funcional especifico y alcance del Ticket;
- sincronizadores M2M con autenticacion de integracion, fuera del Guard humano.

Por lo tanto Fase 4 no duplica ni reescribe chat, notificaciones o reglas de Vo.Bo.; solo corrige la lectura principal del detalle que todavia publicaba la zona historica.

## Compatibilidad frontend

El frontend actual de Detalle Ticket consume `t.zona` para mostrar la zona. Como esta fase canoniza `data.zona` en backend, no se necesita alterar `core/details.js` para obtener la zona correcta en el flujo normal autorizado.

La forma base de respuesta se conserva:

```json
{
  "ok": true,
  "source": "tickets",
  "data": {}
}
```

Se agregan los campos territoriales sin eliminar los campos existentes.

## Sin cambios de BD

Esta fase no crea ni modifica:

- tablas;
- columnas;
- indices;
- permisos;
- agrupaciones;
- asignaciones `usuario_zop`.

## Archivo de validacion

- `backend/scripts/test-fase-4-operacion-detalle-ticket.js`

La prueba valida que:

- el detalle conserva el `scope` territorial;
- la zona sale de `portafolio.zona_id` y `z_op.zona`;
- el fallback por proyecto sigue exigiendo una sola zona;
- una zona historica incorrecta sea reemplazada;
- se expongan los cuartos efectivos;
- los parametros del Ticket y del alcance lleguen al SQL en el orden esperado.

## Prueba runtime recomendada — Tester 81

Cuartos ya verificados en Workbench:

- `4 -> CNA-01`
- `5 -> CNA-02`
- `6 -> CNA-03`

Despues de aplicar Fases 1 -> 4, abrir con Tester un Ticket estructuralmente perteneciente a `CNA-01` cuyo `tickets.zona` historico sea distinto.

En Network revisar:

`GET /api/tickets/<ticket>`

La respuesta debe contener, por ejemplo:

```json
{
  "data": {
    "zona": "CNA-01",
    "zona_oficial": "CNA-01",
    "zona_id_oficial": 4
  },
  "alcance": {
    "zona_ids": [4, 5, 6],
    "zonas": ["CNA-01", "CNA-02", "CNA-03"]
  }
}
```

Un Ticket fuera de esos cuartos debe seguir fallando cerrado por el Guard/record scope antes de devolver su informacion real.

## Limite de verificacion

La estructura y sintaxis se validan localmente con mocks. **No puedo confirmar el comportamiento runtime contra Aiven/Azure** hasta aplicar el ZIP y ejecutar la consulta autenticada en el entorno desplegado/local.
