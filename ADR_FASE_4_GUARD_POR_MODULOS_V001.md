# ADR - Fase 4 Guard General por Modulos

Fecha: 2026-08-19
Estado: Implementacion propuesta / pendiente de validacion runtime
Base: `4270448f0242df1b17ffe5073b59e0185a62bd1f`

## Contexto

Mantto Gestor ya separa dos dimensiones de autorizacion:

1. Permiso funcional: que modulo/accion puede ejecutar el usuario.
2. Alcance de Informacion: que informacion de la BD puede consultar.

Fase 1 preparo `AGRUPACION`, Fase 2 construyo el resolver y Fase 3 creo el Guard General reusable. Fase 4 integra esas primitivas en rutas y consultas humanas reales.

## Decision

La seguridad de datos se aplica en backend antes o dentro de la consulta, nunca solo en Sidebar/frontend.

Secuencia:

`requireAuth -> usuario efectivo -> permiso efectivo -> Acceso General -> Alcance -> consulta filtrada`

### Identidad efectiva

Se usa `req.contextUser || req.user`. En Viewer, el usuario visualizado define permisos y alcance para lecturas; el actor real permanece separado para auditoria. Escrituras en Viewer se rechazan.

### Acceso General

Se autoriza por:

- `DOMINIO_COMPLETO`; o
- `AGRUPACION` real de `perm_agrupaciones`.

La agrupacion debe pertenecer al dominio solicitado.

### Filtro de registros

Cuando no existe dominio completo:

- Portafolio: `supervisor_zona` / `superintendente` contra usuarios visibles.
- Tickets: responsables directos del Ticket y responsabilidad derivada del equipo/proyecto en Portafolio.
- Instalaciones `ins_fl`: `id_asesor`, `id_sup`, `id_admin`.

No se introducen relaciones nuevas ni inferencias de propietario no verificadas.

### Detalles

Los detalles fuera de alcance se tratan como no encontrados (404) cuando existe un identificador concreto, reduciendo divulgacion de existencia.

### M2M

Las rutas de sincronizacion conservan `integration-auth` y no pasan por la identidad humana.

### Snapshots historicos

Los snapshots semanales globales de Portafolio solo son consultables con dominio completo United. No se filtran parcialmente despues de materializados.

### Separacion United/Corellian

El detalle Corellian de equipo no ejecuta una consulta implicita a Portafolio United. Una relacion cruzada requiere un flujo explicito y permiso correspondiente.

## Consecuencias

### Positivas

- Permiso y datos se validan en backend.
- Direct URL/API queda sujeta a la misma regla.
- Viewer usa identidad efectiva.
- M2M no se rompe por un guard humano global.
- Reutiliza `perm_agrupaciones` y el resolver existente.
- No crea una segunda arquitectura de permisos.

### Riesgos

- Campos textuales de responsables en Portafolio pueden tener diferencias de escritura respecto a `usuarios` y provocar subvisibilidad.
- Algunos modulos antiguos agregan datos en consultas complejas; el filtro debe aplicarse antes de la agregacion.
- Los snapshots historicos no permiten reconstruir de forma confiable un subconjunto por usuario despues de generados.

## Casos deliberadamente no inventados

- No existe permiso independiente de comentario de Ticket en el catalogo actual.
- Cobranza Corellian todavia no tiene las tablas operativas declaradas por sus endpoints reservados.
- No se crea una relacion usuario-registro adicional sin fuente real en Aiven.

## Reversion

La Fase 4 no cambia esquema. La reversion de codigo consiste en restaurar los archivos modificados al commit base o revertir el commit de Fase 4. Los datos de Aiven no requieren rollback de esquema.
