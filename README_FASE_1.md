# FIX FASE 1 — Instalaciones · Administración — Tabla completa por proyecto

**Fecha:** 12/10/2026  
**Versión:** V001  
**Base exacta verificada en GitHub:** `ziSirrush/GestorMantto`, rama `main`, commit `c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e` (Version 100926.5).  
**Estado de entrega:** ZIP incremental para preparación local; **NO aplicado** a GitHub/Aiven/Azure/Netlify; pruebas integradas contra ambientes reales NO realizadas.

## Alcance de la Fase 1

El listado principal **Main de Instalaciones > Administración no cambia**: buscador, filtro de estatus/supervisor, lista de proyectos y acciones de Main siguen intactos.

**Al seleccionar un proyecto**, la pantalla secundaria *Equipos del proyecto* presenta una tabla horizontal con una fila por equipo y **todas las columnas del contrato autorizado de `ins_fl`** (campos de grupos que el usuario realmente pueda VER + campos técnicos de solo lectura). Se muestran todos los equipos **dentro del alcance** del proyecto seleccionado, en páginas de 30 registros, con Anterior/Siguiente. Los filtros del Main solo restringen qué proyectos aparecen, pero **NO se arrastran** para excluir equipos dentro del proyecto elegido.

- `P:<id_proyecto>` muestra únicamente los registros de ese PP NS.
- `R:<id_ins_fl>` conserva la regla existente de proyecto sin PP NS: un registro independiente.
- No se presenta el antiguo formulario individual al hacer clic en un proyecto.
- **Esta fase es solo lectura**: ninguna celda es editable, no hay selección masiva, autoguardado, ni endpoints nuevos de escritura; la edición fantasma es Fase 2 y la confirmación en Aiven es Fase 3.
- Los endpoints anteriores de edición permanecen instalados para compatibilidad; este FIX no les cambia sus reglas de autorización ni los llama desde la tabla.

### Seguridad

Ruta de consulta agregada:

`GET /api/instalaciones/administracion/proyectos/:projectKey/equipos/tabla?limit=30&offset=0`

- Conserva el Guard de sesión, permiso funcional, puerta CORELLIAN y alcance por registro existente.
- Reutiliza `getContract_cor`, `listProjectEquipments_cor`, `resolveVisibilityScope` y `scopeClause_cor` para **no reconstruir** un motor paralelo de permisos.
- Aplica **otra vez** filtro de proyecto y alcance en el SQL de datos completos. Solo selecciona columnas del contrato filtradas por el catálogo oficial de campos.
- No devuelve columnas de grupos ocultos, aunque el usuario altere peticiones/frontend; los IDs de otros proyectos tampoco deben filtrarse o exponerse.
- No crea tablas, columnas, índices ni permisos.

## Archivos afectados

Cuatro archivos existentes reciben transformaciones **de contenido completo** mediante el instalador, que opera con SHA de Git blob exacto (el ZIP NO incluye versiones truncadas de ellos):

1. `modules/instalaciones-administracion/instalaciones-administracion_cor.js` — render secundario y lectura de tabla.
2. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` — nueva GET con Guard existente.
3. `core/module-loader.js` — CSS nuevo + cache bust del script de Administración.
4. `index.html` — solo cache bust de carga de `core/module-loader.js` (sin cambios visibles de Main).

Dos archivos **nuevos y completos** se copian a su ruta oficial:

5. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js` — consulta de campos autorizados.
6. `modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css` — presentación de tabla responsiva.

Auxiliares de entregable: `installer/aplicar-fase1.js`, `installer/replacements/equipmentRows_cor.txt`, `tests/*.js`, README y manifest.

### Por qué esta entrega tiene instalador y no archivos existentes sobrescritos en el ZIP

Se leyó el último `main` mediante el conector GitHub, pero el entorno de generación no permite descargar directamente ese repositorio al contenedor. Para **no inventar, truncar o reconstruir incorrectamente** cuatro archivos grandes, se incluye un **aplicador determinista** que lee los archivos íntegros de tu copia de Git, exige que coincidan sus SHA oficiales y genera sus **versiones finales completas**. Un desajuste aborta ANTES de escribir. Esta es una entrega incremental con restricción técnica declarada, no una afirmación de que esos cuatro archivos completos ya están empacados.

## Instalación local (PowerShell)

1. Usa una copia actualizada y sin cambios locales de la rama `main` que tenga la versión base indicada. **No usar `git reset --hard` ni sobrescribir cambios propios.**
2. Descomprime el ZIP fuera del repositorio, por ejemplo en `Downloads\FIX_FASE_1_INSTALACIONES_ADMINISTRACION_TABLA_V001`.
3. Ejecuta estas instrucciones ajustando las rutas reales:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$FIX  = "$env:USERPROFILE\Downloads\FIX_FASE_1_INSTALACIONES_ADMINISTRACION_TABLA_V001"

node "$FIX\tests\instalaciones-administracion-tabla-fase1.test.js"
node "$FIX\tests\instalaciones-administracion-tabla-frontend.test.js"
node "$FIX\installer\aplicar-fase1.js" "$REPO" --check
if ($LASTEXITCODE -ne 0) { throw 'No aplicar: falla preflight o base diferente.' }

node "$FIX\installer\aplicar-fase1.js" "$REPO" --apply
if ($LASTEXITCODE -ne 0) { throw 'No se pudo aplicar la Fase 1.' }
Set-Location $REPO
git diff --check
git status --short
git diff -- modules/instalaciones-administracion/instalaciones-administracion_cor.js backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js core/module-loader.js index.html
```

El instalador **no hace commit, push ni despliegue**. `--check` no escribe nada. `--apply` solo modifica los seis archivos indicados.

El backend debe estar desplegado/autorizado antes de validar el frontend contra esa API, porque la tabla utiliza una nueva ruta GET. Sigue el flujo aprobado Local -> GitHub Pages -> Netlify, con producción manual. No realizar despliegue productivo sin QA.

## Pruebas y límites de esta entrega

Validado en el entorno de generación:

- `node --check`: instalador, servicio y render nuevo: PASS.
- Backend simulado, sin Aiven: 12 verificaciones de columnas/alcance/SQL: PASS.
- DOM simulado de tabla, sin red: 11 verificaciones de columnas, HTML escapado, no edición y paginación: PASS.
- Se verificaron las anclas únicas de los cuatro archivos originales contra `main` en GitHub; **no se ejecutó `--check` con un checkout real** en el contenedor.

**No verificado:** integración real E2E, permisos reales por usuario, disponibilidad y tiempos de consultas en Aiven, funcionamiento de producción, compatibilidad con cambios posteriores al commit base. Es obligatorio ensayar usuario con EDITAR, usuario solo lectura, visor y usuario fuera de alcance, así como proyectos grandes y sin PP NS.

## Reversión (únicamente tras revisar diff y confirmar que son cambios del FIX)

Restaurar los cuatro archivos versionados con Git y eliminar los dos archivos nuevos con un mecanismo de revert controlado. No ejecutar comandos destructivos sobre cambios ajenos. No hay migraciones de BD que revertir.

## Fases siguientes

- **Fase 2:** edición fantasma por celda, comparativo valor original/borrador, sin persistencia.
- **Fase 3:** guardado explícito/validación en backend, conflicto de concurrencia y auditoría; respetando permisos y recarga selectiva.
