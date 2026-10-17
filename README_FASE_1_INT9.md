# INT-9 — Programación de Personal — Fase operacional 1/3

**Entrega:** V001 · 16/10/2026 · **Preparada; no aplicada**.

**Base de código:** `ziSirrush/GestorMantto`, `main` commit `2f0f893b51323303b0eb3ee83ea939badb8e95de`.
**Referencia funcional:** `JIVMBLT/updated_code`, INT-9 v002, `main` commit `70186ce81f5bf4c5d94d80caae088f6d1596538b`.

## Alcance
- Catálogo único de **Montadores** (nombre, contratista, puesto Mecánico/Ayudante, categoría) y **Ajustadores** (nombre, categoría, experiencia).
- Listado, filtros, búsqueda, paginación, alta, edición y baja lógica. Sin inventar usuarios/login para personal externo.
- Nuevo módulo frontend aislado (JS/CSS). **El botón del menú y su registro en `core/module-loader.js`/`core/router.js` quedan para Fase 3**, de acuerdo con la división acordada.
- Backend Express/MySQL: `GET /api/instalaciones/programacion/opciones`; `GET`/`POST /api/instalaciones/programacion/personal`; `PUT`/`DELETE /api/instalaciones/programacion/personal/:tipo/:id`.
- Se reutilizan `usuarios`, `perm_agrupaciones`, `perm_modulos`, `perm_elementos`, `perm_subelementos`, `perm_subelemento_acciones` y el Guard de CORELLIAN; **no se modifica** `ins_fl`.
- Permisos funcionales `INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION.{VER,CREAR,EDITAR,DESACTIVAR}`, sin concesión automática por rol. Se conserva el Guard nativo: sesión, permiso, puerta CORELLIAN y contexto de alcance; el Visor no puede escribir.

## SQL — SÍ es necesario, pero NO está autorizado ni aplicado

**Se propone UNA tabla nueva: `instalaciones_personal`**, no las dos tablas independientes del LAB. No existe tabla equivalente en la sábana del 07/10/2026: `usuarios` requiere credenciales y no describe a contratistas/personas sin login; `ins_fl.subcontratista` y `ins_fl.ajustador` son cadenas por equipo, no catálogo de personas con identidad y atributos propios. La validación contra Aiven en vivo está **pendiente**.

**Requiere tu aprobación explícita de la nueva tabla y verificación read-only del estado real de Aiven antes de aplicar `01_APLICAR_FASE_1_INT9.sql`.** Preparar este archivo no equivale a autorizarlo ni a ejecutarlo.

Orden autorizado únicamente tras aprobación:
1. Ejecutar manualmente `database/int9_programacion_personal/00_PRECHECK_FASE_1_INT9.sql` (solo lectura); revisar si existe ya una estructura equivalente o el código de permisos.
2. Respaldar y validar restauración en ambiente de prueba. Si cambió el esquema real desde la sábana, **detener** y ajustar SQL, sin aplicar a ciegas.
3. Ejecutar manualmente `database/int9_programacion_personal/01_APLICAR_FASE_1_INT9.sql` en entorno autorizado y registrar resultado.
4. Ejecutar `database/int9_programacion_personal/02_SMOKE_FASE_1_INT9.sql` (solo lectura), comprobar catálogo/permisos. Otorgar permisos mediante Panel de Control a usuarios autorizados; no se asumen por rol.
5. Incorporar los archivos de backend y reiniciar el servicio autorizado después de que el SQL esté aplicado. Frontend sin enlace de menú hasta Fase 3.

**Respaldo/reversión:** DDL MySQL produce commit implícito; la reversión NO es un `ROLLBACK` transaccional. Al ser una tabla nueva sin datos, solo podría retirarse tras comprobar dependencias y respaldar los registros. Los nuevos códigos del catálogo tienen relaciones FK con permisos existentes y deberán retirarse en orden seguro; no se incluye un borrado masivo automático.

## Archivos completos (respetar rutas)

```text
backend/src/routes/index.js                                  [modificado]
backend/src/modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.routes.js               [nuevo]
  instalaciones-programacion-personal.service.js              [nuevo]
modules/instalaciones-programacion-personal/
  instalaciones-programacion-personal.js                      [nuevo]
  instalaciones-programacion-personal.css                     [nuevo]
database/int9_programacion_personal/
  00_PRECHECK_FASE_1_INT9.sql                                 [nuevo]
  01_APLICAR_FASE_1_INT9.sql                                  [nuevo]
  02_SMOKE_FASE_1_INT9.sql                                   [nuevo]
README_FASE_1_INT9.md
```

**No contiene** `.patch`, instaladores, preparadores, clonados completos del repositorio, scripts de despliegue ni datos ficticios.

## Validaciones realizadas
- `node --check`: **PASS** en los cuatro JS de la entrega.
- Confirmación hash de `backend/src/routes/index.js`: eliminadas únicamente las tres líneas aditivas, coincide exactamente con el blob oficial `dff5648422554a9871a4a6ee04762c5c6a4cea32`.
- Prueba contractual local con BD simulada: **PASS**. CRUD, duplicados, tipos y cinco endpoints. **No es** MySQL real ni E2E.
- SQL: revisión estructural y comparación con sábana del 07/10/2026. **No probado en Aiven, no ejecutado.**
- GitHub, Aiven, Azure, Netlify: **sin cambios**.

## Para fases 2 y 3
- Fase 2 agregará **tabla de asignaciones**, sujeto a un precheck y aprobación separados; al migrar la lógica de LAB se debe utilizar `instalaciones_personal`, NO las tablas `instalaciones_personal_montadores`/`instalaciones_personal_ajustadores` del LAB. Antes de una baja, se deberá incorporar el bloqueo por asignaciones activas/futuras.
- Fase 3 integrará menú, `core/module-loader.js`, `core/router.js`, caché y permisos visuales. Las pruebas finales de despliegue no son fases adicionales.
