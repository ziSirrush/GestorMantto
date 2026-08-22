# FASE 1/11 — OPERACION · Resumen del Dia · Cuartos UNITED V001

## Base revisada

- Repositorio: `JIVMBLT/updated_code`
- Rama base: `main`
- Commit base revisado: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 3`

Esta entrega es incremental y solo modifica/agrega archivos relacionados con **Operacion > Resumen del Dia**.
No modifica tablas ni ejecuta SQL de estructura.

## Regla territorial aplicada

La zona oficial del modulo se resuelve exclusivamente por estructura:

`usuario_zop -> z_op.id_zona -> portafolio.zona_id -> z_op.zona`

Para Tickets:

`tickets.codigo_equipo -> portafolio.numero_equipo -> portafolio.zona_id -> z_op.zona`

Los campos historicos `portafolio.zona_operativa` y `tickets.zona` NO gobiernan seguridad ni la zona mostrada por esta carga.

## Evidencia obtenida en Workbench con Tester

Pruebas proporcionadas por el usuario sobre Aiven:

- Usuario: Tester / BTST
- `id_SB = 81`
- `usuario_zop` activo:
  - `4 -> CNA-01`
  - `5 -> CNA-02`
  - `6 -> CNA-03`
- Portafolio autorizado encontrado en la prueba: `CNA-01 -> 568 equipos`.
- Tickets relacionados por equipo con Portafolio autorizado: `CNA-01 -> 2913 tickets`.
- Se comprobaron inconsistencias de etiquetas historicas:
  - filas `portafolio.zona_id = 4` (`CNA-01`) con `zona_operativa` como `CNA-04`, `CNB-03`, etc.;
  - Tickets relacionados con esos equipos con `tickets.zona` como `CNB-03`, `CNA-03`, `CNB-01`, etc.

Por ello, la visibilidad y la etiqueta territorial se basan en `zona_id -> z_op`.

## Cambio de carga inicial

Antes el frontend cargaba por separado:

- `/api/tickets?limit=5000`
- `/api/portafolio?limit=5000`

Ahora la primera llamada de datos del modulo es:

`GET /api/operacion/resumen-dia/inicial`

Esta ruta exige:

1. sesion valida;
2. permiso funcional real de lectura de Resumen del Dia;
3. dominio `UNITED`;
4. puerta `OPERACION`;
5. cuartos activos resueltos desde `usuario_zop`.

Si no existen cuartos validos, la capa de servicio falla cerrado y no consulta registros del modulo.

## Respuesta

La carga inicial devuelve un unico universo territorial:

```json
{
  "ok": true,
  "source": "aiven",
  "data": {
    "tickets": [],
    "portafolio": []
  },
  "alcance": {
    "zona_ids": [],
    "zonas": []
  },
  "total": {
    "tickets": 0,
    "portafolio": 0
  }
}
```

Para evitar que los datos historicos contradigan el alcance:

- `tickets[].zona` se canoniza con `zona_oficial`;
- `portafolio[].zona` se canoniza con `zona_oficial`;
- `portafolio[].zona_operativa` se canoniza con `zona_oficial`;
- `zona_oficial` siempre proviene de `z_op` mediante la relacion estructural.

## Tickets sin codigo_equipo

No se usa `tickets.zona` como fallback de seguridad.
Se conserva la regla territorial existente de Fase 3: proyecto/proyecto_padre solo pueden autorizar el Ticket cuando Portafolio resuelve el contexto territorial de forma inequivoca y fail-closed.

## Archivos

Modificados:

- `backend/src/routes/data.routes.js`
- `modules/resumen-dia/resumen-dia.js`

Nuevos:

- `backend/src/routes/data/resumen-dia.routes.js`
- `backend/src/modules/resumen-dia/resumen-dia.controller.js`
- `backend/src/modules/resumen-dia/resumen-dia.service.js`
- `backend/src/modules/resumen-dia/resumen-dia.repository.js`
- `backend/scripts/test-fase-1-operacion-resumen-dia.js`

## Validaciones realizadas

- `node --check` para todos los `.js` incluidos: OK.
- Prueba estatica `test-fase-1-operacion-resumen-dia.js`: OK.
- Confirmado que el frontend de Resumen del Dia ya no contiene las cargas iniciales genericas `/api/tickets?limit=5000` ni `/api/portafolio?limit=5000`.
- Confirmado que la nueva ruta esta montada en `data.routes.js`.
- Confirmado que backend usa `buildPortafolioScopeSql_gnral()` y `buildTicketScopeSql_gnral()`.
- Confirmado que la respuesta reemplaza las etiquetas historicas de zona por la zona oficial de `z_op`.

## Prueba runtime recomendada

Entrar con Tester `id_SB=81` y abrir **Operacion > Resumen del Dia**.

En Network, la primera llamada de datos del modulo debe ser:

`GET /api/operacion/resumen-dia/inicial`

La respuesta debe reportar:

```json
"alcance": {
  "zona_ids": [4, 5, 6],
  "zonas": ["CNA-01", "CNA-02", "CNA-03"]
}
```

Con los resultados de Workbench proporcionados antes de esta entrega, actualmente se espera que los registros efectivos devueltos aparezcan como `CNA-01`, ya que fue la zona con registros estructurales encontrados en las consultas de prueba.

La grafica de Zona, Top Equipos, Top Proyectos, detalle y cualquier texto de Zona generado a partir de esta carga deben usar la zona oficial, no `tickets.zona` ni el valor historico de `portafolio.zona_operativa`.

## Limite de validacion

No puedo confirmar el comportamiento runtime contra Aiven/Azure hasta aplicar esta entrega y ejecutar la llamada autenticada desde el despliegue/local del proyecto.
