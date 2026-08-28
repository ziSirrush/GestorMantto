# FASE 10/11 - Cobranza UNITED - Cuartos V001

## Objetivo
Eliminar `z_oper` / `zona_operativa` como autoridad de seguridad para las consultas humanas de Cobranza UNITED.

## Autoridad territorial
La autorizacion se deriva de:

`usuario_zop -> zona_id -> portafolio.zona_id -> proyecto de Cobranza`

Los campos `gestion_credito.z_oper`, `detalle_mp_2026.z_oper` y `pc.zona_operativa` quedan como valores legacy/importados; no conceden acceso.

## Regla para importes a nivel proyecto
Un registro financiero se entrega solo si el proyecto tiene equipos activos en Portafolio y **todas** las zonas activas del proyecto estan dentro de los cuartos asignados al usuario. Si falta zona, el proyecto no existe en Portafolio o existe una zona fuera del alcance, la consulta falla cerrada para ese registro.

Esto evita mostrar el importe completo de un proyecto multi-zona a un usuario que solo controla una parte del proyecto.

## Zona mostrada
La zona visible se reconstruye con `portafolio.zona_id -> z_op.zona`. El valor importado se conserva como `z_oper_legacy` o `zona_operativa_legacy`.

## Endpoints humanos cubiertos
- `GET /api/cobranza-uni/gestion-credito`
- `GET /api/cobranza-uni/gestion-credito/:id/detalle`
- `GET /api/cobranza-uni/venta-adicional`
- `GET /api/cobranza-uni/venta-adicional/:id/detalle`
- `GET /api/cobranza-uni/detalle-mp-2026`
- `GET /api/cobranza-uni/detalle-mp-2026/:id`

Los endpoints M2M de sync conservan autenticacion de integracion y no pasan por alcance humano.

## Archivos
- NUEVO `backend/src/services/cobranza-uni-scope.service.js`
- NUEVO `backend/src/controllers/cobranza-uni-cuartos-v2.controller.js`
- NUEVO `backend/src/controllers/detalle-mp-2026-cuartos-v2.controller.js`
- MODIFICADO `backend/src/routes/cobranza-uni.routes.js`
- MODIFICADO `backend/src/routes/detalle-mp-2026.routes.js`
- NUEVO `PRUEBA_WORKBENCH_FASE_10_TESTER.sql`

## No se modifica
- Estructura de BD.
- Sincronizadores M2M.
- Cobranza Corellian.
- Operacion, Portafolio o Experimental.
- Frontend: conserva los contratos actuales de los endpoints.

## Base revisada
`JIVMBLT/updated_code` - `main` - commit `83c87b4787a41a569940cc8d8108a55a583f26a1`.

## Validacion requerida en vivo
Ejecutar `PRUEBA_WORKBENCH_FASE_10_TESTER.sql` con Aiven actual y despues validar con Tester 81. Esta entrega no afirma que el dataset vivo este libre de proyectos no mapeados o multi-zona.
