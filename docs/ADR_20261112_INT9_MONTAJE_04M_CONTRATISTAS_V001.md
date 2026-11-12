# ADR INT9 — Conciliación Montadores 04-M y relación por contratista
Fecha: 2026-11-12
Estado: Implementación en GitHub; aplicación SQL manual pendiente

## Decisión
Para equipos activos con estatus `04-M`, relacionar el `id_ins_fl`, `id_proyecto`, iniciales de `ins_fl.subcontratista` y contratista identificado inequívocamente a partir de personas activas de tipo MONTADOR en `instalaciones_personal`. **No asignar montadores automáticamente.** El personal se elige manualmente entre los integrantes del contratista cuya columna `iniciales` coincide con la referencia de FL.

## Almacenamiento y separación
Crear manualmente, fuera de GitHub, `instalaciones_programacion_contratistas_fl`, con historial de relaciones, una sola relación activa por equipo y FK a `ins_fl`. Se conserva `instalaciones_programacion_asignaciones` para las asignaciones individuales; no se crean filas ficticias ni se mezclan con las asignaciones automáticas `06-A`.

## Puntos de integración
1. POST M2M `/api/ins-fl/sync`: después de confirmar el COMMIT, conciliar únicamente IDs cuyo estatus, iniciales, proyecto o fechas hayan cambiado, como proceso separado de Ajustadores.
2. Guardados humanos y altas en Instalaciones Administración: conciliar `04-M` tras COMMIT. Los errores de conciliación se informan y no revierten una mutación FL ya confirmada.
3. Asignaciones manuales: para equipos `04-M`, bloquear personal/equipo y validar relación vigente, código de iniciales y contratista. No alterar asignaciones existentes en re-conciliación.
4. Calendario de Contratistas: agrupar relaciones por contratista y proyecto, incluyendo proyectos sin personal. No exponer equipos fuera de alcance CORELLIAN.
5. Panel de Control: botón de pruebas `04-M`, controlador y paginado propios, autorizado solo para Programador, sin alterar el job `06-A`.

## Incidencias y límites
No elegir contratista si el código es vacío, ambiguo o no aparece en el catálogo; tampoco sin fechas válidas. Una modificación de la relación anterior la historiza; no modifica asignaciones manuales. El proceso de carga usa un máximo de 80 equipos por request y el barrido manual usa bloques de cinco; reporta límites y errores sin falsear éxito. La tabla requiere migración SQL manual, separada del repositorio, previa a ejecutar el botón de QA o registrar asignaciones manuales protegidas por la relación. No hay confirmación de DDL ni datos productivos de Aiven.

## Trazabilidad de versiones
API y Frontend tienen revisiones independientes. Las versiones no avanzan por modificaciones exclusivas del otro componente. Se mantiene la referencia combinada para commits.
