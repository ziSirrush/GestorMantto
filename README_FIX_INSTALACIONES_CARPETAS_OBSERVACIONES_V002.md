# FIX Instalaciones > Carpetas - Observaciones V002

Fecha: 18/08/2026

## Alcance corregido

1. Tablas 30x30
   - Carpetas registradas: 30 registros por pagina.
   - Proyectos sin carpeta: 30 registros por pagina.
   - Paginacion centrada.
   - Botones de paginacion con area minima 30 x 30 px.
   - Busqueda, filtro y paginacion trabajan sobre los datos ya cargados; no generan llamadas adicionales por cada cambio.

2. Proyectos sin carpeta
   - El universo sale de `ins_fl`, agrupado por `id_proyecto`, cubriendo Proyectos Activos + Proyectos Cerrados.
   - Se usa la misma regla vigente de Proyectos Cerrados: un proyecto es Inactivo/Cerrado cuando todos sus equipos tienen `estatus = '08-T'`; en otro caso se clasifica Activo.
   - La base de existencia de carpetas es `instalaciones_drive_carpetas` activa.
   - Como `instalaciones_drive_carpetas` no tiene `id_proyecto`, la comparacion previa a la relacion formal usa coincidencia exacta normalizada de `nombre_carpeta` contra `proyecto` o `id_proyecto`.
   - Una relacion activa ya existente en `instalaciones_proyecto_drive` tambien excluye el proyecto para mantener consistencia despues de una relacion manual.

3. Filtro Activo / Inactivo
   - Se agrega junto al buscador de Proyectos sin carpeta.
   - Valores: Todos, Activo, Inactivo.
   - Es un filtro local y no agrega consultas.

4. Detalle Proyecto Corellian
   - Clic o teclado sobre una fila de Proyectos sin carpeta abre `window.ManttoDetails.openProyecto(...)`.
   - Se reutiliza el detalle estandar Corellian; no se crea una vista de detalle propia para Carpetas.

5. Actualizacion fantasma al relacionar
   - El POST sigue siendo `/api/instalaciones/carpetas/relacion`.
   - En exito NO se vuelve a consultar `/api/instalaciones/carpetas/bootstrap`.
   - Se actualiza solo el estado local afectado:
     - la carpeta pasa a Relacionada;
     - el proyecto desaparece de Proyectos sin carpeta;
     - la carpeta desaparece del selector de disponibles;
     - el proyecto desaparece del selector de pendientes;
     - contadores y paginas se recalculan localmente.
   - Ante conflicto 409 se informa al usuario y se deja `Actualizar` como accion explicita; no se recarga automaticamente todo el modulo.

6. Interacciones
   - Se conserva el registro backend ya existente dentro de la misma transaccion de la relacion.
   - `tipo_interaccion = CREAR`
   - `modulo = instalaciones-carpetas`
   - `entidad = proyecto_drive`
   - Si la operacion falla y hace rollback, la Interaccion tampoco queda registrada.

## Archivos modificados

- `backend/src/modules/instalaciones-carpetas/instalaciones-carpetas.repository.js`
- `backend/src/modules/instalaciones-carpetas/instalaciones-carpetas.service.js`
- `modules/instalaciones-carpetas/instalaciones-carpetas_cor.html`
- `modules/instalaciones-carpetas/instalaciones-carpetas_cor.css`
- `modules/instalaciones-carpetas/instalaciones-carpetas_cor.js`
- `index.html` (solo cache-busting de CSS/JS del modulo Carpetas)

## No modificado

- Tablas SQL / esquema.
- Fase 0 de permisos.
- Rutas M2M de sincronizacion de Drive.
- `instalaciones-proyecto-drive`.
- Router general.
- Modulos en Nevera.

## Validaciones realizadas

- `node --check` en repository, service y frontend JS.
- Se verifico que ambas tablas usan `TABLE_PAGE_SIZE_COR = 30`.
- Se verifico que los botones de paginacion tienen 30 x 30 px.
- Se verifico que busqueda/filtro/paginacion no llaman API.
- Se verifico que el guardado exitoso aplica `applyRelationGhost_cor(...)` y no llama `refresh_cor(...)`.
- Se verifico que la Interaccion backend permanece dentro de la transaccion antes del `commit`.
- Se verifico que el clic de proyecto reutiliza `ManttoDetails.openProyecto`.

## Pendiente de validacion runtime

No se puede confirmar desde este entorno el contenido actual de Aiven ni que todos los nombres reales de carpetas coincidan exactamente con los nombres/IDs de proyecto. Tras deploy debe validarse con datos reales el listado de faltantes y una relacion completa.
