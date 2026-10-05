# Fase 2 · Movimientos Críticos · Permisos y catálogo V001

**Fecha:** 03/10/2026  
**Repositorio:** `ziSirrush/GestorMantto`  
**Rama revisada:** `main`  
**Commit base:** `e5d0d3f5b7ab4bf85a3ed7d89557ee9566068a0c` (`Version 100226.9`)

## Objetivo

Cerrar la puerta temporal de la Backend V001 y registrar un permiso propio para **Operación > Movimientos Críticos**, sin crear un segundo motor de alcance ni asignar privilegios automáticamente.

## Cambio funcional

La backend de Fase 1 usaba temporalmente:

`OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER`

Fase 2 la sustituye por:

`OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

De este modo, **tener acceso a Equipos Críticos ya no implica acceso a Movimientos Críticos**.

## SQL

La fase registra únicamente dentro de las tablas existentes de permisos:

- `perm_modulos`
- `perm_elementos`
- `perm_subelementos`
- `perm_subelemento_acciones`

Reutiliza:

- `perm_agrupaciones.OPERACION`
- `perm_acciones.ACCESO_VISUAL`

No crea tablas nuevas y no asigna permisos en `rol_permisos` ni `usuario_permisos`.

## Orden recomendado

1. Ejecutar `PRECHECK_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`.
2. Verificar que `OPERACION` exista y revisar si el módulo/permiso ya existe.
3. Ejecutar `APLICAR_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`.
4. Ejecutar `VALIDAR_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`.
5. Aplicar el archivo backend modificado de esta entrega junto con/encima de la Fase 1 Backend V001.
6. Asignar el permiso desde Panel de Control únicamente a los roles/usuarios autorizados cuando corresponda.

## Rollback

`ROLLBACK_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql` elimina exclusivamente el catálogo creado por esta fase y **se detiene** si detecta asignaciones a roles/usuarios. No elimina la acción global `ACCESO_VISUAL`.

## Archivos modificados

- `backend/src/modules/movimientos-criticos/movimientos-criticos.routes.js`

## Archivos nuevos

- `sql/PRECHECK_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`
- `sql/APLICAR_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`
- `sql/VALIDAR_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`
- `sql/ROLLBACK_FASE_2_MOVIMIENTOS_CRITICOS_PERMISOS_V001.sql`
- `docs/BACKEND_ARQUITECTURA/Catalogo/modules/movimientos-criticos.md`
- documentación de entrega/validación/checksums.

## No modificado

- No se modifica `criticos_cortes_semanales`.
- No se modifica Movimientos Portafolio.
- No se modifica Equipos Críticos.
- No se crea frontend.
- No se asignan roles ni usuarios.
- No se modifica `index.html`.
- No se ejecuta SQL en Aiven.
- No se hace push a GitHub.
- No se despliega Azure/Netlify/GitHub Pages.

## Dependencia

Esta entrega presupone aplicada la **Backend V001 de Movimientos Críticos**. El único archivo backend incluido es el que cambia en Fase 2, conforme a la regla incremental del proyecto.
