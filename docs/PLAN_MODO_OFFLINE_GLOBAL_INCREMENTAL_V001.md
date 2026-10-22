# Plan del modo offline global e incremental — V001

Fecha: 22 de octubre de 2026

Estado: planeación; no autoriza por sí mismo cambios de código, despliegues ni copias masivas.

## 1. Objetivo y contrato de producto

Cubrir **todos los módulos funcionales de BLT NOW** que manejan datos operativos, respetando los permisos, puertas de información y alcance de registros de sus guards oficiales. El dispositivo conservará una copia local del subconjunto autorizado de las bases de datos; no una réplica indiscriminada de tablas, credenciales, datos de otros usuarios o archivos binarios.

El comportamiento acordado es:

| Estado | Fuente de autoridad y comportamiento |
| --- | --- |
| Online | La app consulta el backend/Aiven para conocer el estado vigente. Si existe una copia local válida, solicita **solo altas, modificaciones y bajas desde su último cursor**, actualiza el dispositivo y presenta los datos confirmados por el servidor. Las consultas puntuales y operaciones que exijan respuesta inmediata siguen usando el backend, pero no deben volver a traer el universo completo. |
| Offline | La app no intenta leer Aiven: muestra únicamente la última copia local completa, autorizada y verificable. Indica fecha/hora de la última sincronización. No presenta datos antiguos como si fueran actuales. |
| Reconexión | Revalida identidad, permisos, guard y alcance; sincroniza pendientes autorizados y después descarga los cambios. Si el alcance cambió, elimina o reconstruye las particiones afectadas antes de mostrar datos. |

Ejemplo de aceptación: si el dispositivo ya contiene 50 000 tickets y 50 000 equipos y desde el cursor confirmado cambiaron 15 tickets y 2 equipos, la sincronización ordinaria debe transferir esos 17 registros más las bajas pertinentes, **no** 100 000 filas. La primera instalación, la recuperación de una copia corrupta o un cambio de alcance pueden requerir una descarga paginada más amplia.

La copia local es un mecanismo de rendimiento y continuidad. **Aiven sigue siendo la fuente de verdad.** No se aceptan datos locales no sincronizados como confirmación de una escritura del servidor.

## 2. Estado actual verificado en el repositorio

- `core/offline-storage.js` mantiene copias y operaciones pendientes en IndexedDB; `core/offline-scheduler.js` coordina respaldos mientras la PWA está abierta.
- `backend/src/modules/offline-pilot/offline-pilot.service.js` declara por ahora dos datasets exportables: `operacion-resumen-dia` e `instalaciones-proyectos`. `core/offline-navigation.js` certifica esas dos rutas para lectura offline. Esto **no equivale todavía a cobertura global**.
- `backend/src/modules/offline-pilot/offline-pilot.export.js` pagina por ID, pero el respaldo de tickets sigue seleccionando `t.*` y resolviendo zona mediante joins/subconsultas. El flujo actual usa manifiestos y páginas para construir una copia completa; no existe aún un contrato universal de cambios incrementales para todos los módulos.
- `modules/dashboard-operativo/dashboard-operativo.js` consulta online `/api/operacion/dashboard-operativo/inicial` con `cache: 'no-store'`. Ese endpoint puede devolver hasta 50 000 tickets y 50 000 equipos; guardar adicionalmente una copia local sin cambiar esta ruta **no reduciría** esa carga.
- El Service Worker no guarda respuestas autenticadas de API en Cache Storage. Los datos operativos pertenecen a IndexedDB, particionados y controlados por la aplicación.

Estas observaciones describen el código actual, no funcionalidades ya concluidas del plan.

## 3. Cobertura: todos los módulos, sin exportación de tablas arbitrarias

Antes de ampliar exportadores, crear un inventario trazable de **cada módulo navegable y cada endpoint que consume**. Para cada uno registrar: código y ruta del módulo, dominio/base de origen, guard y permiso funcional, alcance por registro, entidades compartidas, tamaño estimado, frecuencia de cambio, dependencias para vistas agregadas, archivos adjuntos y acciones de escritura. El resultado debe indicar el dataset autorizado, el adaptador de lectura offline y la política de sincronización del módulo.

La meta es que ningún módulo quede fuera por omisión. Los módulos que no puedan operar sin red por una dependencia externa o una acción de alto riesgo deben quedar explícitamente clasificados, con su comportamiento visible al usuario y una decisión aprobada; no se les debe marcar como «offline completo» solo por aparecer en el catálogo.

Los datos compartidos entre módulos se almacenarán una sola vez por identidad, dominio y alcance, con índices locales adecuados; las vistas reutilizan esa base. Las consultas agregadas (dashboards, conteos, filtros) se calculan sobre datos locales cuando sea correcto, o se consultan online mediante respuestas compactas. Evitar replicar para cada pantalla una tabla masiva de resultados derivados. Los adjuntos binarios requieren presupuesto y política propios; exportar metadatos no implica descargar todos los archivos.

## 4. Protocolo de sincronización incremental

### 4.1 Cursor y registro de cambios

Cada dataset/partición tiene un cursor opaco emitido por el servidor y asociado a identidad efectiva, versión de esquema y firma de alcance. **No usar solamente `MAX(id)`**: detecta altas, pero pierde ediciones de filas antiguas, eliminaciones y cambios de pertenencia territorial.

El backend necesita una secuencia de cambios monotónica y persistente por dataset, generada junto con la escritura autorizada (o un mecanismo equivalente que garantice el mismo resultado). Cada evento registra entidad, clave, operación `upsert`/`delete`, versión y la información necesaria para resolver el alcance. Las bajas se representan con *tombstones* retenidos el tiempo suficiente para que un dispositivo rezagado pueda alcanzarlas. Si el cursor caduca o hay una brecha en el historial, el servidor exige reconstruir esa partición.

Si una modificación de `portafolio`, un catálogo o una relación cambia la zona o el resultado derivado de un ticket, el feed también debe actualizar/invalidadar esa proyección. Un cambio de guard, permiso, asignación territorial o propietario debe retirar del dispositivo los registros que ya no son visibles; si no es posible calcular la baja individual con certeza, se invalida y reconstruye la partición completa antes de habilitarla offline.

### 4.2 Contrato de API propuesto

Para cada dataset certificado, ofrecer un inicio de copia y páginas de cambios con límites estrictos. El nombre final de las rutas se decidirá en implementación; el contrato lógico es:

```text
GET snapshot-manifest(dataset)
  -> firma_de_alcance, versión_de_esquema, cursor_base, límites

GET changes(dataset, cursor, limit)
  -> upserts[], deletes[], next_cursor, has_more,
     firma_de_alcance, versión_de_esquema
```

Toda llamada vuelve a pasar autenticación, permiso funcional, puerta y alcance de registros. El servidor consulta Aiven y filtra el delta antes de enviarlo; el cliente no decide por sí mismo qué filas puede ver. Un mismo cursor no se reutiliza entre usuarios, dominios, dispositivos con otra identidad efectiva ni firmas de alcance diferentes. La respuesta debe ser estable y paginada, con límites de filas y bytes; «sin cambios» debe ser barata y no hacer un `COUNT(*)` del universo en cada comprobación.

Para una copia inicial: fijar un cursor base coherente, descargar páginas acotadas, aplicar los cambios ocurridos durante esa descarga y publicar la partición local solo cuando esté completa y validada. Para un delta ordinario: aplicar `upserts` y `deletes` en una transacción local y avanzar el cursor **únicamente después del commit**. Reintentos y páginas duplicadas deben ser idempotentes.

### 4.3 Lectura por las pantallas

Cada módulo tendrá un adaptador de datos con el mismo contrato funcional en ambos estados:

1. Online: obtener confirmación/delta de Aiven y actualizar la copia; renderizar datos vigentes. Para consultas puntuales que no convenga replicar, usar un endpoint acotado. Una copia local mostrada mientras se espera la red debe rotularse como provisional, no como respuesta actual de Aiven.
2. Offline: consultar solo la copia verificada en IndexedDB. Filtros, búsqueda, paginación y cálculos se ejecutan localmente sobre índices adecuados. Si falta un dataset, mostrar una limitación clara; no simular una lista vacía.
3. Al recuperar conexión: revalidar autorización, resolver la cola de acciones y descargar deltas antes de declarar «actualizado» el módulo.

No basta con agregar un exportador si la pantalla online sigue llamando a un endpoint que trae decenas de miles de filas en cada apertura. En particular, el Dashboard Operativo debe dejar de depender de la respuesta inicial masiva para la ruta ordinaria con copia vigente.

## 5. Escrituras y conflictos

Las escrituras online siguen pasando por el backend y sus guards; tras el acuse, el dispositivo incorpora la versión confirmada o espera su evento del feed. Para acciones offline, solo los módulos/acciones certificados permiten una cola local. Cada acción lleva clave de idempotencia, identidad, firma de alcance y versión conocida del registro. Al reconectar, el backend revalida todo y devuelve acuse o conflicto; el cliente no sobrescribe silenciosamente cambios de otros usuarios.

La cola ya existente es una base, **no una autorización genérica** para escribir en todos los módulos. Cada tipo de acción debe declarar validación, dependencias, resolución de conflictos y pruebas propias. Las acciones no certificadas quedan deshabilitadas offline con explicación visible.

## 6. Seguridad, vigencia y almacenamiento

- Particionar IndexedDB por actor, usuario efectivo, dominio, dataset, firma de alcance y versión de esquema. Nunca mezclar datos de sesiones o del modo Visor.
- En cada sincronización online, revalidar guards en el servidor. Ante revocación, cierre de sesión, cambio de usuario o alcance incompatible, impedir lectura de la partición anterior y purgarla conforme a la política de sesión. Definir y probar la vigencia máxima de acceso offline cuando no puede consultarse al servidor.
- Tratar el dispositivo como portador de datos sensibles: minimizar columnas, excluir secretos y tablas internas, limitar retención y documentar la protección necesaria ante pérdida del equipo. IndexedDB por sí solo no equivale a cifrado de datos en reposo.
- Medir cuota disponible antes de descargas grandes; mostrar tamaño previsto/real y errores de espacio. Mantener la copia anterior válida hasta confirmar la nueva. Evitar múltiples descargas simultáneas entre pestañas y conservar recuperación tras interrupciones.
- Versionar los esquemas del feed y del almacenamiento local; una migración fallida no debe dejar una copia parcialmente legible.

## 7. Control de carga sobre Aiven

El objetivo no es trasladar los mismos escaneos completos a un horario de respaldo. Las comprobaciones ordinarias deben costar en proporción a **los cambios**, no al total de filas ni al número de pantallas abiertas. Diseñar índices para el journal/cursor y los filtros de alcance, paginar por clave estable, limitar concurrencia por instancia, escalonar dispositivos con *jitter*, y aplicar compresión y presupuestos de bytes. Una primera descarga masiva se controla por lotes y puede diferirse sin bloquear toda la app.

Medir por dataset: filas y bytes enviados, duración y frecuencia de sincronización, edad del cursor, reconstrucciones, tasa de conflictos, errores de cuota, tiempo de apertura online/offline, consultas SQL y espera del pool. Comparar con la línea base del endpoint actual antes de declarar una mejora. No aumentar el límite de conexiones de Aiven como sustituto de consultas incrementales.

Este diseño reduce lecturas repetidas de módulos, pero **no corrige por sí mismo** jobs backend como push o cálculos diarios, ni consultas no relacionadas con la sincronización. Esos hallazgos conservan seguimiento independiente.

## 8. Etapas de implementación

1. **Inventario y línea base.** Mapear todos los módulos, endpoints, guards, datasets y tamaños; medir consultas/latencia actuales, incluidos Dashboard Operativo y exportadores existentes. Definir por módulo lectura, escritura y adjuntos offline.
2. **Infraestructura de cambios.** Crear journal o mecanismo equivalente, tombstones, cursor seguro, políticas de retención, invalidación por alcance y pruebas de consistencia. Diseñarlo por dataset/base; no asumir un cursor único para todas las bases.
3. **Migrar los dos datasets existentes.** Mantener compatibilidad con las copias actuales mientras Resumen del Día e Instalaciones Proyectos pasan de reconstrucción ordinaria a delta; demostrar altas, modificaciones, bajas y revocación.
4. **Extensión por grupos de módulos.** Priorizar los más costosos y usados (empezando por Dashboard Operativo), reutilizar datasets compartidos y certificar cada módulo con su guard y adaptador local. La cobertura final incluye todos los módulos inventariados o una excepción explícita aprobada.
5. **Acciones offline por módulo.** Ampliar la cola únicamente donde haya semántica de conflicto e idempotencia definida. Añadir archivos bajo un flujo separado si se aprueba su almacenamiento local.
6. **Pruebas de carga y despliegue gradual.** Comparar Aiven, red y UX antes/después; habilitar por cohortes, vigilar errores y conservar un mecanismo de desactivación/reconstrucción por dataset.

## 9. Criterios de aceptación globales

- Después de una copia inicial válida, abrir un módulo online no descarga nuevamente su universo completo: solicita el delta o una consulta puntual acotada. El ejemplo de 15 tickets y 2 equipos transfiere esos cambios y las bajas pertinentes.
- Se detectan ediciones sobre IDs antiguos, eliminaciones, reasignaciones territoriales y cambios en registros relacionados; los datos fuera del nuevo alcance dejan de estar disponibles localmente.
- Con la API/Aiven inaccesible, cada módulo certificado funciona con su última copia completa y muestra su antigüedad; uno sin copia no aparenta estar vacío ni actualizado.
- La aplicación no avanza cursores tras una descarga incompleta, conserva la copia anterior ante fallos y puede reintentar sin duplicar datos ni acciones.
- Identidad, permisos y guards se vuelven a validar online; logout, revocación, cambio de usuario y modo Visor no exponen copias ajenas.
- Las operaciones offline certificadas terminan en acuse idempotente o conflicto visible; ninguna escritura local se anuncia como persistida en Aiven antes del acuse.
- La cobertura se verifica contra el inventario completo de módulos, no solo contra los dos exportadores del piloto. Una prueba de carga demuestra la reducción de filas/bytes y consultas sobre Aiven sin degradar el pool.

## 10. Decisiones pendientes antes de construir

1. Frecuencia de sincronización ordinaria y vigencia máxima aceptada de una copia offline.
2. Política de almacenamiento de adjuntos, cuota por dispositivo y tratamiento de datos sensibles.
3. Retención del journal/tombstones y procedimiento de reconstrucción para dispositivos que pasan mucho tiempo desconectados.
4. Qué acciones de cada módulo se permitirán offline y cómo resolverán conflictos.
5. Objetivos medibles de latencia, carga SQL y cobertura para declarar terminada la expansión global.
