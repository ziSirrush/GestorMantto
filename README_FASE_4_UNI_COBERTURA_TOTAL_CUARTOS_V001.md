# FASE 4 — UNITED · Cobertura territorial por Cuartos V001

## Base y prerrequisitos

- Repo verificado: `JIVMBLT/updated_code`
- Rama base: `main`
- Commit base verificado: `f4e7b56b25d4c34e67ccd17aaceacbe8f0e5687b`
- Requiere aplicar previamente:
  1. `FASE_1_UNI_PUERTAS_CUARTOS_V001`
  2. `FASE_2_UNI_PORTAFOLIO_CUARTOS_V001`
  3. `FASE_3_UNI_TICKETS_CUARTOS_V001`

No modifica esquema SQL ni datos de Aiven.

## Regla aplicada

En UNITED:

- **Puertas**: Panel de Control > Alcance.
- **Cuartos**: Panel de Control > Usuarios > Zonas Op.
- `usuario_zop` es la relación efectiva usuario ↔ Zona Operativa.
- `z_op` es el catálogo referencial.
- La llave maestra UNITED abre puertas, pero **no elimina el filtro de cuartos**.
- Toda consulta humana debe cerrar por defecto si el usuario no tiene cuartos asignados.
- Los filtros solicitados por el frontend solo pueden reducir el universo autorizado; nunca ampliarlo.
- Los endpoints M2M permanecen fuera del alcance humano.

## Problemas verificados que corrige esta fase

### Operación / Resumen del Día

El frontend de Resumen del Día consume las fuentes de Tickets, Portafolio y Equipos Críticos. Fases 2 y 3 ya cerraron Tickets/Portafolio; faltaba que `criticos.service.js` aplicara el mismo alcance territorial a Equipos Críticos, Proyectos Críticos, MTBC, Call Center U365 y criticidad corporativa.

### Dashboard Operativo

`getSupervisoresActivosPorZona()` filtraba con IDs de personas visibles, una regla CORELLIAN que no corresponde a UNITED. Ahora el catálogo de supervisores se reduce por los `id_zona` permitidos al usuario.

### Proyectos

El Guard UNITED ya existía, pero los listados y catálogos de `/proyectos` consultaban Portafolio sin aplicar `zona_id`. Ahora usan el mismo alcance territorial que Portafolio.

### Experimental

Se corrigieron dos servicios que todavía podían consultar universos globales:

- Atención Prioritaria: tickets, catálogos y métricas de reincidencia.
- Entregas Recientes: universo de equipos y catálogos de Estado/Zona.

Los módulos Experimental que ya consumían el alcance o delegaban a los servicios centrales no se duplicaron.

### Cobranza UNITED

Los GET humanos de Gestión de Crédito, Venta Adicional y Mantenimiento Preventivo estaban protegidos solo por autenticación, sin Puerta COBRANZA ni Cuartos.

Ahora:

- `gestion_credito.z_oper` se filtra contra `zona_codigos` del usuario.
- `detalle_mp_2026.z_oper` se filtra contra `zona_codigos`.
- `pc.zona_operativa` se filtra contra `zona_codigos`.
- KPIs, catálogos, listados y detalles se calculan únicamente sobre filas autorizadas.
- Los bloques relacionados de un detalle se vuelven a filtrar de forma independiente por su propia columna de Zona Operativa.
- Los Sync continúan con `requireIntegrationAuthFor(...)` y no pasan por el Guard humano.

## Archivos modificados

- `backend/src/services/information-record-scope-gnral.service.js`
- `backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js`
- `backend/src/modules/criticos/criticos.service.js`
- `backend/src/modules/proyectos/proyectos.controller.js`
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js`
- `backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js`
- `backend/src/routes/cobranza-uni.routes.js`
- `backend/src/routes/detalle-mp-2026.routes.js`

## Archivos nuevos

- `backend/src/modules/proyectos/proyectos-cuartos_uni.service.js`
- `backend/src/controllers/cobranza-uni-cuartos.controller.js`
- `backend/src/controllers/detalle-mp-2026-cuartos.controller.js`
- `backend/scripts/test-fase-4-cobertura-total-uni.js`
- `ADR_FASE_4_UNI_COBERTURA_TOTAL_CUARTOS_V001.md`

## Validaciones realizadas

Se validó localmente sobre un overlay acumulado F1 + F2 + F3 + F4:

```text
ALCANCE_UNI_PUERTAS_CUARTOS_V001: OK
FASE_2_UNI_PORTAFOLIO_CUARTOS_V001: OK
FASE_3_UNI_TICKETS_CUARTOS_V001: OK
FASE_4_UNI_COBERTURA_TOTAL_CUARTOS_V001: OK
CRITICOS_ROOM_SQL: OK
COBRANZA_ROOM_SQL: OK
ALL_JS_SYNTAX_OK
```

También se verificó que:

- Llave maestra + CNA-01/CNA-02 sigue generando condiciones territoriales.
- Sin cuartos genera `1 = 0`.
- Criticidad incluye `portafolio.zona_id` en sus consultas.
- Cobranza usa exactamente `z_oper` / `zona_operativa` contra los códigos autorizados.
- Los endpoints Sync de Cobranza permanecen M2M.

## Validación runtime pendiente

**No puedo confirmar el comportamiento runtime contra Aiven** desde este entorno. Después de aplicar F1→F4 debe probarse con un usuario real limitado, por ejemplo, a `CNA-01`, `CNA-02`, `CNA-03` y comprobar que Resumen del Día, Operación, Portafolio, Experimental y Cobranza no devuelvan registros ni opciones de filtros de otras zonas.

## Matriz mínima recomendada de prueba

| Caso | Resultado esperado |
|---|---|
| Puerta cerrada + cuarto asignado | Sin acceso al módulo |
| Puerta abierta + sin cuartos | Sin registros (`fail closed`) |
| Puerta abierta + CNA-01/02/03 | Solo CNA-01/02/03 |
| `?zona=OCC-01` sin OCC-01 asignada | 0 registros; nunca amplía alcance |
| Llave maestra + CNA-01/02/03 | Todas las puertas UNITED, pero solo CNA-01/02/03 |
| Quitar CNA-02 en Usuarios | CNA-02 deja de ser visible en la siguiente solicitud |
| Sync M2M | Sin cambio de comportamiento |
