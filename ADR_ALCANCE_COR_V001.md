# ADR - Motor alcance_cor

Fecha: 20/08/2026  
Estado: Aprobado para implementacion incremental  
Proyecto: Mantto Gestor

## Contexto

CORELLIAN y UNITED no pueden compartir el mismo criterio de alcance operacional.

CORELLIAN trabaja principalmente con relaciones humanas de responsabilidad. UNITED se resolvera posteriormente por Zonas Operativas.

## Decision

`alcance_cor` sera el motor de alcance de registros para agrupaciones CORELLIAN.

Su conjunto normal de personas visibles se forma por:

1. usuario efectivo;
2. `REPORTA_A`, si esta habilitado;
3. `REL_ADMIN`, si esta habilitado;
4. usuarios adicionales configurados.

Cada modulo CORELLIAN debe traducir ese conjunto a sus **columnas reales de responsabilidad**. No se establece una columna universal como `created_by`.

Ejemplo ya conocido: Instalaciones FL usa `id_asesor`, `id_sup` e `id_admin`.

## Usuario efectivo

El motor utiliza `contextUser` antes que `user` para conservar la semantica del Visor de usuarios.

## Llaves maestras

Las llaves maestras se validan fuera del motor.

Si la capa superior confirma una llave maestra CORELLIAN, entrega `masterAccess = true` y el motor no aplica filtro por personas.

El motor no hardcodea nombres de rol ni crea una segunda fuente de verdad de permisos.

## Informacion cruzada

El acceso a un registro padre no concede acceso automatico a bloques de otros modulos. Esa tercera capa se implementara posteriormente.

Ejemplo conceptual: tener acceso a un proyecto no implica poder ver un bloque de otra funcion si el usuario no cumple permiso + alcance de ese bloque.

## Chats

El alcance controla el acceso al hilo, no mensajes individuales. Si el usuario puede abrir un chat, conserva acceso al historial completo de ese hilo, incluidos los mensajes historicos de quienes participaron.

## Persistencia

Esta fase no crea tablas ni columnas. Reutiliza las relaciones actuales y deja cualquier cambio de configuracion visual al Panel de Control para una fase posterior.

## Consecuencia

La Fase 2 crea un motor aislado y comprobable sin alterar aun el comportamiento de rutas existentes. La activacion efectiva ocurrira al integrar el resolver central y migrar cada modulo de forma controlada.
