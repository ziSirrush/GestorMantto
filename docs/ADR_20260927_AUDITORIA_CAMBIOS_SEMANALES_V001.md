# ADR — Auditoría semanal de cambios

**Estado:** Implementado el 28/09/2026.  
**Especificación:** `implementacion/ESPECIFICACION_AUDITORIA_CAMBIOS_SEMANALES_V001.md`.

## Decisión

La fuente de verdad es un archivo JSON por `change_id` en `audit/changes/`. Un parche edita el archivo vigente; el historial técnico anterior permanece en Git. El generador valida los registros y publica solo los de estado `published`, ordenados por fecha final y por identificador en caso de empate. No se crea una tabla en Aiven ni una ruta de backend.

El artefacto se genera durante el despliegue desde el mismo commit que el frontend. El generador actualiza las referencias de caché de `build-info.generated.js` y `change-audit.generated.js` con el SHA del despliegue. La interfaz asigna semanas y fechas en `America/Mexico_City`, filtra por empresa según el rol activo y no permite edición. El resumen cuenta cambios lógicos y módulos después de aplicar todos los filtros.

## Línea base

La interfaz muestra la fecha de activación mediante una tarjeta informativa. El directorio comienza sin registros `published` porque no hay evidencia completa para crear entradas históricas ni un commit final de esta implementación. Una vez integrada y validada en la versión publicada, se podrá crear su registro con el SHA final comprobado.

## Alcance y límite

El artefacto es un archivo estático descargable. El filtro de empresa controla la presentación en Panel de Control, pero no protege la descarga directa del archivo. Por ello los registros deben contener solo información apta para publicación y nunca secretos, tokens ni direcciones internas. Si se necesita confidencialidad por empresa, será necesaria una API con autorización en una decisión posterior.

## Verificación

Ejecutar desde la raíz:

```sh
node tools/generate-build-info.js
node tools/generate-change-audit.js
node --test tests/change-audit-generator.test.js
```

Las pruebas cubren consolidación, estados, duplicados, fechas, SHA, orden, texto no confiable, límite semanal y alcance de empresa.
