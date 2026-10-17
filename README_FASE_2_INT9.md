# Mantto Gestor — INT-9 · Fase operacional 2/3 — Calendario y asignaciones

**Entrega:** 16/10/2026 · V001 · archivos completos; **no desplegada ni aplicada**.

- Base oficial revisada: `ziSirrush/GestorMantto`, rama `main`, commit `2f0f893b51323303b0eb3ee83ea939badb8e95de`.
- Referencia LAB: `JIVMBLT/updated_code`, rama `main`, commit `70186ce81f5bf4c5d94d80caae088f6d1596538b`; INT-9 v002, documentado en `docs/integraciones/integracion9_Instalaciones_ProgramacionPersonal_v002.md`.
- **Prerrequisito obligatorio:** incorporar los archivos y ejecutar manualmente, solo tras aprobación, el SQL de **FASE 1** para `instalaciones_personal`. Esta F2 contiene archivos F1 modificados de forma acumulativa, pero no vuelve a entregar archivos F1 que no cambiaron (`backend/src/routes/index.js`).
- **No tocar** `index.html`, `core/router.js` ni `core/module-loader.js` en F2: integrar navegación y ciclo de vida queda para **Fase 3**.

## Alcance operacional incluido

1. **Calendario:** Montadores / Ajustadores; períodos 14/31/62/93 días (máximo 100); navegación por fecha, búsqueda de personal, barras de ocupación, selección de día, lectura de equipo y barras editables con permiso.
2. **Equipos con alcance:** busca solo equipos activos de `ins_fl` visibles conforme al Guard CORELLIAN del Gestor (`informationAccess` + `buildInsFlScopeSql_gnral`). Se indican equipos sin personal en el período y asignaciones sin fechas válidas.
3. **Asignaciones:** alta de una o varias personas (máximo 60 por solicitud), edición de fechas manuales/notas, baja lógica. Operaciones multi-persona dentro de una transacción MySQL; bloqueo `FOR UPDATE` por persona para serializar altas/cambios/bajas, índice único por persona-equipo activo.
4. **Conflictos:** persona ya activa en el mismo equipo → 409. Traslape con otro equipo → respuesta `requiere_confirmacion` sin escritura; el usuario puede autorizar expresamente el traslape. Las ocupaciones en equipos fuera del alcance cuentan, pero **no revelan** nombres, notas ni IDs de los proyectos/equipos.
5. **Protección de la Fase 1:** desactivar personal con asignaciones actuales/futuras o sin fechas válidas devuelve 409. Las asignaciones históricas pasadas pueden conservarse al desactivar la persona.
6. **Permisos:** VER para consultas; CREAR para altas; EDITAR para cambios; DESACTIVAR para bajas; la puerta CORELLIAN y el alcance de los equipos se comprueban en el backend. El Visor se mantiene solo lectura. **No** se incorpora bypass del rol Director General.
7. **Fechas:** del reporte `ins_fl` sin modificarlo: Montador usa inicio de montaje y fin real → modificado → planeado; Ajustador usa inicio de ajuste y fin real → modificado → planeado. Días naturales inclusivos; `fecha_desde`/`fecha_hasta` son overrides opcionales para relevos o equipos sin fechas. Parsing ISO y DD/MM/AAAA sin corrimientos de zona horaria. **Nota:** esta prioridad, días naturales y posibilidad de forzar traslapes fueron asumidos en el LAB y requieren validación de negocio antes del deploy.

### API F2, además de la F1

- `GET /api/instalaciones/programacion/equipos`
- `GET /api/instalaciones/programacion/calendario`
- `POST /api/instalaciones/programacion/asignaciones`
- `PUT /api/instalaciones/programacion/asignaciones/:id`
- `DELETE /api/instalaciones/programacion/asignaciones/:id`

El catálogo de la Fase 1 permanece en `GET /opciones`, `GET/POST /personal`, `PUT/DELETE /personal/:tipo/:id`.

## SQL: **SÍ**, requiere aprobación explícita antes de aplicarse

Se propone **solo una tabla adicional**, `instalaciones_programacion_asignaciones`, con FK a `instalaciones_personal.id_personal` (F1), `ins_fl.id_ins_fl` (existente), y autoría `usuarios.id_SB` (existente). No hace cambios a `ins_fl`, no crea usuarios/roles y no incorpora dummies. Es una relación n:n persistente por persona/equipo con fechas opcionales y baja lógica. Según la sábana de estructura fechada 07/10/2026 no existe una tabla equivalente; **esto NO garantiza la estructura actual de Aiven**.

**Orden exclusivamente manual tras autorización:**

1. Confirmar que la **Fase 1** y su tabla `instalaciones_personal` ya están aplicadas y son correctas.
2. Ejecutar `database/int9_programacion_personal/00_PRECHECK_FASE_2_INT9.sql` (**solo lectura**). Detenerse si hay estructura equivalente, ausencia de F1, columnas/llaves distintas o permisos inesperados.
3. Hacer respaldo y comprobar su restaurabilidad en entorno de prueba.
4. Solo con aprobación expresa de esa tabla ejecutar `database/int9_programacion_personal/01_APLICAR_FASE_2_INT9.sql` (**DDL, no automático**) en entorno autorizado.
5. Ejecutar `database/int9_programacion_personal/02_SMOKE_FASE_2_INT9.sql` (**solo lectura**). Incorporar los archivos de F2 y reiniciar backend únicamente con autorización.

**No ejecuté ningún SQL.** Crear tabla mediante DDL en MySQL implica commit implícito; NO se ofrece un rollback automático destructivo. La tabla y los índices utilizan un nombre específico para evitar colisiones de `UNIQUE` con tablas del proyecto. Solo se debe aplicar si el precheck confirma compatibilidad.

## Archivos incluidos — completos y únicamente nuevos/modificados

```text
backend/src/modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.asignaciones.service.js   [NUEVO]
  instalaciones-programacion-personal.routes.js                 [MODIFICADO respecto F1]
  instalaciones-programacion-personal.service.js                [MODIFICADO respecto F1: protección en baja]
modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.js                        [MODIFICADO respecto F1: calendario]
  instalaciones-programacion-personal.css                       [MODIFICADO respecto F1: estilos calendario]
database/int9_programacion_personal/
  00_PRECHECK_FASE_2_INT9.sql                                   [NUEVO, lectura]
  01_APLICAR_FASE_2_INT9.sql                                    [NUEVO, DDL manual]
  02_SMOKE_FASE_2_INT9.sql                                     [NUEVO, lectura]
README_FASE_2_INT9.md
```

**No contiene** `.patch`, instaladores, preparadores, scripts de deploy, dumps, duplicados de archivos sin cambios o datos ficticios.

## Validación realmente efectuada

- Sintaxis `node --check` de todos los JS incluidos: **PASS**.
- Pruebas aisladas con dobles de DB (no datos reales): cálculo de ventanas por tipo, prioridad de fecha, fechas manuales e inclusivas; invalidaciones, calendario, redacción de asignaciones fuera de alcance, permisos de alcance fail-closed, duplicado 409, operación transaccional; **PASS**.
- Inspección estructural de columnas y FK sobre `Sabana Estrutura 071026.sql` (referencia de 07/10/2026): compatible en el esquema de referencia. **No verificado con Aiven en vivo.**
- UI: sintaxis validada, pero **prueba completa en Chromium no concluida** en el entorno; no reclamar E2E.
- GitHub, Aiven, Azure, Netlify: **sin cambios**. No se realizaron deploys ni writes remotos.

## Siguiente fase

**Fase 3/3:** Historial de programación (diferenciar explícitamente días programados vs asistencia/trabajo comprobado), disponibilidad, simulación, permisos visuales por acción, menú, router, module-loader, caché y `ManttoDataSync`. No cuenta como fase la validación/QA previa al despliegue.
