# FASE 2/11 — OPERACIÓN · Dashboard Operativo · Cuartos V001

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama revisada: `main`
- Commit base: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 3`
- Esta fase está pensada para aplicarse después de **Fase 1/11 — Operación · Resumen del Día**, aunque no depende del endpoint de Resumen del Día.

## Problema confirmado

El Dashboard Operativo todavía iniciaba cargando por separado:

- `/api/portafolio`
- `/api/tickets`
- `/api/usuarios/supervisores-mantenimiento`
- `/api/indicadores/mtbc/equipos`
- `/api/equipos-criticos`

Además, el frontend tomaba la zona visual desde campos históricos de texto (`portafolio.zona_operativa` y `tickets.zona`).

Las pruebas en Workbench suministradas para **Tester / id 81** confirmaron:

- Cuartos autorizados en `usuario_zop`: `4 / CNA-01`, `5 / CNA-02`, `6 / CNA-03`.
- Existen registros donde `portafolio.zona_id = 4 -> z_op.zona = CNA-01`, pero `portafolio.zona_operativa` contiene otra zona.
- Existen tickets asociados estructuralmente a equipos de `CNA-01`, pero `tickets.zona` contiene otra zona.

Por tanto, para este módulo la autoridad territorial queda:

`usuario_zop.zona_id -> portafolio.zona_id -> z_op.zona`

Los campos históricos de texto no conceden acceso y tampoco se usan como etiqueta territorial canónica en la carga inicial del Dashboard.

## Cambios

### 1. Primera llamada territorial dedicada

Se agrega:

`GET /api/operacion/dashboard-operativo/inicial?mes=YYYY-MM`

La ruta exige:

- autenticación;
- permiso funcional de lectura de Dashboard Operativo;
- dominio `UNITED`;
- puerta `OPERACION`;
- cuartos activos del usuario mediante el alcance UNITED.

No existe fallback desde esta carga inicial hacia los endpoints genéricos de Portafolio, Tickets o Supervisores.

### 2. Portafolio

La primera respuesta obtiene exclusivamente registros permitidos por `portafolio.zona_id` y hace `JOIN z_op`.

Se devuelve `zona_oficial = z_op.zona` y, dentro de esta respuesta dedicada, `zona` / `zona_operativa` se canonizan con esa zona oficial.

### 3. Tickets

Los tickets se limitan con el motor territorial UNITED ya existente (`buildTicketScopeSql_gnral`).

Para mostrar la zona se resuelve:

- con equipo: `tickets.codigo_equipo -> portafolio.numero_equipo -> portafolio.zona_id -> z_op.zona`;
- sin equipo: conserva el fallback territorial por proyecto del motor actual, que falla cerrado cuando el proyecto no resuelve de forma territorialmente válida.

`tickets.zona` no determina la zona mostrada en esta carga.

### 4. Supervisores

La lista inicial de Supervisores de Mantenimiento se limita a zonas que también estén dentro de los cuartos autorizados del usuario actual.

### 5. Preventivos por Supervisor / Zona

Se corrige la agregación existente para que la zona se obtenga mediante:

`servicios_preventivos -> portafolio.numero_equipo -> portafolio.zona_id -> z_op`

Ya no agrupa por `TRIM(portafolio.zona_operativa)`.

El mes inicial viene dentro de la primera respuesta. Al cambiar manualmente de mes, el endpoint existente `/api/servicios-preventivos/resumen-supervisor` continúa utilizándose y mantiene su Guard UNITED.

### 6. Frontend

`modules/dashboard-operativo/dashboard-operativo.js`:

- la primera carga visible espera primero `/api/operacion/dashboard-operativo/inicial`;
- no llama en `loadData()` a Portafolio/Tickets/Supervisores genéricos;
- prioriza `zona_oficial`;
- el selector de Zona nace exclusivamente del Portafolio ya filtrado y canonizado;
- si la llamada territorial inicial falla, el módulo queda vacío/error: no intenta recuperar datos globales.

MTBC y criticidad quedan como enriquecimientos secundarios. No construyen el universo territorial ni el catálogo de zonas del módulo y sus rutas actuales ya están detrás del Guard de Operación.

## Archivos modificados

- `modules/dashboard-operativo/dashboard-operativo.js`
- `backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js`
- `backend/src/modules/dashboard-operativo/dashboard-operativo.service.js`
- `backend/src/modules/dashboard-operativo/dashboard-operativo.controller.js`
- `backend/src/modules/dashboard-operativo/dashboard-operativo.routes.js`

## Archivo de validación agregado

- `backend/scripts/test-fase-2-operacion-dashboard-operativo.js`

## Validaciones ejecutadas

- `node --check` sobre todos los `.js` incluidos: OK.
- Prueba estática de invariantes de Fase 2: OK.
- Confirmado que `loadData()` ya no contiene llamadas a:
  - `/api/portafolio`
  - `/api/tickets`
  - `/api/usuarios/supervisores-mantenimiento`
- Confirmado que Preventivos usa `portafolio.zona_id -> z_op` y no `portafolio.zona_operativa` para agrupar territorialmente.

Resultado del test:

`FASE_2_11_OPERACION_DASHBOARD_OPERATIVO_CUARTOS_V001: OK`

## Prueba runtime recomendada — Tester 81

1. Aplicar Fase 1/11 y después esta Fase 2/11.
2. Reiniciar backend / desplegar la versión correspondiente.
3. Entrar como Tester (`id 81`).
4. Abrir **Operación -> Dashboard Operativo**.
5. En Network, la primera llamada de datos del módulo debe ser:
   `GET /api/operacion/dashboard-operativo/inicial?mes=2026-08`
   (o el mes actual cuando se pruebe).
6. En la respuesta, `alcance.zona_ids` debe contener `[4,5,6]` y `alcance.zonas` debe contener `CNA-01`, `CNA-02`, `CNA-03` mientras esas asignaciones sigan activas.
7. Ningún registro retornado debe presentar como zona oficial una zona fuera de los cuartos autorizados.
8. El filtro Zona debe construirse únicamente con las zonas oficiales presentes en la respuesta. En las consultas Workbench realizadas durante esta revisión, los registros efectivos encontrados para Tester estaban en `CNA-01`; ese resultado puede cambiar si Aiven cambia después.

## Límite de verificación

La estructura, sintaxis y reglas de filtrado de esta entrega fueron verificadas estáticamente. **No puedo confirmar el comportamiento runtime contra Aiven/Azure** hasta aplicar el ZIP y ejecutar la prueba autenticada con Tester.
