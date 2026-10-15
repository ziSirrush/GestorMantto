# BLT NOW — Customer Experience > Visitas — FASE 3 FRONTEND V001

**Entrega funcional de codigo JS/CSS integrado a la navegacion real de BLT NOW. No es un paquete de solo documentacion.**

- Fecha: 15/oct/2026.
- Repositorio destino: `ziSirrush/GestorMantto`, rama `main`.
- Base exacta leida: `c8923226b70f8bc63d13f14fc7390ba41599ddfc` (`Version 101526.4`).
- Blob `core/app.js`: `9c857a6fedf488ff5bf6c2f311a6df0fcd4ddd24`.
- Blob `index.html`: `6c71db21ab191ba346d02c6460d0cd8a5fc53043`.
- Nombre visible: **BLT NOW**, en GitHub Pages la PWA sigue siendo **BLT NOW GH**.
- Ruta existente reutilizada: `cx-visitas`. Backend real esperado: `/api/customer-experience/visitas`.

## 0. PRERREQUISITOS OBLIGATORIOS

1. **Fase 1 CX Visitas V001** aplicada/validada en Aiven: `cx_visitas`, `cx_visitas_historial` y permisos funcionales. No se confirma desde este entorno.
2. **Fase 2 Backend V001** aplicada al mismo clon de BLT NOW: archivos `customer-experience-visitas.*` y montaje de rutas en `backend/src/modules/customer-experience/customer-experience.routes.js`.
3. Backend Azure configurado con `CX_VISITAS_API_ENABLED=true` **unicamente despues** de verificar Fase 1 y permisos. Sin la variable, el backend sigue bloqueado (HTTP 503).
4. Los usuarios deben recibir los permisos mediante **Panel de Control**, NO los concede este ZIP. Para utilizar el listado se requieren `CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` y `CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER`, asi como puerta y alcance CORELLIAN.

**La Fase 3 no altera, crea ni borra tablas SQL.** No cambia Fase 2 ni crea API nueva. No modifica la visibilidad de Dashboard CX y Encuestas.

## 1. ALCANCE ENTREGADO

Interfaz completa bajo **Customer Experience > Visitas**:

- Listado paginado (25 filas) desde la API real, total y navegación Anterior/Siguiente.
- Filtros: texto (`q`), estado `BORRADOR`, rango UTC `desde/hasta`, ID de responsable.
- Detalle en dialogo, con campos reales de Fase 1 y visualización de fechas en zona `America/Mexico_City`.
- **Nueva visita**: formulario y `POST /api/customer-experience/visitas`.
- **Editar**: formulario y `PATCH /api/customer-experience/visitas/:id`.
- **Desactivar**: confirmación explicita y `DELETE /api/customer-experience/visitas/:id` (baja lógica en servidor).
- **Historial**: consulta `GET /api/customer-experience/visitas/:id/historial`, paginada, sin inventar eventos.
- Carga diferida de CSS/JS con `?v=20261015-fase3-v001`, sin cambiar `core/router.js` ni `core/module-loader.js`.
- Responsividad para escritorio, tablet y móvil: el listado se muestra como tarjetas accesibles en pantallas pequeñas (sin desplazar horizontalmente la acción **Ver detalle**). Sin estilos globales de Dashboard/Encuestas.
- Manejo de vacíos, HTTP 403/503, feedback de guardado y errores del servidor.
- Sidebar cerrado por defecto para Visitas; se habilita solamente cuando la consulta de la API permite ver el listado. El frontend NO es un mecanismo de autorización; el backend sigue siendo la puerta de seguridad.

### Contrato deliberadamente limitado al backend de Fase 2

- Estado: siempre `BORRADOR`. No se inventan estatus de `REALIZADA`, `CANCELADA`, reprogramaciones, resultados, check-in, adjuntos, GPS ni envío de correo.
- Campos editables: `titulo`, `objetivo`, `observaciones`, `referencia_origen`, `referencia_id`, `proyecto_nombre`, `cliente_nombre`, `ubicacion`, `fecha_programada_utc`, `id_usuario_responsable`.
- No se envia `estado`, `inactivo`, `resultado`, `fecha_realizada_utc`, `id_actor_usuario` ni `id_usuario_creador` desde el navegador.
- `referencia_origen` y `referencia_id` siempre se completan juntos si se utilizan.
- Responsable se ingresa por ID Corellian validado por backend. No se finge un catalogo de usuarios que Fase 2 no expone.
- **Captura de fecha/hora:** Ciudad de Mexico; se transforma a `ISO-8601 UTC` incluyendo historial de desfase -05/-06 cuando corresponde. **Filtros `desde/hasta`:** fechas UTC del contrato actual (se etiquetan explicitamente; se debe ampliar backend en un cambio posterior si se desean filtros de dias CDMX).
- El Visor de Usuarios oculta acciones de escritura; aun si se manipula la interfaz, Fase 2 las rechaza.

## 2. ARCHIVOS DEL ZIP

**Nuevos, colocados en rutas originales:**

- `modules/customer-experience-visitas/customer-experience-visitas.js` — pantalla real + peticiones.
- `modules/customer-experience-visitas/customer-experience-visitas.css` — responsive, clases exclusivas `cxv-*`.
- `tools/apply-cx-visitas-fase3-v001.cjs` — instalador Node idempotente y con SHA de base.
- `tests/cx-visitas-fase3.test.cjs` — tests de integrador, permisos, front y API simulada.
- `README_FASE_3_CUSTOMER_EXPERIENCE_VISITAS_FRONTEND_V001.md`.
- `MANIFEST_FASE_3_CX_VISITAS_V001.txt`.
- `docs/ROLLBACK_FASE_3_CX_VISITAS_V001.md`.
- `docs/CHECKSUMS_FASE_3_CX_VISITAS_V001.sha256`.

**Dos archivos existentes MODIFICADOS por el instalador al aplicar** (el instalador genera sus **contenidos completos**, NO usa un `git apply` a ciegas):

- `core/app.js`: añade enlace de ruta, carga diferida y verificación del menú; conserva Dashboard, Encuestas, Entregas y resto de código.
- `index.html`: actualiza **solamente** la query de version de `core/app.js` a `?v=20261015-cx-visitas-fase3-v001` para evitar PWA/caché con la version anterior.

**Por qué requiere ejecutar un instalador:** el fichero `core/app.js` no es reescrito en el ZIP sin comprobar antes su blob. El proceso produce el archivo modificado completo en el clon de trabajo. Evita sobreescribir otros commits posteriores del Gestor. Si alguno de los dos blobs cambio, **el instalador bloquea sin escribir**. El ZIP NO realiza cambios automaticos al extraerlo.

**No se alteran:** `core/router.js`, `core/module-loader.js`, Service Worker, `netlify.toml`, `manifest.json`, `manifest-github.json`, Dashboard CX, Encuestas, backend, Aiven, permisos SQL, rol_permisos, Azure, GitHub ni Netlify.

## 3. APLICACION SEGURA EN WINDOWS / POWERSHELL

**No aplicar directamente sobre una publicacion en vivo.** Usar un clon de trabajo limpio y respaldo/commit propio.

1. Confirmar Fase 2 instalada en el clon. Extraer el contenido de este ZIP sobre **la raiz** del repositorio (crea modulos nuevos, tools, tests, docs). Asegurarse de que Git no tenga cambios pendientes sobre `core/app.js` o `index.html`.
2. Comprobar el estado y los archivos base:

```powershell
git rev-parse HEAD
git status --short
git hash-object core/app.js
git hash-object index.html
```

Esperados **antes** de Fase 3: `9c857a6fedf488ff5bf6c2f311a6df0fcd4ddd24` y `6c71db21ab191ba346d02c6460d0cd8a5fc53043` respectivamente. Si no coinciden, **no forzar**, rebasar esta fase sobre la nueva version primero.

3. Validar sin cambios y ejecutar pruebas:

```powershell
node tools/apply-cx-visitas-fase3-v001.cjs --check
node --test tests/cx-visitas-fase3.test.cjs
```

4. Aplicar solamente cuando las comprobaciones sean correctas:

```powershell
node tools/apply-cx-visitas-fase3-v001.cjs
node --check core/app.js
node --check modules/customer-experience-visitas/customer-experience-visitas.js
git diff --check
git diff -- core/app.js index.html
git status --short
```

5. Publicar el frontend por el flujo normal BLT NOW y habilitar backend Fase 2 solamente si los prerrequisitos de Aiven/permisos estan comprobados. Las versiones GitHub Pages/Netlify conservan sus nombres de PWA diferenciados.

**Nota:** volver a ejecutar el instalador es seguro: informara `YA_APLICADA` y no duplicara la integracion.

## 4. PRUEBAS LOCALES (SIN SERVICIOS EXTERNOS)

- **20/20 pruebas Node aprobadas** al preparar el paquete: carga JS, integrador incremental/idempotencia, proteccion ante cambios en bases, seguridad de menu, permisos, Visor, XSS HTML, ID/SQL injection de consulta, timezone CDMX (actual e historica), paginacion, errores HTTP 503, formularios POST/PATCH, historial GET, desactivacion DELETE, cache-bust, precheck de Fase 2 y reapertura de Visitas sin listeners duplicados.
- Se comprobo desde GitHub (lectura) que los 3 anchors de `core/app.js` existen **una vez** en `main` 101526.4, y que el tag de `index.html` coincide con el blob indicado. El instalador se detiene si falla la comprobacion real al aplicarlo.
- **QA visual en Chromium headless completado con API simulada (NO backend real):** escritorio 1380 × 950, móvil 390 × 844; se cargó listado, se abrió detalle en móvil, se abrió el formulario en escritorio, se envió POST simulado y se recargó el listado (3 filas); ningún error de ejecución JavaScript. Se verificó visualmente que **Ver detalle** aparece sin desplazamiento horizontal en móvil. Las capturas de prueba son evidencia local y NO se publican dentro del paquete de código.
- **No se ejecutaron pruebas E2E con la API real**, pruebas contra Aiven, deploy Azure, Netlify/GitHub Pages, ni se pudieron confirmar permisos/roles reales. Esos escenarios pertenecen a Fase 4 QA.

## 5. CRITERIOS PARA FASE 4 / QA

Probar con roles: (a) permiso visual + VER, (b) sin permiso, (c) alcance Corellian parcial, (d) completo, (e) Visor, (f) acceso deshabilitado por feature flag.

Escenarios clave: sin registros; >=26 registros para paginacion; busqueda literal; conversion UTC/CDMX al guardar y volver a leer; responsable Corellian valido e invalido; confirmar/CANCELAR baja; historial de creacion/edicion/baja; doble guardado; salida/navegacion rapida; celular/tablet; instalacion y actualizacion PWA de GitHub Pages y Netlify; Dashboard y Encuestas intactos.

## 6. PUBLICACIONES O SISTEMAS MODIFICADOS

**Ninguno** durante la preparacion: solo se entregan archivos locales. No se realizaron commits, push, migraciones Aiven, cambios Azure ni despliegues. El ZIP por si solo NO instala ni habilita el modulo.

## 7. ROLLBACK

Ver `docs/ROLLBACK_FASE_3_CX_VISITAS_V001.md`. El rollback restaura exclusivamente `core/app.js` y `index.html` a sus blobs de la version base, y retira solo los activos nuevos de Fase 3. **No eliminar tablas o servicios de Fases 1/2.**
