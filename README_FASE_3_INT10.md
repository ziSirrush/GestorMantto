# INT-10 | FASE 3 de 3 | Fotografias: permisos, visor, navegacion y cache | V001

Fecha del corte: **16 de octubre de 2026**. Estado: **archivos completos preparados localmente; NO aplicados ni desplegados**.

## Fuentes y dependencias verificadas

- Repo destino `ziSirrush/GestorMantto`, rama `main`, SHA **`d2eb24514c2ee5726ee215d6c9fb36daadd66bb3`**.
- LAB origen funcional `JIVMBLT/updated_code`, rama `main`, SHA **`70186ce81f5bf4c5d94d80caae088f6d1596538b`**.
- Previamente debe estar integrada la **Fase 1** (`FASE_1_INT10_FOTOGRAFIAS_MAPA_ESTADOS_V001.zip`) y la **Fase 2** (`FASE_2_INT10_FOTOGRAFIAS_CORE_UNI_V001.zip`). El JS de esta Fase 3 **reemplaza al JS completo de la Fase 2**, pero conserva sus funciones.
- El backend de Fase 2 debe estar operativo antes de consultar la nueva interfaz: requiere paginacion y filtros selectivos.
- Reglas: `PROJECT_CONSTITUTION.md`, apartados 7, 8, 9, 12, 14, 16, 17, 19, 23 y 24.

## Objetivo de esta fase operacional

Completar la integracion en la arquitectura del Gestor, sin importar los servicios SQLite del LAB, sin duplicar rutas, sin crear permisos en codigo y sin modificar la autoridad de autenticacion y alcance del backend existente.

### 1. Permisos efectivos y acciones de fotografia

- Se conserva la puerta **GENERAL** existente: `FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`, resuelta por el catalogo nativo de permisos, el menu y los Guards backend existentes.
- El acceso a leer la **galeria GENERAL** no concede automaticamente acciones sobre un proyecto CORELLIAN. Los objetos fotográficos CORELLIAN devueltos al carrusel se marcan editables solo cuando la navegacion CORELLIAN del usuario autoriza ese proyecto; los botones `Agregar` y `Seleccionar Foto Principal` obedecen esa misma restriccion. Las fotos UNITED siguen siendo de solo lectura en este carrusel.
- La **autorizacion final de escritura** permanece en el backend: requiere sesion efectiva, rol **Gestor de Fotografias** y alcance CORELLIAN del proyecto. Los controles visuales no sustituyen validaciones de servidor.
- Se declara `photoDomain:'CORELLIAN'` explicitamente al abrir el carrusel para evitar decisiones ambiguas de endpoint entre ambos origenes.
- El acceso al detalle CORELLIAN/UNITED conserva los guards de navegacion por dominio, IDs y equivalencias de la Fase 2.

### 2. Cambio de sesion, Visor y revocacion de permisos

- Al cambiar de identidad efectiva, expirar la sesion o autenticarse nuevamente se invalida el catalogo y se limpia el contenido de la vista para evitar conservar fotos de otra identidad.
- Se cierra el lightbox compartido cuando cambia la identidad (si estaba abierto).
- Se descartan lecturas de HTML/API que terminan despues del cambio de identidad, mediante revision de sesion y revision de catalogo.
- Si el permiso efectivo del Catalogo General se revoca y se notifica el cambio, se invalida la vista y se vuelve a Inicio usando el router existente.
- `module-loader` permite reinicializar esta vista especificamente despues de su invalidacion, sin modificar el ciclo de vida de otros modulos; `reload()` monta HTML nuevamente cuando falta.

### 3. Navegacion, carga de recursos y PWA/cache

- Se preserva la ruta `ventas-fotos-mapa`, la posicion del menu y el catalogo nativo de permisos; **no se crean ni duplican puertas**.
- Se versionan los recursos JS **y CSS** de Fotografias desde `core/module-loader.js` para que la PWA/navegador no utilice estilos del listado antiguo.
- `index.html` versiona exclusivamente los scripts globales modificados: `core/module-loader.js` y `core/router.js`.
- `core/router.js` modifica **unicamente el subtitulo de Fotografias** para evitar mostrar el origen tecnico Aiven antes de que se cargue el JS del modulo; la vista usa tambien ese subtitulo funcional. Los indicadores tecnicos solo corresponden al rol efectivo Programador, segun la Constitucion.
- Se mantiene la geometria SVG, atribucion CC BY 4.0, mapa, estilos, busqueda, filtros de estado, lectura de ambas empresas, equivalencias y carrusel ya incluidos en Fases 1 y 2.

## Archivos completos incluidos (solo cuatro modificados)

```text
modules/ventas-fotos-mapa/ventas-fotos-mapa.js
core/module-loader.js
core/router.js
index.html
README_FASE_3_INT10.md
```

El ZIP **no** incluye `.patch`, `.diff`, ejecutores, instaladores, PowerShell, preparadores, binarios, scripts de despliegue, migraciones LAB, datos ficticios, cambios SQL o backend sin modificar en esta fase.

## Incorporacion manual y precauciones

1. Comparar la copia de trabajo del Gestor con el commit de referencia. Si `main` avanzo, conciliar cualquier cambio posterior **antes de reemplazar** los archivos completos.
2. Confirmar que las entregas de **Fase 1 y Fase 2** esten ya integradas: recursos del mapa, JS/CSS/HTML de F1 y controlador paginado de F2.
3. Respaldar localmente los cuatro archivos existentes y colocar los cuatro archivos completos del ZIP en sus rutas originales. No copiar `README_FASE_3_INT10.md` como recurso cargado por la app.
4. No se requiere ejecutar instalador, script preparador ni `git apply`. El ZIP tiene la jerarquia de carpetas correcta.
5. El ciclo normativo posterior de pruebas es Local -> GitHub Pages -> Netlify (publicacion a Netlify **solo manual/autorizada**). Las pruebas no son una cuarta fase operacional.

## Resultados de validacion ejecutada

- **PASS:** `node --check` en los tres archivos JS completos de esta fase (incluido el router).
- **PASS:** pruebas contractuales locales con VM/sesion simulada: proyecto CORELLIAN fuera de alcance solo lectura; con alcance controles permitidos visualmente pero servidor conserva autorizacion; cambio de identidad y expiracion limpian DOM/lightbox; revocacion reinicia ruta; operacion asincrona previa descartada; menu no duplicado y versiones JS/CSS/HTML declaradas.
- **PASS:** suite de regresion funcional local de Fase 2 con backend y datos simulados: paginacion de 5,102 proyectos, equivalencias, union 7+7, estados y fallback. La prueba de contrato obsoleto **provoca deliberadamente un error registrado en consola** y comprueba cierre seguro; la suite termina con exit code 0.
- **NO EJECUTADO:** validacion autenticada E2E, navegadores reales, usuarios/roles reales, iOS/PWA/responsive en dispositivo, carga SQL real, Azure, GitHub Pages ni Netlify.
- **NO CONFIRMADO:** asignacion efectiva vigente de los ocho permisos de lectura de INT-10 al rol `DIRECTOR_GENERAL` en Aiven. El LAB los concede en su migracion 020, pero esa migracion incluye datos ficticios y **no se importa**. Confirmar permisos mediante las herramientas administrativas existentes antes de publicar, solicitar autorizacion aparte si faltan.

## Punto de seguridad que requiere decision antes de publicar

El contrato PREEXISTENTE del Catalogo General permite consultar fotografias de proyectos de ambos dominios usando la puerta funcional GENERAL, **sin filtro de alcance de registro CORELLIAN/UNITED en esa lectura global**. Los alcances por empresa aplican a navegacion/escritura. Esta Fase 3 NO amplia esa lectura ni cambia deliberadamente su politica. Su compatibilidad con el apartado 12 (Permisos y Alcance de Informacion, ESTRICTO) debe quedar confirmada mediante una decision formal de arquitectura/seguridad antes de habilitar en produccion. Si se decide aplicar alcance por registro a la galeria GENERAL, sera necesaria otra correccion aprobada del backend; no debe ocultarse este pendiente.

## Sistema afectado y reversion

- Archivos locales de esta entrega: **SI**, cuatro codigos completos y este README.
- GitHub `ziSirrush/GestorMantto`: **SIN CAMBIOS**.
- GitHub `JIVMBLT/updated_code`: **SIN CAMBIOS**.
- Aiven, Azure, GitHub Pages, Netlify: **SIN CAMBIOS**.
- Para revertir Fase 3 en copia local: restaurar el JS de Fotografias desde el ZIP Fase 2, y `core/module-loader.js`, `core/router.js` e `index.html` desde el estado base confirmado o su respaldo anterior a esta fase. Mantener Fases 1 y 2. No necesita revertir datos SQL.

## Integridad SHA-256 de archivos de codigo completos

- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`: `5f23a57a35dda63efa5a212ab09c74b17c90d15983a27e1bbe0dbd4cafbc6ade`
- `core/module-loader.js`: `0599d0ef12e4daecee779124c0b78c09d535a8bfa8128ec69bb8aa7ae1b59fe4`
- `core/router.js`: `c67b41506a67bbd3c2a7812cd7632ec32fc26d7d28a8782c653ded2fb7dc6df3`
- `index.html`: `e6d50775bbb5836775fed0254e8d9d857c886a5d4d57b6d14acfd878acb4e5a4`

**INT-10: las 3 fases operacionales estan entregadas como codigo, NO desplegadas. Pruebas y decision de seguridad preceden al deploy.**
