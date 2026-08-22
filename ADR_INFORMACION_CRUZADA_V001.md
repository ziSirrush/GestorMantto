# ADR - Tercera capa de Información Cruzada V001

## Estado
Aprobado para integración incremental.

## Contexto
Las vistas estandarizadas de Detalle Proyecto, Detalle Equipo y otras pantallas pueden combinar información procedente de módulos distintos. El permiso y alcance del elemento padre no deben heredarse automáticamente a los bloques hijos.

Ejemplo aprobado: un Director de Ventas puede tener acceso a Portafolio y al proyecto, pero si no tiene permiso de Tickets no debe consultar ni visualizar los Tickets del proyecto.

## Decisión
Cada bloque hijo se evalúa de forma independiente y en este orden:

1. Permiso funcional del bloque.
2. Alcance de información de la agrupación a la que pertenece el bloque, resuelto por `perm_agrupaciones.empresa` mediante el resolver de Fase 4.
3. Validación del registro/contexto concreto mediante `recordScopeCheck`.
4. Solo después se ejecuta el loader/consulta de datos del bloque.

Si cualquiera de las validaciones falla, el loader no se ejecuta y la clave del bloque se omite del payload final.

## Llaves maestras
Una llave maestra de alcance validada por el resolver puede omitir el filtro normal de registro de su dominio, pero no sustituye el permiso funcional del bloque. No se hardcodean roles en esta capa.

## Chats
El alcance se decide a nivel del hilo/chat. Si el usuario tiene acceso al hilo, se devuelve el historial completo del hilo, incluyendo mensajes históricos de todos los participantes. No se filtran mensajes individuales por autor.

## Seguridad
- Fail closed si falta `recordScopeCheck` y no existe llave maestra de alcance.
- `contextUser` prevalece sobre `user` para respetar el modo Visor.
- El acceso al padre nunca implica acceso al hijo.
- La capa no crea tablas, columnas ni permisos nuevos.
- M2M/Sync/Webhook queda fuera de esta arquitectura humana.

## Consecuencia
La integración posterior de cada detalle deberá separar sus consultas por bloque y utilizar esta capa antes de ejecutar consultas de información cruzada.
