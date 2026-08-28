# ADR - Resolver central de alcance

Fecha: 20/08/2026  
Estado: Fase 4  
Proyecto: Mantto Gestor

## Decision

Se crea un resolver central que selecciona el motor de alcance humano por la empresa de `perm_agrupaciones`:

- `GENERAL` -> `alcance_gnral`;
- `CORELLIAN` -> `alcance_cor`;
- `UNITED` -> `alcance_uni`.

La seleccion depende de la **agrupacion consultada**, no de la empresa, rol o puesto del usuario. Por ello un mismo usuario puede utilizar CORELLIAN y UNITED en la misma sesion segun el modulo que abra.

## Compatibilidad con el catalogo existente

La estructura verificada usa `perm_agrupaciones.empresa varchar(50)` y existen valores legacy como:

- `BLT`;
- `United Elevadores`;
- `Corellian SA de CV`.

Para no exigir cambios SQL en esta fase, el resolver los normaliza a GENERAL, UNITED y CORELLIAN respectivamente. Tambien acepta los nombres canonicos nuevos.

Una empresa no reconocida falla cerrado con error de configuracion; nunca cae silenciosamente a GENERAL.

## Llaves maestras

La Fase 4 se convierte en la capa superior que puede entregar `masterAccess` a los motores.

Para CORELLIAN y UNITED reutiliza la llave existente `usuarios_alcance_informacion.tipo_alcance = 'DOMINIO_COMPLETO'` del usuario efectivo.

GENERAL no inventa una nueva fila `DOMINIO_COMPLETO`. Si una ruta GENERAL posee una llave administrativa ya validada por otra capa, puede entregarla explicitamente mediante `{ masterAccess: true }`.

Ningun motor infiere roles por su cuenta.

## Viewer

La identidad efectiva sigue siendo `contextUser || user`. La llave almacenada y el alcance se resuelven para el usuario efectivo, no para el actor que esta usando el Visor.

## Permiso funcional

Esta fase no reemplaza la pregunta `Tengo permisos?`.

El resolver decide exclusivamente **que motor de alcance aplica**. La integracion posterior del Guard debe conservar el orden:

1. autenticacion e identidad efectiva;
2. permiso funcional;
3. resolver central de alcance;
4. filtro del registro;
5. en vistas combinadas, permiso + alcance independiente por bloque.

## M2M

Sync, Webhook y endpoints exclusivamente de integracion continuan fuera de este resolver.

## Informacion cruzada

No se implementa en Fase 4. Corresponde a Fase 5.
