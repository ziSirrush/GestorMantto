# ADR - Fase 3 Guard General de Informacion

Fecha: 19/08/2026
Estado: Aprobado por arquitectura previamente acordada / implementado en Fase 3
Proyecto: Mantto Gestor

## Contexto

Mantto Gestor ya dispone de dos dimensiones independientes:

1. Permisos funcionales: determinan que modulo/accion puede utilizar un usuario.
2. Alcance de Informacion: determina que informacion puede consultar dentro de los dominios y agrupaciones autorizados.

Fase 1 agrego soporte persistente para `AGRUPACION` en `usuarios_alcance_informacion` y Fase 2 amplio el resolver central para `DOMINIO_COMPLETO`, agrupaciones, `REPORTA_A`, `REL_ADMIN` y `USUARIO`.

El sistema necesita una puerta comun reutilizable para que las rutas humanas no reimplementen estas reglas de manera diferente en cada modulo.

## Decision

Se crea `backend/src/middleware/information-access-gnral.middleware.js` como Guard General reusable.

Orden obligatorio:

```text
Autenticacion
AND permiso funcional efectivo
AND Acceso General al dominio/agrupacion
AND contexto de Alcance de Informacion
```

El Guard utiliza al usuario efectivo (`req.contextUser || req.user`) para permiso y alcance. La identidad real permanece en `req.actorUser` para auditoria.

`DOMINIO_COMPLETO` elimina el filtro individual de usuarios dentro del dominio autorizado. Si no existe dominio completo, el modulo debe filtrar usando `usuarios_visibles`, compuesto por alcance automatico y Usuarios adicionales.

El Guard falla cerrado ante errores tecnicos y no usa fallback LEGACY.

## Limites deliberados

- Fase 3 no monta el Guard en rutas existentes.
- Fase 3 no decide que columna SQL representa al usuario en cada modulo.
- Fase 3 no protege M2M/integraciones.
- Fase 3 no cambia las reglas personales de General.
- Los detalles fuera de alcance se resolveran como 404 en la integracion especifica de Fase 4.

## Consecuencias

Positivas:

- una sola secuencia de autorizacion para rutas humanas;
- separacion entre permisos y datos;
- modo Visor evaluado con identidad efectiva;
- fail-closed consistente;
- sin IDs de agrupacion hardcodeados: puede usarse `groupingCode` y se valida contra `perm_agrupaciones`.

Costos:

- cada ruta protegida agrega consultas de validacion antes de su consulta operativa;
- Fase 4 debe reutilizar `req.informationAccess` y no volver a resolver el alcance, para evitar consultas duplicadas;
- cada modulo debe identificar explicitamente la columna/relacion con usuario que corresponde a su modelo de datos.

## Regla de implementacion posterior

Fase 4 debe conectar este Guard modulo por modulo y validar con codigos reales existentes. No se debe aplicar un middleware global a todo `/api`, porque existen login, health, ayuda publica e integraciones con contratos distintos.
