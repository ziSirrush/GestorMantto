# ADR propuesto: reconciliación de ajustadores desde sync ins_fl (INT9 F3)

**Fecha:** 27/10/2026. **Estado:** propuesto, pendiente de revisión antes de despliegue. **Constitución:** v2.0.

## Contexto

El catálogo de ajustadores y las asignaciones ya existen en `instalaciones_personal` e
`instalaciones_programacion_asignaciones`. F1 identifica a las personas de `ins_fl.ajustador`;
F2 permite el alta mediante un POST humano protegido. El sync de `ins_fl` llega por una
integración M2M independiente; sus cambios todavía no sincronizan las asignaciones.

## Decisión propuesta

1. Reutilizar el origen firmado **INTEGRATION_INS_FL_ID** de `/api/ins-fl/sync` como identidad
   técnica *únicamente cuando `req.integrationAuth` confirma la validación de firma y el ID
   esperado*. No conceder permisos humanos ni simular el ID de un usuario.
2. Mantener la escritura original de `ins_fl` con su transacción y bloqueo. Al concluir,
   liberar el candado de Altas y reconciliar solo los equipos con cambios pertinentes en
   `ajustador` o fechas de ajuste. Reconciliación posterior a COMMIT y por equipo.
3. Para cambios de identidad inequívoca y fechas válidas: crear faltantes y retirar
   **lógicamente** solo asignaciones de origen automático, sin fechas ni notas editadas.
   Nunca tocar asignaciones manuales. Fechas de auto siguen NULL, heredadas de `ins_fl`.
4. Confirmar permisos humanos `VER + CREAR + DESACTIVAR`, puerta CORELLIAN y alcance
   por registro en el nuevo POST individual de reintento. El proceso M2M no expone
   los proyectos de equipos de otros alcances.
5. Ante homónimos, fechas inválidas, cambios concurrentes, duplicados o traslapes:
   no escribir y reportar revisión. Si falla reconciliación después del COMMIT,
   **no** afirmar que el sync `ins_fl` fue revertido.
6. Restringir carga mediante consultas incrementales por clave y lotes acotados.
   Superar el límite deja pendientes explícitos, no genera escrituras automáticas ocultas.

## Riesgo previo identificado

El guard existente `requireIntegrationAuthFor('INTEGRATION_INS_FL_ID')` depende de
`INTEGRATION_AUTH_ENABLED`. Cuando el flag está desactivado, el sync heredado puede
continuar sin firma. Esta F3 **no** agrega derechos de escritura de programación en
ese contexto: se conserva el sync previo, pero se omite reconciliación automática.
No se cambia unilateralmente el contrato de recepción de GAS. Validar el uso de M2M
firmado antes de autorizar despliegue. No se puede confirmar la configuración de Azure.

## Consecuencias / límites

- No se crean tablas, columnas ni índices. `created_by/updated_by` son NULL en
  operaciones técnicas: verificar en Aiven de laboratorio que la FK y nulabilidad
  permiten registrar este origen sin usuario ficticio.
- No se retiran automáticamente asignaciones cuando la referencia está vacía,
  ambigua o con fechas inválidas. Se deja para revisión para evitar pérdida de datos.
- Reintento por equipo desde la ruta POST humana; backfill masivo y UI se deciden en F4.
- La conciliación posterior al COMMIT no forma parte de la misma transacción de
  `ins_fl`. Los errores se exponen como estado parcial para reintento autorizado.
- Pendientes QA: HMAC/config real, SQL MySQL en laboratorio, concurrencia E2E,
  desempeño Aiven y validación de lote máximo antes de habilitar producción.
