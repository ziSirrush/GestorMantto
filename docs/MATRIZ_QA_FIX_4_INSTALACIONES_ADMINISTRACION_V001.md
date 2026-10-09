# Mantto Gestor — FIX 4 · Matriz de integración y liberación

**Fecha:** 09/10/2026 · **Estado:** PENDIENTE DE EVIDENCIA ONLINE/LABORATORIO.  
**Entorno de prueba:** Local → GitHub Pages; backend autorizado en Azure, base Aiven/MySQL QA autorizada.  
**No se autoriza Netlify productivo únicamente con pruebas simuladas.**

| ID | Prioridad | Escenario | Aprobación exigida | Evidencia / ejecutado |
|---|---|---|---|---|
| QA-01 | P0 | Sin sesión / sin permiso visual | Sidebar no disponible, GET/PATCH 401/403 | Pendiente |
| QA-02 | P0 | Acceso visual pero sin PROYECTO.VER | GET /proyectos 403 y sin filtración | Pendiente |
| QA-03 | P0 | Rol elevado sin puerta CORELLIAN | Guard deniega pese a rol | Pendiente |
| QA-04 | P0 | Scope por personas | Equipo fuera de alcance no visible ni por ID | Pendiente |
| QA-05 | P0 | Permisos VER por grupo | Listado/detalle no devuelven campos restringidos | Pendiente |
| QA-06 | P0 | Solo VER (sin EDITAR) | No permite PATCH de ningún grupo ni lote | Pendiente |
| QA-07 | P0 | Visor de usuarios | Puede leer según usuario efectivo; todas las escrituras 403 | Pendiente |
| QA-08 | P0 | Listado de proyectos | Agrupación por `id_proyecto`; sin PP NS aislado | Pendiente |
| QA-09 | P1 | Búsqueda y filtros | Búsqueda, estatus, supervisor `id_sup`, paginación | Pendiente |
| QA-10 | P0 | Ficha individual | Actualiza campos de ≥2 grupos en una operación | Pendiente |
| QA-11 | P0 | Guardado individual + auditoría | 1 UPDATE, auditar grupos modificados, misma TX | Pendiente |
| QA-12 | P0 | Cambio de supervisor que quita alcance | PATCH no revela datos posteriores; GET por ID 404 | Pendiente |
| QA-13 | P0 | Selección múltiple | Solo equipos con mismo PP NS, 2–20 IDs únicos | Pendiente |
| QA-14 | P0 | Mezcla de dos proyectos por API | 400/409, 0 escrituras, sin auditoría parcial | Pendiente |
| QA-15 | P0 | Registro fuera de scope en lote | Operación completa rechazada, 0 escrituras | Pendiente |
| QA-16 | P0 | Conflicto entre editores | 409, sin sobrescritura de otros cambios | Pendiente |
| QA-17 | P0 | Auditoría falla en equipo 2 | ROLLBACK de todos los cambios y auditorías | Pendiente |
| QA-18 | P0 | Campo sin marcar en lote | Valor original preservado en cada equipo | Pendiente |
| QA-19 | P0 | Campo sin cambios reales | No UPDATE ni AUDITAR_CAMBIO innecesario | Pendiente |
| QA-20 | P0 | Campos especiales | Fechas DD/MM/AAAA en UI, ISO almacenado; %/moneda/ID válidos | Pendiente |
| QA-21 | P0 | Usuario revocado durante consulta | Cierre de datos previos y lectura nueva bajo Guard | Pendiente |
| QA-22 | P1 | Móvil/PWA | Sin tablas truncadas, filtros y selección usables | Pendiente |
| QA-23 | P0 | SQL de permisos | 23 permisos activos; acceso solo a usuarios/roles asignados | Pendiente |
| QA-24 | P0 | Auditoría Aiven | `AUDITAR_CAMBIO` con before/after completo, actor y hora | Pendiente |
| QA-25 | P0 | GAS / Google Sheets | No revierte datos editados por humano sin política autorizada | Pendiente |
| QA-26 | P1 | Carga y rendimiento | Filtrado/paginación sin regresión significativa bajo carga representativa | Pendiente |
| QA-27 | P0 | GitHub Pages antes de Netlify | Backend Azure y frontend QA sincronizados; capturas y aprobación | Pendiente |
| QA-28 | P0 | Netlify manual | Deploy solo tras autorización; no existe automatic deploy | Pendiente |

## Tipos de evidencia

- **Automático local:** `EJECUTAR_QA_FIX_4.ps1` y tests de Node. Cubre contrato simulado. No sustituye Azure/Aiven.
- **GET online autorizado:** `validation/instalaciones-administracion-fix4-readonly-smoke.js` con token de usuario de pruebas. Solo lectura; acepta `--denied-record-id` para scope negativo y `MANTTO_QA_DENIED_TOKEN` para persona autenticada con 403 real.
- **SQL solo lectura:** `database/QA_FIX_4_INSTALACIONES_ADMINISTRACION_SOLO_LECTURA_V001.sql` en conexión autorizada, con cuenta de lectura.
- **Transacciones reales:** reproducir QA-10 a QA-19 y QA-24 en **base de laboratorio/restauración**, no en producción. Obtener logs de commit/rollback y comparar instantáneas de `ins_fl`/`usuario_interacciones` sin exponer secretos.
- **GAS:** identificar propietario y mapeo del proceso externo. Si hay colisión en campos humanos, bloquear liberación y resolver la política de autoridad/sincronización antes de promover.

## Criterios de bloqueo

No se considera cerrado el FIX para producción si falla cualquiera de los **P0**, si no están aplicados los FIX 1–3 completos o si faltan pruebas SQL/laboratorio del lote. El envío del ZIP **no equivale** a instalación, validación E2E ni aprobación de release.
