# BLT NOW · Experimental NS · Fase 6 · Actualización en vivo (piloto)

**Fecha:** 26/10/2026. **Estado:** preparado para aplicación local; NO desplegado.
**Código fuente de referencia:** `ziSirrush/GestorMantto`, `main` a `aaa1f1ed30798716d0885dee1692ce56b1583402` y archivos completos de entregas Experimental NS F1–F5 V001.

## Decisión

Sin modificar `core/data-sync.js`, `core/module-loader.js` o los tres módulos productivos, habilitar actualización de **Experimental NS** usando:

1. **Datos ya cargados en memoria de la pestaña**: al regresar a una vista, reutiliza sus DOM/tablas y filtros, sin repetir `init()` ni reiniciar la pantalla.
2. **GET de revisión ligera cada 30 s** únicamente en el módulo experimental activo y con internet, más comprobación al recuperar visibilidad o conexión.
3. **GET del módulo activo sólo cuando cambia la huella**, o revalidación completa obligatoria cada 120 s para cubrir cambios dentro del mismo segundo y omisiones de marcas de tiempo.
4. **Parcheo selectivo de las celdas visibles y detalles**; resaltado amarillo temporal (4.5 s). Mantener página, filtro, modal y foco. Cualquier `textarea`, `input`, `select` o elemento editable queda intacto ante una modificación del DOM recibida.
5. **Indicador superior no bloqueante**: «Consultando actualizaciones NS en Aiven», «Sin cambios», «Elementos visuales actualizados», «Sin internet». Es **solo para Programador** por permiso/agrupación experimental preexistentes.

### Seguridad y datos

- Nueva API de lectura: `GET /api/experimental-ns/live/{resumen-dia|equipos-criticos|proyectos-mantenimiento}/revision`.
- **JWT humano + actor Programador + permiso individual + puerta `EXPERIMENTAL_NS` + alcance territorial UNITED** en backend, con Guard general oficial.
- La revisión calcula una huella SHA-256 de agregados **dentro del alcance autorizado** (`COUNT`, `MAX(id)`, `MAX(updated_at/actualizado_en)`, `SUM` de marcas de tiempo). No expone filas, IDs ni marcas por separado.
- SQL operativo únicamente en `ns_portafolio_pruebas` y `ns_tickets_pruebas`; sin lecturas productivas, escritura, triggers, nuevas tablas, columnas ni índices.
- Caché exclusivamente **volátil por pestaña**, sin `localStorage`, `sessionStorage`, IndexedDB ni datos en disco. Al cerrar sesión o cambiar usuario efectivo/visor, se elimina la información presentada y los datos de memoria del módulo.
- Si falla la actualización, permanece la última vista cacheada con aviso de verificación pendiente; si hay HTTP 401/403, se elimina la vista. No existe fallback a tablas productivas.
- No se hace poll de rutas inactivas. Se consulta **Aiven, no NetSuite directamente desde el navegador**.

## Límites conocidos

- **Todavía no existe notificación push desde NetSuite/Azure**. Una vez que el emisor persista cambios en Aiven, el cliente los detecta por revisión cada 30 s; no se promete entrega instantánea.
- La revisión ligera depende de que las marcas `updated_at` y `actualizado_en` cambien; el refresco de 120 s reduce esta brecha, pero **no garantiza captura exacta de todos los eventos intermedios**.
- Cuando la huella cambia, el backend **recalcula el snapshot del módulo activo** (F3–F5). El cliente parchea solo los campos afectados; la carga diferencial de registros y la medición de costo/usuarios concurrentes corresponden a **F8**.
- Los módulos NS F3–F5 son de **solo lectura**. El ensayo de conservación de un borrador se validó insertando un `textarea` de prueba en el detalle abierto. **F7** añadirá autoguardado, manejo formal de conflictos e historial.
- Datos de las tablas NS pueden no incluir histórico suficiente para métricas anuales/U365. No se completan con datos de producción.

## Archivos de esta fase

**Nuevos:**
- `modules/experimental-ns/experimental-ns-live.js`
- `backend/src/modules/experimental-ns/experimental-ns-live.repository.js`
- `backend/src/modules/experimental-ns/experimental-ns-live.routes.js`
- `backend/tests/experimental-ns-fase6.test.js`
- Este documento y ADR correspondiente.

**Modificados completos:**
- `modules/experimental-ns/experimental-ns.js` (carga lazy F6)
- `modules/experimental-ns/experimental-ns.css`
- `modules/experimental-ns/resumen-dia/resumen-dia-ns.js`
- `modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js`
- `modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js`
- `backend/tests/experimental-ns-fase3.test.js` (mock de cargador F6).

**Montaje local controlado:** `backend/src/routes/index.js` recibe dos líneas nuevas mediante `COMANDOS_POWERSHELL.txt`, con SHA de prerequisitos, respaldo y rollback. No se entrega una copia de `index.js` obtenida de `main` porque su contenido local ya incluye las inserciones F2–F5.

## Validaciones realmente ejecutadas

- `node --check`: nuevos y modificados JS: **correcto**.
- `node --test backend/tests/experimental-ns-fase2.test.js ... fase6.test.js`: **86/86 aprobadas** con BD y auth simulados.
- Chromium headless local (API simulada) en las tres vistas: **3 escenarios aprobados**. En cada uno se verificó: cambio visible desde cache, detalle abierto, foco conservado, campo de comentario de prueba con contenido intacto y resaltado temporal.
- **No se realizó** E2E con Aiven/NetSuite/Azure, carga de usuarios, commit, push, SQL, escrituras ni despliegues.

## Validación manual pendiente en LOCAL

1. Aplicar F1–F5, después ZIP de F6 con los comandos.
2. Iniciar sesión como Programador autorizado, abrir Experimental NS y verificar el banner superior.
3. En un entorno de ensayo autorizado, provocar una variación de registro NS; el piloto detectará la diferencia en hasta aproximadamente 30 s después de la persistencia en Aiven (o 120 s con marca de tiempo no reflejada).
4. Abrir detalle y mantener un campo sin guardar mientras se produce una nueva revisión: no debe cambiar foco, desaparecer el detalle ni reiniciarse la vista.
5. Confirmar que ninguna consulta va a las rutas productivas y que al cerrar sesión ya no se conservan los datos visibles.

**Sin autorización explícita, no modificar registros reales para probar este piloto.**
