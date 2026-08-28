# ADR - Alcance por empresa

Fecha: 20/08/2026  
Estado: Aprobado para implementacion incremental  
Proyecto: Mantto Gestor

## Contexto

La arquitectura anterior utilizaba un unico alcance de informacion para UNITED y CORELLIAN. La operacion real requiere separar los motores porque las reglas de negocio son distintas.

`perm_agrupaciones.empresa` sera la fuente que, en una fase posterior, determine el motor aplicable a cada agrupacion.

## Decision

Se establecen tres motores independientes:

- `GENERAL` -> `alcance_gnral`
- `CORELLIAN` -> `alcance_cor`
- `UNITED` -> `alcance_uni`

`alcance_gnral` es el motor por defecto para informacion GENERAL y se basa en relacion directa con el usuario efectivo:

- creado por mi;
- asignado a mi;
- relacionado/participante conmigo cuando la estructura real del modulo lo soporte.

No usa `REPORTA_A`, `REL_ADMIN` ni Zonas Operativas.

Los motores futuros quedan definidos conceptualmente asi:

- `alcance_cor`: alcance por personas visibles.
- `alcance_uni`: alcance por Zonas Operativas activas.

## Llaves maestras

Los motores no deben inventar ni duplicar la deteccion de llaves maestras.

Una capa superior validara la llave maestra existente y entregara al motor el resultado ya autorizado. El motor podra omitir el filtro de registros solamente cuando reciba explicitamente ese resultado validado.

## Informacion combinada

Las vistas que mezclen informacion de varios modulos deberan validar cada bloque de manera independiente. El acceso al registro padre no heredara automaticamente permiso ni alcance sobre bloques hijos.

Ejemplo: un usuario puede consultar Portafolio, pero la seccion Tickets solo se consultara y mostrara si tambien cumple permiso + alcance de Tickets.

## M2M / Sync

Los endpoints exclusivamente M2M, Sync, Webhook o integraciones externas no pasan por los motores de alcance humano. Conservan su autenticacion/autorizacion de integracion.

## Fases acordadas

1. `alcance_gnral`.
2. `alcance_cor`.
3. `alcance_uni`.
4. Resolver central por `perm_agrupaciones.empresa`.
5. Capa de informacion cruzada.
6. Panel de Control y migracion de modulos.

## Consecuencias de Fase 1

Esta fase no modifica rutas, controladores, frontend, esquema Aiven ni modulos en Nevera. Solo crea la base reusable de `alcance_gnral` y una prueba estatica/autocontenida.
