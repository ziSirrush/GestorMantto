# ADR - Motor alcance_uni

Fecha: 20/08/2026  
Estado: Aprobado para implementacion incremental  
Proyecto: Mantto Gestor

## Contexto

UNITED y CORELLIAN requieren criterios de alcance diferentes.

CORELLIAN se resuelve por personas visibles. UNITED obtiene gran parte de sus registros desde sistemas externos y su responsabilidad territorial ya esta normalizada mediante Zonas Operativas.

## Decision

`alcance_uni` sera el motor de alcance de registros para agrupaciones UNITED.

La regla normal para informacion UNITED es:

`permiso funcional permitido AND registro dentro de una Zona Operativa activa del usuario`.

El permiso funcional no se resuelve dentro de este servicio. La capa superior debe validarlo primero.

## Fuente de Zona Operativa

Se reutilizan exclusivamente las tablas existentes:

- `usuario_zop.usuario_id`;
- `usuario_zop.zona_id`;
- `usuario_zop.estado`;
- `z_op.id_zona`;
- `z_op.estado`.

Solo una relacion activa hacia una Zona Operativa activa forma parte del alcance.

No se crean columnas ni tablas.

## Portafolio

`portafolio.zona_id` es la referencia estructurada a `z_op.id_zona` y sera la fuente preferida para filtrar equipos/proyectos UNITED.

El varchar `portafolio.zona_operativa` no sustituye al FK cuando `zona_id` esta disponible.

## Tickets

La tabla `tickets` no tiene `zona_id` FK.

No se asumira que `tickets.zona` representa exactamente `z_op.zona`.

Para la Fase 3, el alcance zonal de Tickets se deriva de Portafolio mediante las relaciones que el backend ya utiliza entre Ticket y Portafolio: codigo de equipo, proyecto o proyecto padre.

Esto evita ampliar acceso por una equivalencia textual no verificada.

## Usuario sin zonas

Si el usuario no tiene ninguna relacion activa en `usuario_zop`, no puede ver registros UNITED mediante alcance normal.

El filtro generado falla cerrado.

## Usuario efectivo

Se usa `contextUser` antes que `user` para conservar la semantica del Visor de usuarios.

## Llaves maestras

La deteccion de llaves maestras permanece fuera de `alcance_uni`.

Una capa superior puede entregar `masterAccess = true` solo despues de validar la llave maestra UNITED.

En ese caso no se aplica filtro zonal.

## Notificaciones

Las notificaciones UNITED deben obedecer el mismo limite territorial. Un usuario no debe recibir una notificacion UNITED si el evento pertenece a una Zona Operativa fuera de su alcance.

El servicio de Notificaciones existente ya consulta `usuario_zop` para este proposito. La integracion posterior debe conservar una sola fuente de verdad.

## Informacion cruzada

La pertenencia zonal al registro padre no concede acceso automatico a bloques de otros modulos.

Cada bloque se validara posteriormente con su propio `permiso + alcance`.

## M2M

Endpoints de Sync/Webhook/M2M siguen fuera del alcance humano y conservan su autenticacion de integracion.

## Consecuencia

La Fase 3 deja disponible un motor UNITED aislado y comprobable sin alterar aun el Guard ni rutas productivas. La seleccion automatica por `perm_agrupaciones.empresa` se realizara en la siguiente fase.
