# ADR — Fase 6 · Alcances globales por empresa

**Estado:** Propuesto para pruebas  
**Fecha:** 2026-08-20  
**Proyecto:** Mantto Gestor

## Contexto

El alcance histórico compartía un mismo modelo de personas para UNITED y CORELLIAN. Esto ya no representa la regla de negocio aprobada:

- GENERAL es relacional/personal.
- CORELLIAN es organizacional por personas.
- UNITED es territorial por Zona Operativa.

Además, una vista de detalle puede mezclar información de módulos distintos y el acceso al padre no debe conceder acceso implícito a los hijos.

## Decisión

Se establecen tres motores independientes y un resolver por `perm_agrupaciones.empresa`.

### GENERAL

Motor por defecto. No persiste una configuración de alcance nueva. El registro se autoriza por relación directa: creado, asignado o relacionado con el usuario efectivo.

### CORELLIAN

Usa:

- usuario propio;
- `usuarios.reporta_a`;
- `usuarios_rel_admin`;
- usuarios adicionales explícitos.

### UNITED

Usa exclusivamente la relación territorial activa ya existente:

- `usuario_zop.usuario_id`;
- `usuario_zop.zona_id`;
- `usuario_zop.estado = 1`;
- `z_op.estado = 1`.

No se crea tabla de zonas de alcance adicional.

## Puertas y llaves maestras

CORELLIAN y UNITED conservan:

- `AGRUPACION` como puerta específica;
- `DOMINIO_COMPLETO` como llave maestra.

GENERAL tiene puerta por defecto.

Una llave maestra puede evitar el filtro normal de personas/zona, pero el permiso funcional sigue siendo obligatorio.

## Información cruzada

Cada bloque hijo valida de manera independiente:

1. permiso funcional;
2. puerta;
3. alcance del registro;
4. carga.

El bloque no autorizado debe excluirse del payload final. El acceso al padre nunca se hereda automáticamente al hijo.

## Chats

La autorización se aplica al hilo completo. Si el usuario tiene acceso al hilo, puede consultar todo el historial del mismo, incluyendo mensajes de participantes históricos. No se recortan mensajes antiguos cuando cambian los participantes.

## Compatibilidad

Los nombres públicos del middleware/guards existentes se mantienen para reducir cambios en módulos ya integrados. `information-record-scope-gnral.service.js` se convierte en puente hacia `alcance_cor` o `alcance_uni` según el contexto que resolvió el Guard.

Los endpoints actuales del Panel de Control se conservan y el backend mantiene temporalmente campos legacy de lectura.

## M2M

Queda explícitamente fuera de esta arquitectura humana. Sync/webhooks continúan con autenticación de integración.

## Consecuencias

### Positivas

- Un usuario puede tener CORELLIAN y UNITED simultáneamente.
- UNITED deja de depender del supervisor como criterio global de visibilidad.
- CORELLIAN conserva el modelo de personas.
- GENERAL queda simple y predeterminado.
- Las llaves maestras siguen siendo compatibles.
- Se reutilizan tablas existentes.

### Riesgos controlados

- Los handlers legacy que mezclan consultas dentro de una sola función no quedan mágicamente convertidos por el resolver central. Deben migrarse de forma incremental al contrato de información cruzada.
- El Panel de Alcance comparte `usuario_zop` con la asignación operacional de zonas; esto es deliberado para mantener una única fuente de verdad.

## Alternativas descartadas

- Crear una tabla nueva de alcance United por zona: descartado porque duplicaría `usuario_zop`.
- Mantener un único motor por personas para las tres empresas: descartado porque no representa UNITED.
- Refactorización masiva de todos los módulos en una sola entrega: descartada por riesgo y por la Constitución del proyecto.
