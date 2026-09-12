# FIX FASE 4 — Cobranza COR · Aditivas · Alta y Edición V001

Fecha: 12/09/2026

## Objetivo

Completar el flujo funcional de Aditivas de Cobranza CORELLIAN con alta y edición manual dentro de Mantto Gestor, conservando la vista de detalle ya aprobada y respetando la navegación global del sistema.

Este FIX incorpora:

- botón `+ Nueva Aditiva` en el listado;
- botón `Editar Aditiva` en la vista de detalle;
- un mismo formulario interno para alta y edición;
- edición precargada desde el detalle autorizado del backend;
- persistencia real en `cobranza_aditivas_cor`;
- Back únicamente mediante la barra contextual global del Gestor;
- bloqueo de escrituras cuando el usuario está usando el Visor de Usuarios en modo solo lectura.

No usa modales para alta, edición ni detalle.

## Base verificada

El FIX fue construido sobre `main` del repositorio `ziSirrush/GestorMantto`, verificado en el commit:

`a7fb848667d5af3cc8c82eaf31eef318daae810b`

Archivos base verificados por SHA de blob Git:

- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js` — `22169d766ae4c16e6c5ce2b8e975f1e021dc6719`
- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js` — `4e86d6cf16a89301fa7edeb3586f54e5a18d4068`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js` — `0686d060a2efcd714dfd4a9a180ebc14c4b977ef`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js` — `66b844507a9a363c1c3816cd4443777475c6a231`
- `core/module-loader.js` — `7729cd45efcebfcd9f1b93eb579bcdad68f15883`
- `modules/cobranza-cor/cobranza-cor-aditivas.js` — `3c8ab0bcb32f5b3cd31daa5e4ec8ec98bad20571`
- `modules/cobranza-cor/cobranza-cor-aditivas.css` — `3cd088628ab1ddf1aa311fdc5650dce4698513fd`

## Archivos modificados

El ZIP contiene únicamente archivos modificados completos y conserva sus rutas originales:

- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `core/module-loader.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.css`

No modifica `index.html`, `core/router.js`, SQL, estructura de tablas ni archivos de United.

## Navegación

Se reutiliza la ruta existente `cobranza-aditivas` y el historial nativo del Gestor.

- Listado: `cobranza-aditivas`
- Detalle: `cobranza-aditivas` con `{ id }`
- Nueva Aditiva: `cobranza-aditivas` con `{ mode: 'create' }`
- Editar Aditiva: `cobranza-aditivas` con `{ mode: 'edit', id }`

Esto permite que el botón Back de la barra contextual global sea la única navegación de regreso. No se agrega ningún `← Regresar a Aditivas` dentro de la vista.

`Cancelar` en el formulario conserva la semántica de cancelar la captura; cuando existe historial vuelve al destino anterior mediante el router.

## Frontend

### Listado

Se agrega `+ Nueva Aditiva` junto a las acciones del encabezado.

### Detalle

Se conserva la vista interna de detalle y se agrega `Editar Aditiva`.

El botón `Ver Estado de Cuenta` sigue utilizando exclusivamente el `id_indice_cor` estructurado devuelto por backend.

### Formulario compartido

El mismo formulario se utiliza para alta y edición. En modo edición los datos se consultan mediante:

`GET /api/cobranza-cor/aditivas/:idAditivaCor`

Se capturan los campos funcionales ya definidos por FASE 3:

- identificación;
- proyecto / PP / equipo / supervisor;
- descripción y comentario fuente;
- OV / OC / factura;
- importes y porcentajes;
- estatus de trabajos y cobranza;
- pagos, fecha y semana de pago;
- moneda y gasto ejercido.

El frontend no recalcula importes financieros. Los valores son validados y persistidos por backend.

## Backend funcional agregado

Se conservan los GET existentes:

- `GET /api/cobranza-cor/aditivas`
- `GET /api/cobranza-cor/aditivas/:idAditivaCor`

Se agregan:

- `POST /api/cobranza-cor/aditivas` — crea una Aditiva manual.
- `PUT /api/cobranza-cor/aditivas/:idAditivaCor` — actualiza una Aditiva existente con el formulario completo.

El endpoint de integración existente `POST /api/cobranza-cor/carga/aditivas` no se modifica.

## Seguridad y alcance

Las nuevas escrituras reutilizan el Guard funcional vigente de Aditivas:

- permiso verificado en `main`: `COBRANZA_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`;
- dominio: `CORELLIAN`;
- agrupación: `COBRANZA`;
- alcance de información: el resuelto por `humanInformationGuard_gnral`.

No se inventó un permiso nuevo.

El dump disponible `SABANA270826.sql` contiene para este módulo únicamente los códigos `COBRANZA_ADITIVAS`, `COBRANZA_ADITIVAS_ACCESO_VISUAL`, `COBRANZA_ADITIVAS_ACCESO_VISUAL_MODULO` y `COBRANZA_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`. No contiene un permiso separado de Crear/Editar para Aditivas. **No puedo confirmar si el Aiven vivo tiene un permiso CRUD adicional creado después del 27/08/2026**, porque este FIX no consulta ni modifica Aiven directamente.

### Reglas de escritura

- En Visor de Usuarios, POST/PUT son rechazados en backend con `403 VIEWER_READ_ONLY`; los botones también quedan inhabilitados en frontend.
- Para usuarios con alcance limitado, la Aditiva debe resolver de forma inequívoca un `id_indice_cor` dentro de su alcance autorizado.
- Si Proyecto/PP coincide con más de un INDICE, el backend responde `409` y no guarda.
- Si un usuario con alcance limitado no logra vincular la Aditiva a un INDICE autorizado, el backend responde `403` y no guarda.
- Para alcance de dominio completo, se conserva la semántica ya existente de FASE 1: si no existe coincidencia inequívoca con INDICE, la Aditiva puede quedar sin `id_indice_cor`.
- No se infiere alcance por similitud textual desde frontend.
- Aditivas continúa separada de los totales contractuales de Suministro/Instalación.

## Persistencia

Se reutiliza exclusivamente la tabla existente:

`cobranza_aditivas_cor`

No se crea ninguna tabla ni columna nueva.

La actualización usa una lista fija de columnas autorizadas; el identificador y `activo` no se aceptan desde el formulario como columnas arbitrarias de actualización.

## Validaciones realizadas

Validación estática ejecutada sobre los archivos finales:

- `node --check` OK en los cuatro archivos backend modificados;
- `node --check` OK en `core/module-loader.js`;
- `node --check` OK en `cobranza-cor-aditivas.js`;
- balance de llaves CSS verificado;
- rutas GET existentes preservadas;
- rutas POST/PUT CRUD verificadas;
- mismo Guard CORELLIAN aplicado a lectura y escritura;
- bloqueo de mutación en Visor verificado;
- resolución estructurada a INDICE y fallo cerrado para alcance limitado verificados;
- botón `+ Nueva Aditiva` verificado;
- botón `Editar Aditiva` verificado;
- formulario compartido create/edit verificado;
- ausencia del botón interno `Regresar a Aditivas` verificada;
- ausencia de referencias a `cobranza-uni`, `/api/cobranza-uni` y `/pc/` en los cambios del módulo verificada;
- no se incluye ningún archivo `.patch`.

## No ejecutado

- No se hizo deploy.
- No se escribieron cambios en GitHub.
- No se escribieron cambios en Aiven.
- No se modificó Azure ni Netlify.
- No se realizó prueba E2E contra el backend desplegado.
- No se ejecutó INSERT/UPDATE real en una base de datos.

## Instalación

Copiar los archivos completos del ZIP sobre el repositorio respetando exactamente la estructura de carpetas.

Después de aplicar:

1. revisar `git status`;
2. ejecutar las validaciones locales del backend/frontend;
3. desplegar backend para habilitar POST/PUT;
4. desplegar frontend;
5. probar con un usuario autorizado: listado → Nueva → guardar → detalle → Editar → guardar → Back contextual.

## Rollback

Restaurar desde Git las siete versiones anteriores de los archivos indicados en este README.

No requiere rollback de base de datos porque el FIX no modifica esquema, tablas ni permisos.
