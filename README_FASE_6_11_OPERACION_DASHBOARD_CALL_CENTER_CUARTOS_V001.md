# FASE 6/11 - Operacion > Dashboard Call Center - Cuartos UNITED V001

## Base revisada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base verificado: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Aplicar despues de Fases 1, 2, 3, 4 y 5.

## Objetivo

La primera llamada de informacion de Dashboard Call Center debe llegar filtrada desde backend por los cuartos UNITED del usuario.

`sesion -> permiso funcional -> puerta OPERACION -> usuario_zop -> portafolio.zona_id -> z_op.zona -> respuesta`

`tickets.zona` y `portafolio.zona_operativa` no son autoridad territorial. La zona visible se canoniza desde `z_op.zona`.

## Cambios

- Nuevo `GET /api/operacion/dashboard-call-center/inicial` con Guard exacto `UNITED + OPERACION` y permisos `.VER` reales del modulo.
- Devuelve Tickets y Portafolio ya reducidos por cuartos, con `alcance.zona_ids` y `alcance.zonas`.
- Sin cuartos, responde vacio: fail closed.
- `modules/callcenter/callcenter.js` espera primero el endpoint inicial y elimina el fallback inicial a `/api/tickets` y `/api/portafolio/equipos`.
- MTBC por equipo/proyecto y U365 por equipo/proyecto exponen y filtran zona mediante `portafolio.zona_id -> z_op.zona`.
- Se conserva Fase 5 para Equipos Criticos, Proyectos Criticos y Criticidad Corporativa.

## Archivos

- `modules/callcenter/callcenter.js`
- `backend/src/routes/data.routes.js`
- `backend/src/routes/data/dashboard-callcenter.routes.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.routes.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.controller.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.service.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.repository.js`
- `backend/src/modules/criticos/criticos.controller.js`
- `backend/src/modules/criticos/callcenter-cuartos-operacion.service.js`
- `backend/scripts/test-fase-6-11-operacion-dashboard-call-center.js`
- `PRUEBA_WORKBENCH_FASE_6_TESTER.sql`

## Sin cambios de estructura

No hay `ALTER`, `CREATE` ni `DROP`. No se cambia `usuario_zop`, `z_op`, detalle de Ticket, comentarios, Vo.Bo. ni la regla de criticidad de Fase 5.

## Prueba con Tester 81

Al abrir Dashboard Call Center, la primera llamada de informacion del modulo debe ser:

`GET /api/operacion/dashboard-call-center/inicial`

En las pruebas Workbench previas de Tester se verificaron `zona_ids = 4,5,6`, correspondientes a `CNA-01,CNA-02,CNA-03`. Los registros efectivos encontrados estaban actualmente en `CNA-01`.

`data.tickets` y `data.portafolio` no deben mostrar zonas fuera de los cuartos autorizados. La carga base no debe llamar `/api/tickets` ni `/api/portafolio/equipos`.

## Validacion local

- `node --check` en JS nuevos/modificados.
- Test estatico Fase 6.
- Endpoint inicial antes de consultas secundarias.
- Sin fallback generico en la carga inicial.
- `z_op` como fuente de zona en MTBC/U365.
- Verificacion de integridad del ZIP.

No se realizo despliegue ni prueba runtime contra Aiven/Azure desde este paquete.
