# FASE 1 · EQUIPO SALE DE CRÍTICO · NOTIFICACIONES V001

## Objetivo
Agregar una Notificación General cuando un cambio sincronizado de Tickets provoque que un equipo pase de crítico a no crítico bajo la regla vigente:

`>= 3 fallas BLT en U35` → `< 3 fallas BLT en U35`.

Esta fase NO cubre la salida causada únicamente por el transcurso de los 35 días. Eso corresponde a Fase 2.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299`
- Mensaje: `Version 092826.3`

## Evento nuevo
`EQUIPO_SALE_DE_CRITICO`

Catálogo propuesto:
- Agrupación: `Operacion`
- Módulo: `Equipos Criticos`
- Acción: `SALIDA_CRITICO`
- Prioridad default: `ALTA`
- Configurable: sí
- Campana default: sí
- Push default: sí
- Destino: `ABRIR_TICKET`
- Icono: `✅`

El SQL NO crea relaciones en `notificacion_evento_roles`. Los destinatarios deben configurarse desde Panel de Control > Notificaciones.

## Lógica implementada
Después de un sync exitoso de Tickets:

1. se conserva el conteo crítico previo de los equipos afectados;
2. se recalcula el conteo con los datos ya sincronizados;
3. se compara por equipo;
4. únicamente `antes >= 3` y `después < 3` genera `EQUIPO_SALE_DE_CRITICO`;
5. se identifica el Ticket del lote que retiró una falla del conjunto BLT U35;
6. la ZOP se resuelve con el equipo que salió de crítico;
7. el evento pasa por la matriz normal Evento -> Rol del motor central;
8. el Ticket disparador queda como ganador nativo para evitar una notificación inferior duplicada por la misma mutación.

## Casos cubiertos
- Responsabilidad BLT → otra responsabilidad.
- Ticket movido de un equipo a otro.
- Fecha de reporte modificada de forma que la falla salga de U35.
- Varias modificaciones dentro del mismo lote, evaluando el resultado neto por equipo.

## Casos que NO deben notificar
- 4 → 3.
- 3 → 3.
- 2 → 1.
- Cambio que no retire una falla BLT U35.
- Salida provocada solo porque pasó un día y una falla venció U35 sin sync; corresponde a Fase 2.

## Archivos modificados
- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`

## Archivos nuevos
- `sql/PRECHECK_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`
- `sql/APLICAR_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`
- `sql/VALIDAR_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`
- `sql/ROLLBACK_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`
- `validation/equipo-sale-critico-fase1.test.js`
- `docs/ADR_20260929_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.md`
- `docs/README_FASE_1_EQUIPO_SALE_DE_CRITICO_NOTIFICACIONES_V001.md`
- `docs/MANIFEST_FASE_1_EQUIPO_SALE_DE_CRITICO_NOTIFICACIONES_V001.txt`
- `docs/CHECKSUMS_FASE_1_EQUIPO_SALE_DE_CRITICO_NOTIFICACIONES_V001_SHA256.txt`

## Orden recomendado de aplicación
1. Ejecutar `PRECHECK_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql` en Aiven y revisar resultados.
2. Copiar el archivo backend conservando exactamente su ruta.
3. Ejecutar `APLICAR_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`.
4. Reiniciar/desplegar backend.
5. En Panel de Control > Notificaciones, configurar los Roles Principales autorizados para `EQUIPO_SALE_DE_CRITICO` y su política `OBLIGATORIA` u `OPCIONAL`.
6. Ejecutar `VALIDAR_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql`.
7. Ejecutar la prueba funcional con un equipo que tenga exactamente 3 fallas BLT U35 y modificar mediante el flujo real uno de sus Tickets para que deje de contar.

## Resultado funcional esperado de prueba 3 → 2
Debe generarse una sola interacción `EQUIPO_SALE_DE_CRITICO` para el equipo y el motor debe resolver destinatarios según:

- Evento -> Rol Principal;
- política obligatoria/opcional;
- ZOP del equipo que dejó de ser crítico;
- preferencias del usuario cuando correspondan;
- exclusión/deduplicación vigentes del motor central.

Título emitido:

`Equipo dejó de ser crítico`

Mensaje emitido:

`Se generó salida de condición crítica · <Proyecto - Referencia>. Actualmente registra 2 fallas BLT en los últimos 35 días.`

## Rollback
`ROLLBACK_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql` desactiva el evento y sus relaciones activas. No borra historial.

Después del rollback debe restaurarse el archivo backend anterior a esta fase.

## Validaciones realizadas al generar el paquete
- `node --check` del servicio modificado: PASS.
- `node --check` de la prueba: PASS.
- Prueba dirigida `validation/equipo-sale-critico-fase1.test.js`: 14/14 PASS.
- Verificación de reglas 3→2, 4→3, 2→1: PASS.
- Verificación de cambio de equipo y uso de la ZOP anterior: PASS.
- Verificación de que SQL no inserta `notificacion_evento_roles`: PASS.

## No ejecutado
- No se ejecutaron los SQL contra Aiven.
- No se ejecutó prueba funcional contra datos reales.
- No se desplegó backend.
- No se hizo prueba Push real.
- No se hizo E2E de navegador.

Por tanto, esta entrega está **validada estáticamente y mediante prueba local dirigida**, no validada todavía en Aiven/producción.
