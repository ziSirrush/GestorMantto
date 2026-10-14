# FIX Tareas — Reorganización del formulario Home V001

Fecha: 14/10/2026  
Estado: cambios generados y validados localmente; sin despliegue  
Base revisada: `main` / `d6d150fe8c3ef746e68e636e17bb894a9305023c` (`Version 101326.7`)

## Alcance aplicado

Se reorganizó el formulario compartido de creación y edición de tareas personales y colaborativas. No se modificaron el detalle de tarea, comentarios, notificaciones, tablas ni columnas.

El orden implementado es:

1. Pendiente / Prioridad.
2. Descripción enriquecida.
3. Subtareas, controladas por checkbox.
4. Evidencia directa, siempre visible.
5. Seguimiento o Responsables, siempre visible.
6. Fecha compromiso, controlada por checkbox.
7. Vinculación, controlada por checkbox.
8. Cancelar / Guardar tarea.

En creación, los tres bloques opcionales inician cerrados. En edición se abren solo cuando existen datos persistidos de la sección. Ocultar y volver a mostrar una sección conserva el borrador local, pero guardar con la sección desmarcada envía valores vacíos y elimina asociaciones anteriores según el contrato existente.

## Reglas preservadas

- Tarea personal: Pendiente y Prioridad obligatorios.
- Tarea colaborativa: la prioridad sigue siendo definida por el responsable.
- Editor enriquecido, sanitización y pegado seguro sin cambios de contrato.
- Evidencia directa única, selección excluyente Imagen/Documento, máximo 25 MB y almacenamiento Azure existentes.
- `empresa` técnica se conserva cuando Vinculación está desmarcada.
- Solo quien posee ambas llaves maestras puede alternar CORELLIAN/UNITED.
- Proyecto y Equipo continúan validados por los resolutores de alcance existentes.
- No se crearon tablas, columnas, rutas ni sistemas de permisos alternos.

## Personas y seguridad

El catálogo autenticado de Seguimiento/Responsables ahora lista todas las cuentas activas, sin filtrarlas por empresa. Cambiar la empresa operativa solo actualiza Proyecto/Equipo y conserva las personas seleccionadas.

El backend valida cada inicial recibida:

- acepta cuentas activas existentes;
- rechaza identidades inexistentes o inactivas en asignaciones nuevas;
- permite conservar una asignación histórica inactiva que ya pertenecía a la tarea;
- mantiene el bloqueo de autoasignación del creador.

## Archivos modificados

- `modules/home/home.js`
- `styles/home.css`
- `backend/src/modules/pendientes/pendientes-project-scope.service.js`
- `backend/src/modules/pendientes/pendientes.service.js`
- `backend/src/modules/pendientes/pendientes.repository.js`
- `backend/package.json`
- `index.html`
- `tests/tareas-formulario-reorganizacion-v001.test.js`
- `README_FIX_TAREAS_FORMULARIO_HOME_V001.md`

## Validación local

Ejecutar:

```powershell
node --check modules/home/home.js
node --check backend/src/modules/pendientes/pendientes-project-scope.service.js
node --check backend/src/modules/pendientes/pendientes.service.js
node --check backend/src/modules/pendientes/pendientes.repository.js
node --test tests/tareas-formulario-reorganizacion-v001.test.js tests/home-rich-text.test.js
Set-Location backend
npm test
npm run check
```

La prueba dirigida cubre orden visual, tres checkboxes, limpieza del payload, conservación de empresa, catálogo transversal de usuarios, asignaciones activas/históricas, rechazo de identidades manipuladas, llaves maestras, Proyecto/Equipo, responsive y cache-bust.

Resultados obtenidos:

- Pruebas dirigidas de Tareas + editor enriquecido: 16/16 aprobadas.
- Suite oficial `npm test`, incluyendo la nueva prueba: 191/191 aprobadas.
- Validación estructural `npm run check`: aprobada.
- Revisión de sintaxis de los cuatro archivos JavaScript modificados y de la prueba: aprobada.

## Validaciones no ejecutadas

- No se escribió ni se consultó Aiven en vivo.
- No se cargaron archivos reales en Azure.
- No se desplegó a GitHub Pages, Netlify ni backend Azure.
- El E2E autenticado en PWA queda pendiente para el flujo de despliegue autorizado.

## Reversión

Restaurar exclusivamente los archivos enumerados desde la revisión anterior. No se requiere reversión de base de datos porque esta implementación no contiene DDL ni migraciones.

## Nota documental

La especificación cita `PROJECT_CONSTITUTION.md` v2.0. En esta copia del repositorio solo se encontró `docs/Fixeos/PROJECT_CONSTITUTION_REFERENCIA.md` v1.0; se respetaron además todas las restricciones expresas incluidas en la especificación V001 recibida.

