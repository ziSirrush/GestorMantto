# FASE 2 - INSTALACIONES · ADMINISTRACION - PERMISOS Y AUDITORIA V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `d19fc8d575c7fe9d2a91c7630ea676180487c18e`
- Version: `Version 100826.2`
- Fecha de corte: 2026-10-08
- Prerrequisito: `FASE_1_INSTALACIONES_ADMINISTRACION_BACKEND_V001`

## Objetivo

Activar de forma segura el backend humano preparado en Fase 1 mediante permisos reales del Gestor y auditoria persistente reutilizando infraestructura existente.

## Implementado

- Se elimina el cierre temporal `503 / PENDING_SECURITY` de Fase 1.
- Guard General obligatorio: `CORELLIAN / INSTALACIONES`.
- Nuevo permiso de acceso visual al modulo.
- Permisos `VER` y `EDITAR` independientes para cada uno de los 11 grupos.
- El detalle devuelve solo campos de grupos que el usuario puede ver/editar.
- `EDITAR` se valida en ruta y nuevamente en servicio (defensa en profundidad).
- El alcance de informacion sigue resolviendose por el motor central existente.
- La auditoria detallada reutiliza `usuario_interacciones`; no crea tabla.
- Cada cambio real registra: actor, registro, grupo, campos, before/after, endpoint y fecha.
- La escritura de `ins_fl` y su registro de auditoria ocurren en la misma transaccion: si la auditoria falla, el UPDATE hace rollback.
- Los cambios sin diferencia real no generan auditoria.
- `id_proyecto`, `referencia_sitio` y los 4 campos derivados pendientes siguen bloqueados.

## Permisos creados en catalogo

Base:

```text
INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

Por cada grupo:

```text
INSTALACIONES_ADMINISTRACION_GRUPOS_<GRUPO>.VER
INSTALACIONES_ADMINISTRACION_GRUPOS_<GRUPO>.EDITAR
```

Total esperado: **23 permisos**.

Grupos:

```text
PROYECTO
SEGUIMIENTO
CLIENTE_CONTRATO
UBICACION_CONTACTO
EQUIPO
PRODUCCION_LOGISTICA
MONTAJE
AJUSTE_CALIDAD
ENTREGA_GARANTIA_MANTENIMIENTO
COSTOS
RESPONSABLES
```

El SQL **NO asigna permisos a roles ni usuarios**. La asignacion se realiza desde Panel de Control.

## Auditoria

Se reutiliza:

```text
usuario_interacciones
```

Tipo interno:

```text
AUDITAR_CAMBIO
```

El registro tecnico conserva `before/after` solo de los campos realmente modificados. El middleware global puede continuar registrando la interaccion humana normal; `AUDITAR_CAMBIO` no forma parte del listado publico de interacciones del Home.

## SQL

Archivo:

```text
database/FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql
```

Reutiliza exclusivamente las tablas de permisos existentes y las acciones existentes:

```text
ACCESO_VISUAL
VER
EDITAR
```

No crea tablas, columnas, indices ni acciones nuevas.

## Archivos modificados / nuevos

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.audit-service.js
database/FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql
tests/instalaciones-administracion-fase2-permisos-auditoria.test.js
```

`backend/src/routes/index.js` NO se incluye porque Fase 2 no lo modifica; su montaje corresponde a Fase 1.

## Orden recomendado de aplicacion

1. Tener aplicada Fase 1.
2. Extraer este ZIP sobre la raiz del repo.
3. Revisar `git status`, `git diff --check` y `git diff`.
4. Ejecutar el SQL de permisos en el entorno autorizado.
5. Asignar permisos solo a usuarios/roles de prueba cuando corresponda.
6. Reiniciar backend local/Azure solo cuando se autorice despliegue.

Mientras no se asignen permisos, las rutas permanecen cerradas con `403`.

**No conviene asignar acceso visual general al modulo antes de Fase 3**, porque el frontend `instalaciones-administracion` aun no existe.

## Validaciones ejecutadas

```text
node --check: PASS (6 JS backend modificados/nuevos)
node --test: 8/8 PASS
11 grupos / 93 campos: PASS
23 codigos de permiso unicos: PASS
Guard General CORELLIAN/INSTALACIONES: PASS
EDITAR por grupo: PASS
Detalle filtrado por permiso: PASS
Auditoria before/after: PASS estatico
Auditoria antes de COMMIT: PASS estatico
SQL sin CREATE TABLE / ALTER TABLE: PASS
SQL sin asignaciones a usuarios/roles: PASS
```

No se ejecuto SQL contra Aiven, no se realizo prueba E2E y no se desplego backend.

## Pendiente

- Fase 3: frontend base.
- Fase 4: formularios y guardado.
- Fase 5: integracion y QA.

## Sistemas no modificados por esta preparacion

No se modifico GitHub, Aiven, Azure, Netlify ni Google Sheets.
