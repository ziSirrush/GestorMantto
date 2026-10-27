# ADR — F9A NetSuite → Aiven, recepción atómica de Portafolio

**Fecha:** 27/10/2026. **Estado:** Preparado para QA; no desplegado. **Base:** GitHub `ziSirrush/GestorMantto` `main` `daab977fdb21f05c31dcc01bef486983941dbb6f`.

## Decisión

Conservar el contrato NetSuite V001 de 3 rutas y HMAC obligatorio. Implementar almacenamiento únicamente para el dataset exacto `PORTAFOLIO` y la tabla existente `ns_portafolio_pruebas`. Rechazar expresamente cualquier otro dataset, incluidos Tickets. No crear tablas, columnas, índices ni archivos SQL.

El receptor verifica que la estructura de Aiven sea InnoDB y disponga de clave primaria autoincremental, `UNIQUE(numero_equipo)`, las 53 columnas de correspondencia, `zona_id`, y `estado_registro` con DEFAULT 1. Las columnas permitidas se derivan de la correspondencia de 53 campos documentada en `REPORTE_PRUEBA_NS_PORTAFOLIO_V001.md`, sustentada exclusivamente en el snapshot del 07/10/2026. **No se ha confirmado que el esquema en vivo sea idéntico.** Si difiere, no se permite escribir.

## Integridad

- Se aceptan **como máximo 10,000 filas** por lote y **24 MiB** de JSON de páginas en memoria. El contrato de páginas permanece en 300 filas.
- Una única carga en progreso por instancia; lotes solapados retornan 429. Las llamadas repetidas de `/lotes` y páginas idénticas son idempotentes en memoria. Se verifican posiciones, anchos de fila, hashes SHA-256 de página y del manifiesto, cantidad total y unicidad de `numero_equipo` entre todas las páginas.
- Las páginas no escriben en la BD: se retienen temporalmente, por hasta 40 minutos de inactividad. Al recibir `/finalizar` y comprobar todas las páginas, se inicia **una sola transacción InnoDB** y se ejecutan UPSERT en fragmentos de hasta 50 filas. La confirmación `PUBLICADO` se devuelve **únicamente tras `COMMIT` exitoso**. Fallos producen `ROLLBACK`.
- `NULL` y textos vacíos entrantes no borran datos existentes; no se borran equipos ausentes de la búsqueda. No se escriben `id_portafolio`, `zona_id`, `estado_registro`, `created_at`, `updated_at`, `created_by`, `updated_by` ni columnas exclusivas de otras integraciones.
- `inactivo` se normaliza a `0`/`1`, fechas a `DD/MM/AAAA` usando la configuración explícita de locale de NetSuite. Se bloquea la contradicción «En Servicio» / `inactivo=1`.
- La búsqueda debe entregar las 53 columnas con nombres y joins previstos y ordenar de forma única por `formulatext` (clave `numero_equipo`). Para campos tipo SELECT el emisor V002 usa `getText`; si el texto no puede resolverse, falla cerrado.

## Contención y recuperación

`NS_PORTAFOLIO_WRITE_ENABLED` queda desactivada por defecto, junto al flag de envío de NetSuite. El receptor hereda límites de conexiones/cola y telemetría del pool oficial del backend. No se exponen credenciales a la web.

La memoria de staging **no es compartida entre instancias**. Si Azure usa más de una instancia y distribuye las peticiones, la carga puede fracasar sin afectar Aiven: exige garantizar una sola instancia durante F9A. Reinicios antes del COMMIT pierden staging sin publicar; si un COMMIT finaliza y se pierde su respuesta, reemitir el lote completo es seguro por UPSERT idempotente, pero **no** constituye garantía distribuida de exactamente una vez.

No hay botón central de emergencia en el Panel ni cancelación inmediata de una transacción en curso. La detención operativa consiste en desactivar los flags en NetSuite y Azure; el cambio de App Settings puede reiniciar Azure. Si se exige control de pausa distribuida, admitir más de 10,000 registros, conservar manifiestos entre reinicios o balanceo multi-instancia, **se debe proponer una fase distinta con estado durable en Aiven, su DDL explícito y autorización previa** (Constitución §§7–9).

## Pruebas y limitaciones

Los 29 tests aprobados son simulados: incluyen HMAC, contrato V001, staging, duplicados, idempotencia, UPSERT seguro, transacción, rollback, volúmenes de 3714 filas, y emisor sin envío cuando está deshabilitado. No hubo ejecución real en Azure/Aiven/NetSuite. El material del 07/10 es referencia, **no** prueba de schema vigente.

Se conservaron intactos Core, módulos productivos y receptor de Tickets; no se agrega front-end ni un nuevo catálogo de permisos.
