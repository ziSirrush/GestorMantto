# BLT NOW | Customer Experience > Visitas | FASE 2 BACKEND V001

**Entrega real de codigo Node/Express, lista para integrar de forma incremental; no es solo documentacion.**

- Preparado: **15-oct-2026**, ChatGPT/OpenAI.
- Repositorio destino: `ziSirrush/GestorMantto`, `main`.
- **Base exacta revisada:** `c8923226b70f8bc63d13f14fc7390ba41599ddfc`, `Version 101526.4`.
- **Blob original del UNICO archivo existente que se modifica:** `backend/src/modules/customer-experience/customer-experience.routes.js` = `5452360c461237a55e5ae689c15709a23dfbf987`.
- Nombre visible del aplicativo: `BLT NOW`, PWA Netlify `BLT NOW`, PWA GitHub Pages `BLT NOW GH`. Se conservan los nombres/rutas historicos de codigo para compatibilidad.
- Dominio: `CORELLIAN`; agrupacion: `CUSTOMER_EXPERIENCE`; ruta funcional: `cx-visitas`.
- **Dependencia obligatoria:** FASE 1 CX Visitas V001 aplicada y validada en Aiven (tablas `cx_visitas`, `cx_visitas_historial` y cinco permisos de gestion activos). No se pudo verificar Aiven real desde este entorno.
- **Feature flag seguro:** `CX_VISITAS_API_ENABLED=true` para habilitar estos endpoints. Sin la variable o con otro valor, responden HTTP 503; no impide que funcionen Dashboard/Encuestas.

## Implementado: Fase 2, exclusivamente backend

**Seis rutas nuevas** bajo el montaje existente `/api/customer-experience/visitas`:

| Verbo | Ruta relativa a `/api/customer-experience` | Uso | Permiso adicional al visual |
|---|---|---|---|
| GET | `/visitas?page=1&page_size=25&q=&estado=BORRADOR&id_usuario_responsable=&desde=&hasta=` | Listado paginado con filtro de alcance | `CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER` |
| GET | `/visitas/:id` | Detalle activo | `...REGISTROS.VER` |
| GET | `/visitas/:id/historial` | Eventos, incluso despues de baja logica | `...REGISTROS.VER_HISTORIAL` |
| POST | `/visitas` | Crear borrador con identidad servidor | `...REGISTROS.CREAR` |
| PATCH | `/visitas/:id` | Modificar campos permitidos (sin alterar ciclo de vida) | `...REGISTROS.EDITAR` |
| DELETE | `/visitas/:id` | Baja logica; NO borra filas ni historial | `...REGISTROS.DESACTIVAR` |

**Siempre adicional:** `CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`. Los seis endpoints usan el Guard General humano del Gestor (`humanInformationGuard_gnral`, autenticacion JWT, permiso de accion, agrupacion `CUSTOMER_EXPERIENCE`, dominio `CORELLIAN` y alcance). No se utiliza bypass M2M ni la identidad del cliente para auditoria.

### Reglas conservadoras al no existir un flujo CX confirmado

La Fase 1 creo solamente un modelo generico, no una visita definida por reglas del negocio. Esta API **no inventa** resultados, cierre, reprogramaciones, tipos de visita, GPS, fotos, integracion con encuestas, WhatsApp o correo. Es un CRUD minimo y seguro sobre el esquema entregado.

- **Crear (POST)**: acepta `titulo` obligatorio; opcionalmente `objetivo`, `observaciones`, `referencia_origen`, `referencia_id`, `proyecto_nombre`, `cliente_nombre`, `ubicacion`, `fecha_programada_utc`, `id_usuario_responsable`. Si se informa `referencia_origen`, tambien debe informarse `referencia_id` y viceversa. El estado inicial siempre es `BORRADOR`.
- **Modificar (PATCH)**: admite solo esos mismos campos; campos omitidos permanecen intactos. Texto vacio opcional significa `NULL`; `titulo` no puede quedar vacio. Si no cambia ningun campo, no inserta un evento falso.
- **Prohibido en payload**: `id_visita`, `id_usuario_creador`, `id_actor_usuario`, `id_usuario_ultima_modificacion`, `estado`, `inactivo`, `resultado`, `fecha_realizada_utc`, `created_at`, `updated_at`, o cualquier otro campo ajeno a la lista blanca. Se rechazan expresamente con HTTP 400.
- **Responsable opcional**: debe ser un usuario activo de `Corellian SA de CV` (`usuarios.empresa` Corellian), validado antes de guardar. En alcance limitado tambien debe estar en `usuarios_visibles` de dicho alcance. No se permite asignar a usuarios de United u otros dominios. Si el modelo de identidad real usa otra representacion, validar/ajustar ANTES de activar la API.
- **Baja**: `inactivo=1`. Ya no aparece en el listado/detalle normales; su historial permanece consultable por usuarios con `VER_HISTORIAL` y el alcance correspondiente.

### Fechas y consultas

- `fecha_programada_utc` exige **fecha ISO-8601 con zona**: `2026-10-15T12:00:00Z` o `2026-10-15T06:00:00-06:00`. Se normaliza a UTC `YYYY-MM-DD HH:mm:ss.SSS` antes de insertar en MySQL `DATETIME(3)`. El `db.js` vigente ya interpreta `DATETIME` con `timezone:'Z'`.
- `desde`, `hasta` del listado se interpretan como **dias UTC** `YYYY-MM-DD` incluyentes, no como zona local del dispositivo. La UI de Fase 3 debera presentar/convertir explicitamente fechas locales.
- Paginacion `page >=1`, `page_size` entre 1 y 100 (default 25), desplazamiento acotado.
- `q` busca texto literal sobre titulo, proyecto, cliente y referencia; sin SQL concatenado de usuario ni comodines `%` controlados por cliente.
- Estado solo `BORRADOR` en esta fase. Otros estados requieren regla aprobada y ampliacion de API.

### Alcance por registro y Visor de Usuarios

- El Guard General resuelve el usuario **efectivo** (`req.contextUser || req.user`) y `req.informationAccess`.
- Con `acceso_dominio_completo=true`: lectura y gestion de todas las visitas del dominio, sujeta a los permisos especificos de cada ruta.
- En alcance de usuario: solo filas cuyo `id_usuario_creador` o `id_usuario_responsable` este incluido en `usuarios_visibles` devuelto por el Guard. Si no hay alcance valido, falla cerrado (403), nunca omite filtros.
- Con alcance limitado, **editar y desactivar** requiere ademas ser creador o responsable real de la visita; poder consultar visitas de subordinados no concede automaticamente edicion.
- Los registros ajenos al alcance responden **404**, sin revelar si existen.
- El Visor de Usuarios es siempre de solo lectura: el Guard rechaza escrituras y el servicio las rechaza de nuevo. La auditoria usa `req.actorUser.id_SB`, que el backend autentico asigna desde JWT; no admite `actor_id` desde payload.
- Los seis endpoints estan ocultos tras `CX_VISITAS_API_ENABLED`, incluso si alguien adivina su URL. **No se habilita el boton del frontend** en Fase 2.

### Persistencia y auditoria

- Escrituras con transaccion **en la misma conexion MySQL**: `beginTransaction()` -> registro -> `cx_visitas_historial` -> `commit()`, o `rollback()` completo en error.
- Lectura `SELECT ... FOR UPDATE` antes de editar/desactivar para impedir carreras sobre el mismo registro.
- Eventos `CREAR`, `EDITAR`, `DESACTIVAR` con actor real, ID de visita y solo **nombres de campos** cambiados en el JSON (no duplica nombres de clientes, comentarios u otra informacion personal).
- Queries parametrizados; ninguna identificacion SQL procede del cuerpo del cliente; busquedas y cambios usan lista blanca fija.
- No se alteran otras tablas, columnas ni permisos del esquema CX. No se asignan roles.

## Archivos entregados (ZIP extraible sobre raiz del repositorio)

**UN archivo existente MODIFICADO COMPLETO:**

- `backend/src/modules/customer-experience/customer-experience.routes.js`: solo agrega `router.use('/visitas', visitasRoutes_cor)` y su import; los endpoints preexistentes de Dashboard, Encuestas y sincronizacion permanecen intactos. **NO se modifica** `backend/src/routes/index.js` porque ya monta `/api/customer-experience`.

**CUATRO archivos NUEVOS de API:**

- `backend/src/modules/customer-experience/customer-experience-visitas.routes.js`
- `backend/src/modules/customer-experience/customer-experience-visitas.controller.js`
- `backend/src/modules/customer-experience/customer-experience-visitas.service.js`
- `backend/src/modules/customer-experience/customer-experience-visitas.repository.js`

**Pruebas y control de entrega NUEVOS:**

- `tests/cx-visitas-fase2.test.cjs` (pruebas de unidad/integracion con mocks, sin Aiven).
- `tests/cx-visitas-fase2-http-smoke.cjs` (smoke HTTP de solo lectura opcional, requiere instancia publicada y JWT).
- `README_FASE_2_CUSTOMER_EXPERIENCE_VISITAS_BACKEND_V001.md` (este archivo).
- `MANIFEST_FASE_2_CX_VISITAS_V001.txt`.
- `docs/ROLLBACK_FASE_2_CX_VISITAS_V001.md`.
- `docs/CHECKSUMS_FASE_2_CX_VISITAS_V001.sha256`.

**Sin modificaciones:** `core/app.js`, `core/router.js`, `core/module-loader.js`, `index.html`, `manifest.json`, Service Worker, PWA, Dashboard CX, Encuestas, Aiven, configuracion de permisos visuales y de Roles, Ventas/Instalaciones, Azure/Netlify/GitHub Pages.

## Pasos manuales para aplicar, sin sobrescrituras ciegas

1. **Respaldo del clon y Aiven:** confirmar Fase 1 aplicada y `02_SMOKE_FASE_1_CX_VISITAS_V001.sql` sin errores (tablas + cinco permisos nuevos). No desplegar Fase 2 si falta el esquema.
2. En el clon actualizado, comprobar HEAD exacto, y especialmente el SHA blob del archivo existente **ANTES de extraer**:

   ```powershell
   git rev-parse HEAD
   git hash-object backend/src/modules/customer-experience/customer-experience.routes.js
   ```

   Valores preparados: HEAD `c8923226b70f8bc63d13f14fc7390ba41599ddfc`, blob `5452360c461237a55e5ae689c15709a23dfbf987`. Si HEAD cambio, comparar rutas; si el blob cambio, **NO sustituir a ciegas**, sino integrar el montaje sobre el archivo nuevo.
3. Guardar copia del archivo `customer-experience.routes.js` ANTES de sobreescribir; extraer el ZIP en la raiz conservando rutas.
4. Confirmar con `git status --short`, `git diff --check` y `git diff -- backend/src/modules/customer-experience/customer-experience.routes.js` que solo se agrego el montaje de Visitas. Mantener y revisar cualquier cambio previo local.
5. Validar codigo y pruebas:

   ```powershell
   node --check backend/src/modules/customer-experience/customer-experience.routes.js
   node --check backend/src/modules/customer-experience/customer-experience-visitas.routes.js
   node --check backend/src/modules/customer-experience/customer-experience-visitas.controller.js
   node --check backend/src/modules/customer-experience/customer-experience-visitas.service.js
   node --check backend/src/modules/customer-experience/customer-experience-visitas.repository.js
   node --test tests/cx-visitas-fase2.test.cjs
   ```

6. Publicar **solo el backend** del proyecto manteniendo `CX_VISITAS_API_ENABLED` **apagado/no definido** y verificar que Dashboard, Encuestas y sus sync existentes sigan funcionando.
7. Con Fase 1 verificada y una identidad de prueba con permiso visual **mas** el permiso de accion deseado concedidos desde **Panel de Control**, habilitar en Azure `CX_VISITAS_API_ENABLED=true` y reiniciar la API.
8. Opcionalmente ejecutar **smoke SOLO LECTURA** contra el backend publicado con `BLT_API_BASE` (URL HTTPS) y `BLT_CX_VISITAS_TEST_TOKEN` (JWT de pruebas). Nunca escribir el token en archivos del ZIP ni en el repositorio.
9. Verificar pruebas funcionales con usuario de pruebas autorizado, usuario sin permiso, dos usuarios con alcances distintos, y Visor de Usuarios solo lectura. **No crear ni desactivar visitas de clientes reales para pruebas sin autorizacion.**
10. Fase 3 habilitara navegacion y vistas para los roles pertinentes. Fase 4 completara pruebas end-to-end y aprobacion operativa.

## Pruebas realizadas al construir el ZIP

- Sintaxis `node --check` en los cinco JS backend: **PASS**.
- `node --test tests/cx-visitas-fase2.test.cjs`: **12/12 PASS** (incluye paridad de blob anterior de `routes.js`, guardas, validacion, alcance, auditoria, rollback, baja, rechazo de SQL inyectado, bloqueo por defecto del feature flag).
- Sin dependencias externas instaladas: el suite usa mocks y `node:test` nativo.
- Sin pruebas HTTP reales contra Aiven, sin deploy, sin consulta del esquema real, sin `npm install`, sin push/commit en GitHub.

## Resultado y reversión

**Fase 2 entregada como codigo integrable. No desplegada, no activada en la nube, ni validada con Aiven real.** Leer `docs/ROLLBACK_FASE_2_CX_VISITAS_V001.md` antes de activar el flag. La reversión del backend **NO ejecuta** el rollback SQL de Fase 1 y **NO elimina registros**.

Siguiente: **FASE 3 - frontend** `Customer Experience > Visitas`, manteniendo branding BLT NOW y la ruta historica `cx-visitas`.
