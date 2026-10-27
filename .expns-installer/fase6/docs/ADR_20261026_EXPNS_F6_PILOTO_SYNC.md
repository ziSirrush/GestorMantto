# ADR · Piloto aislado de actualización en vivo Experimental NS

**Fecha:** 26/10/2026 · **Estado:** Propuesto / prueba local · **Módulo:** Experimental NS Fase 6

## Contexto

El usuario desea ver cambios externos de NetSuite y de otros operadores sin F5, sin cerrar detalles y sin perder texto sin guardar. El motor global `ManttoDataSync` existe pero no se modificará hasta medir un piloto.

## Decisión

Añadir un controlador independiente `ManttoExperimentalNsLive` para los tres módulos de prueba, con una lectura ligera autenticada de revisión cada 30 s, caché de memoria efímera por sesión/visor, refresco preventivo cada 120 s y aplicación selectiva sobre DOM existente, sin recargar la ruta.

## Límites / alternativas

- Se elige consulta periódica en lugar de SSE hasta tener receptor NS real, persistencia habilitada y métricas confiables de costo.
- No se incorporan tablas ni índices para el piloto; revisar costo de escaneos/alcance antes de decidir F8 o de ampliar a más usuarios.
- La revisión no garantiza notificaciones de cada evento, sino convergencia de estado con revalidación.
- No hay caché persistente, edición concurrente o autoguardado en F6; F7 cubrirá conflictos y borradores.
- Si el receptor NS continúa en HTTP 503, este piloto solo puede ensayarse con respuestas simuladas o modificaciones autorizadas en las tablas experimentales.

## Seguridad

Mismos Guards humanos por módulo, puerta EXPERIMENTAL_NS y alcance UNITED; versiones no contienen registros operativos. Sin acceso abierto a otros roles. Nunca consulta datos de producción.

## Reversión

Restaurar archivos modificados desde `BACKUP_EXPNS_F6_*`, retirar sólo los archivos nuevos y las dos líneas de montaje local del backend. Se mantiene intacto el Core.
