# Mantto Gestor — FIX 1 · Instalaciones / Administración

**Identificador:** `FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001`  
**Fecha:** 08/10/2026  
**Base oficial verificada:** GitHub `ziSirrush/GestorMantto`, rama `main`, commit `ab0081d6bba66a2583674aab9f077e1cf3482092` (`Version 100826.4`).  
**Naturaleza:** FIX incremental de diseño/navegación y lectura. **No es un módulo nuevo ni una migración SQL.**

## Causa y corrección

La pantalla anterior mostraba registros planos y abría directamente acordeones, sin jerarquía por proyecto ni filtros completos. El límite de 25 registros de la búsqueda anterior podía dejar equipos de un proyecto fuera del listado.

Este FIX introduce:

1. **Proyectos** como primera pantalla, con búsqueda, paginación y filtros combinables por **estatus** y **supervisor**.
2. **Equipos del proyecto** como segundo nivel, también paginado y respetando los filtros.
3. **Detalle individual** como tercer nivel, reutilizando el formulario, permisos, PATCH parcial, concurrencia y auditoría existentes.
4. Navegación de regreso a equipos y proyectos sin seleccionar registros de otros proyectos.
5. Tres lecturas nuevas de backend: `GET /api/instalaciones/administracion/filtros`, `GET .../proyectos`, `GET .../proyectos/:projectKey/equipos`.

**No agrega checkboxes ni guardado masivo:** la edición múltiple restringida al mismo proyecto corresponde al **FIX 3**; la mejora de formulario por equipo corresponde al **FIX 2**.

## Reglas de datos y seguridad

- Se reutiliza `ins_fl`. No hay nuevos SQL, tablas, columnas, índices, llaves maestras, permisos ni roles.
- Los equipos se agrupan **únicamente por `id_proyecto` (PP NS)**. Si el PP NS es nulo/vacío, cada registro permanece independiente. No se agrupan por coincidencias de nombre.
- El filtro **Supervisor** utiliza la FK `ins_fl.id_sup` → `usuarios.id_SB`; no supone equivalencia del campo legado `supervisor_fl`.
- Solo muestra registros del alcance existente CORELLIAN, por medio del Guard de Instalaciones y la capa de alcance ya usada por el módulo.
- Requiere `PROYECTO.VER` (o `PROYECTO.EDITAR`) para el navegador de proyectos. El filtro de supervisor también exige `RESPONSABLES.VER` (o `RESPONSABLES.EDITAR`). Las opciones sin permiso no se exponen; las peticiones manipuladas fallan cerradas.
- Los campos de la lista, búsqueda y ordenamiento se limitan por permisos efectivos. Las peticiones se parametrizan en MySQL.
- Las nuevas rutas son **GET**, no escriben en base de datos y no conceden permisos.
- El módulo conserva el aislamiento de sesión, modo Visor de solo lectura y auditoría de fases 4–6.
- El navegador tiene tamaños paginados de 20 proyectos y 30 equipos, máximo 50 resultados por petición.

## Archivos de código modificados (completos y con rutas del repo)

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
modules/instalaciones-administracion/instalaciones-administracion_cor.js
modules/instalaciones-administracion/instalaciones-administracion_cor.html
modules/instalaciones-administracion/instalaciones-administracion-form_cor.css
tests/instalaciones-administracion-fase3-frontend-base.test.js
tests/instalaciones-administracion-fase5-integracion-qa.test.js
tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js
```

**Archivo nuevo de pruebas:** `tests/instalaciones-administracion-fix1-redisenio-filtros.test.js`.

**Auxiliar local:** `ACTUALIZAR_CACHE_BUST_FIX_1.ps1` cambia *únicamente* los tokens del JS del módulo en `core/module-loader.js` y el token del loader en `index.html`. El `main` verificado conserva allí tokens Fase 3 aunque tiene código Fase 6; por eso el ajuste de caché es necesario. No se distribuyen archivos completos de esos dos componentes generales para evitar pisar cambios ajenos.

## Instalación local (sin despliegue automático)

1. Verificar que el repositorio local está sobre la versión base indicada y que no hay cambios propios sin resguardar.
2. Extraer el ZIP **en la raíz del repositorio**, sobrescribiendo exclusivamente las rutas incluidas.
3. En PowerShell, desde la raíz: `& .\ACTUALIZAR_CACHE_BUST_FIX_1.ps1`. Se aborta sin escribir si faltan archivos, no coincide la versión o los tokens de caché son inesperados.
4. Verificar `git diff --check` y `git status`; revisar los cambios de `core/module-loader.js` e `index.html`.
5. Desde la raíz ejecutar:

```powershell
node --test .\tests\instalaciones-administracion-fix1-redisenio-filtros.test.js .\tests\instalaciones-administracion-fase4-formularios-guardado.test.js .\tests\instalaciones-administracion-fase5-integracion-qa.test.js .\tests\instalaciones-administracion-fase6-aislamiento-sesion.test.js .\tests\instalaciones-administracion-fase3-frontend-base.test.js
```

6. Ejecutar también las validaciones globales del proyecto. Validar en entorno **Local**, después en **GitHub Pages**, y solo tras aprobación realizar promoción manual a **Netlify**; desplegar el backend en **Azure** antes de probar las nuevas rutas en línea.

## Pruebas ejecutadas y pendientes

**Ejecutadas en entorno aislado:** `node --check` de JS de backend y frontend, más **37/37 pruebas automatizadas** con dobles de MySQL, API y DOM de las suites FIX 1, Fase 4, Fase 5 y Fase 6. Pruebas de lectura, filtro por FK, permiso, alcance, paginación, regresión de edición, concurrencia y aislamiento de sesión. No se ejecutó la suite global ni la prueba histórica Fase 3 contra la estructura completa, por falta de copia local del repositorio completo.

**Pendiente:** prueba SQL de las 3 consultas reales en Aiven de laboratorio, integración en Azure, 403 para permisos y alcance reales, selección de un proyecto con varios equipos, filtros con valores reales, conflicto de concurrencia, prueba responsive/PWA y E2E. El dump de estructura del 07/10/2026 se utilizó solo como referencia; **no se ha confirmado el esquema activo en Aiven**.

**Estado de escrituras:** no se modificaron GitHub, Aiven, Azure ni Netlify. Solamente se generó este ZIP local.

## Pendientes del rediseño

- **FIX 2:** Detalle individual mejorado y guardado de varios campos del mismo equipo.
- **FIX 3:** Edición múltiple limitada **exclusivamente** a equipos del mismo proyecto, validada nuevamente en backend.
- **FIX 4:** Integración y QA final de permisos, auditoría, consistencia y concurrencia.
