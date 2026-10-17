# Mantto Gestor — INT-9 — Fase operacional 3/3 — Historial, disponibilidad, simulación e integración

**Entrega:** 16/10/2026 · V001 · preparada localmente; **NO aplicada ni desplegada**.

- **Base exacta de los archivos globales:** `ziSirrush/GestorMantto`, rama `main`, commit `2f0f893b51323303b0eb3ee83ea939badb8e95de` (index, core/router, core/module-loader). No es un diff de una versión antigua.
- **Base de archivos INT-9:** ZIP `FASE_2_INT9_PROGRAMACION_PERSONAL_CALENDARIO_V001.zip` (modificaciones acumulativas sobre la Fase 2; no repetir ni revertir la Fase 1).
- **Referencia de comportamiento:** `JIVMBLT/updated_code`, `main`, commit `70186ce81f5bf4c5d94d80caae088f6d1596538b`, INT-9 v002.
- Sin `.patch`, instaladores, preparadores ni operaciones automáticas de infraestructura.

## ¿Requiere aplicar SQL?

**NO requiere SQL NUEVO en esta Fase 3.** Lee exclusivamente las tablas `instalaciones_personal` (Fase 1), `instalaciones_programacion_asignaciones` (Fase 2), `ins_fl` y el catálogo de permisos preexistente. **Las Fases 1 y 2 SÍ requieren sus SQL previamente autorizados y ejecutados** (y verificados por sus respectivos PRECHECK/SMOKE). Si no están aplicados, la F3 NO es funcional y devuelve error controlado de esquema. Ningún SQL fue ejecutado y la F3 no contiene DDL.

## Cambios funcionales

1. **Historial de programación** con paginación, búsqueda, fechas y estado; incluye asignaciones retiradas sin borrarlas. Distingue explícitamente **días programados transcurridos**, **días programados futuros** y el dato general **días planeados**, SIN presentar ninguno como días trabajados/asistencia comprobada. Las fechas se recalculan desde las columnas vigentes de `ins_fl`; no es una bitácora de asistencia con cortes históricos inmutables.
2. **Disponibilidad** por día, semana o mes (hasta cinco años, 61 meses parciales como máximo). Ocupación de una persona = cualquier coincidencia con el periodo; no equivale a ocupación todos los días. Conserva ocupación por asignaciones fuera del alcance de lectura SIN exponer identificadores ni detalles de esos equipos. Una persona con asignaciones activas **sin fechas** se clasifica como **indeterminada**, no libre.
3. **Simulación solo lectura:** equipo opcional dentro del alcance CORELLIAN o fechas manuales; mecánicos, ayudantes o ajustadores adicionales requeridos; personal libre, ocupado, indeterminado y faltantes. No registra ni reserva personal; respeta un límite de 3,700 días y las reglas de fechas del calendario F2.
4. **Menú / router / module-loader:** `Instalaciones > Programación de Personal`, ruta `instalaciones-programacion-personal`; lazy load JS/CSS con versión F3; persistencia del ciclo de vida y botón Actualizar para todas las pestañas.
5. **Permisos nativos:** el menú exige `INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION.VER`; las acciones CREAR, EDITAR, DESACTIVAR siguen protegidas por los Guards de F1/F2 y el Visor sigue solo lectura. No hay excepciones automáticas por rol Director General.
6. **ManttoDataSync / identidad:** adaptador registrado para refresco de la vista activa sin consultas de vistas inactivas; invalida tras cambios locales de Instalaciones, considera notificaciones de otras pestañas y limpia datos al cambiar usuario efectivo, expirar sesión o revocar permisos.

### Nuevos endpoints (tres GET, sin mutaciones)

- `GET /api/instalaciones/programacion/historial` (`tipo`, `q`, `desde`, `hasta`, `estado`, `id_personal`, `page`, `limit`).
- `GET /api/instalaciones/programacion/disponibilidad` (`tipo`, `desde`, `hasta`, `granularidad`, `q`).
- `GET /api/instalaciones/programacion/simulacion` (`tipo`, `id_ins_fl` opcional, `fecha_inicio`, `fecha_fin`, `mecanicos`, `ayudantes`, `ajustadores`).

Todos usan el **Guard CORELLIAN de F1/F2**: sesión + permiso VER + puerta Instalaciones + alcance por registro, con alcance `ins_fl` resuelto por `buildInsFlScopeSql_gnral`. Las operaciones de escritura conservan las mismas protecciones de las fases anteriores. Los campos de personas pertenecen al catálogo global autorizado; identificadores de equipos fuera de alcance no se entregan en la simulación.

## Archivos incluidos (COMPLETOS y únicamente nuevos/modificados)

```text
backend/src/modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.analitica.service.js     [NUEVO]
  instalaciones-programacion-personal.asignaciones.service.js   [MODIFICADO: expone auxiliares internos de lectura]
  instalaciones-programacion-personal.routes.js                 [MODIFICADO: 3 rutas GET]
modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.js                        [MODIFICADO: 4 pestañas, sincronización, permisos, identidad]
  instalaciones-programacion-personal.css                       [MODIFICADO: historial/proyección/simulación]
core/
  module-loader.js                                               [MODIFICADO: registro y caché]
  router.js                                                      [MODIFICADO: ruta y título]
index.html                                                       [MODIFICADO: entrada, vista y versión de scripts]
README_FASE_3_INT9.md
```

**No reentrega archivos de F1/F2 que no cambiaron**, por ejemplo `backend/src/routes/index.js`, `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js` ni SQL anteriores. Son prerrequisitos, NO fueron reemplazados por la F3.

## Aplicación manual, validación y reversión

1. **Comparar HEAD de `ziSirrush/GestorMantto` antes de copiar**: esta entrega parte de `2f0f893`; si main avanzó en los archivos globales, conciliar manualmente los cambios y no sobrescribir versiones nuevas.
2. Confirmar que se aplicaron/verificaron **las tablas y permisos de las fases 1 y 2 con autorización**; hacer respaldo del repo y verificación de esquema real antes de desplegar backend.
3. Copiar los archivos incluidos **respetando rutas**, conservando el resto de F1 y F2; backend requiere reinicio autorizado antes de usar el nuevo frontend. Refrescar caché PWA/navegador según el procedimiento del proyecto.
4. Conceder permisos efectivos en el Panel de Control a usuarios autorizados. **Ningún rol obtiene permisos automáticamente**. Comprobar que usuarios sin VER no pueden entrar, el Visor no modifica y que el alcance CORELLIAN no revela proyectos ajenos en historial/conflictos.
5. Probar con datos reales autorizados: asignaciones pasadas/retiradas, 3/12/36/60 meses, sin fechas, simulación con y sin equipo, 2 usuarios con alcances distintos y propagación entre pestañas.
6. Para revertir, restaurar los **archivos respaldados** de F3 y reiniciar servicio; no hacer DROP de tablas de F1/F2 porque contienen datos operativos.

## Validación efectuada en esta entrega

- `node --check` para todos los JavaScript incluidos: **PASS**.
- Pruebas contractuales locales con dobles de DB: fechas F1/F2, historia + baja lógica, cálculos de meses/períodos, permisos fail-closed, proyección conservadora de asignaciones sin fechas, ocultamiento de equipos fuera de alcance y simulación read-only: **PASS**.
- `index.html`, `core/router.js`, `core/module-loader.js` construidos sobre blobs exactamente verificados contra el HEAD indicado; cambios confinados a INT-9 (menú, vista, título, loader, versión).
- No se realizó conexión a Aiven, prueba MySQL en vivo ni verificación E2E en navegador autenticado. La evidencia de LAB **no sustituye** validación productiva.
- **No se escribió en GitHub, Aiven, Azure ni Netlify; no se ejecutó SQL.**

**INT-9: las 3 fases operacionales quedan entregadas como archivos, NO desplegadas.** QA y despliegue autorizado son procesos posteriores, no una cuarta fase operacional.
