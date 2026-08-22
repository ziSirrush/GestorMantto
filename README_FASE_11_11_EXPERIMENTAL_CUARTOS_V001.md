# FASE 11/11 — Experimental · Cuartos UNITED

## Objetivo
Cerrar el alcance territorial de la agrupación Experimental usando como autoridad única:

`usuario_zop -> z_op.id_zona -> portafolio.zona_id -> z_op.zona`

Los campos de texto legacy `tickets.zona` y `portafolio.zona_operativa` no conceden acceso ni gobiernan la zona mostrada.

## Base revisada
- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `83c87b4787a41a569940cc8d8108a55a583f26a1`
- Esta entrega es incremental y presupone Fases 1–10 aplicadas en orden.

## Vistas cubiertas por la agrupación Experimental
1. Atención Prioritaria.
2. Resumen del Día Experimental.
3. Entregas Recientes.
4. Equipos Críticos Experimental.
5. Dashboard Call Center Experimental.
6. Proyectos Críticos Experimental.

`Equipos Críticos Experimental` y `Proyectos Críticos Experimental` reutilizan el servicio general de críticos. No se duplicó ese código: heredan la corrección territorial de Fase 5.

## Archivos modificados
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js`
- `backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js`
- `backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js`
- `backend/src/modules/experimental-dashboard-call-center/experimental-dashboard-call-center.service.js`

## Archivo nuevo
- `backend/src/services/alcance/united-canonical-zone.service.js`

## Cambios principales
- Los endpoints siguen usando sus Guards existentes `UNITED + EXPERIMENTAL + permiso funcional exacto`.
- Los builders de alcance existentes siguen filtrando registros antes de responder.
- La zona visible de Tickets se deriva de la relación estructurada con Portafolio.
- Para Tickets sin código, la zona se resuelve solo si `proyecto/proyecto_padre` determina una única `zona_id`; de lo contrario queda sin resolución.
- Entregas Recientes filtra y muestra la zona desde `portafolio.zona_id -> z_op`.
- Los filtros de zona se construyen con las zonas autorizadas del alcance (`zona_codigos`), no con campos legacy.
- Se conservan `zona_legacy` y, cuando aplica, `zona_id_oficial` únicamente para trazabilidad.
- No se crean tablas y no se modifica estructura SQL.
- No se modifica frontend porque las vistas Experimental ya consumen endpoints dedicados y continúan recibiendo la propiedad `zona` con el mismo contrato, ahora canonizada.

## Validaciones locales incluidas
- `node --check` sobre todos los JS de la entrega.
- prueba estática de seguridad/contrato.
- prueba unitaria del generador SQL de zona canónica.
- SQL de contraste para Tester 81.

## Orden de aplicación
Aplicar después de `FASE_10_11_COBRANZA_UNI_CUARTOS_V001`.

## Límite de validación
No se validó contra Aiven/Azure en runtime desde este entorno. Ejecutar `PRUEBA_WORKBENCH_FASE_11_TESTER.sql` y luego probar las seis vistas con Tester.
