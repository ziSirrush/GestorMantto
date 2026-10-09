# Mantto Gestor - FIX 2 | Edicion fantasma con autoguardado V001

**Fecha:** 09/10/2026.  
**Identificador:** `FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001`.  
**Repositorio oficial leido:** `ziSirrush/GestorMantto`, rama `main`, commit `2e516699c42f870b730bbee712b437e72e9f4d8d`, `Version 100926.4` (09/10/2026).  
**Dependencia:** `FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001` **aplicado y autorizado**, incluido registro SQL del permiso global `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR`. La version de FIX 1 no estaba confirmada en `main` al crear este ZIP: instalarla ANTES de FIX 2.  
**Alcance:** SOLO interfaz del modulo Instalaciones > Administracion y pruebas que verifican su nueva semantica. No altera DB, backend, endpoints ni otros modulos.

## 1. Cambio funcional

- Abrir **Proyecto > Equipo > Detalle** muestra directamente los controles editables de las 11 secciones autorizadas. No requiere pulsar *Editar*.
- **Input texto, numerico o textarea:** al salir del campo (`focusout`/`blur`) se valida y, si cambio, se envia UN PATCH para ese campo. NO guarda por cada pulsacion de tecla.
- **Selectores y fechas:** se envia cuando cambia la seleccion. Pulsar Enter en un campo de una linea confirma mediante `blur`, sin enviar un formulario completo.
- No hay botones *Editar ficha*, *Guardar cambios del equipo* ni *Descartar cambios* en el detalle individual. El campo contiene avisos **Pendiente / Guardando / Guardado / Error** y **Reintentar guardado** cuando corresponde.
- Los cambios se envian por `PATCH /api/instalaciones/administracion/registros/:id/grupos/:grupo`, con **un solo campo** en `changes` y su valor original en `expected`. Conserva la validacion del FIX 1, el Guard CORELLIAN, el alcance, la auditoria transaccional en `usuario_interacciones` y los conflictos 409.
- Tras cada PATCH confirmado se hace inmediatamente `GET /registros/:id` para releer la fila autorizada. No se recrea el formulario mientras el usuario captura otros campos; los listados se actualizan al regresar, si quedaron desactualizados.
- Los guardados se **serializan** por ficha. Si el usuario cambia un campo mientras otro se guarda, no se mezclan equipos ni se pierden otros borradores. No se realizan reintentos automaticos en errores/conflictos. Ante 409 el usuario debe usar **Actualizar**. Si el PATCH se confirmo pero falla el GET, se muestra *pendiente de confirmar* (NO *Guardado*) y se bloquea el siguiente envio hasta refrescar.
- Si cambia un responsable/identidad y se pierde el alcance, la ficha se purga y la UI vuelve a los proyectos autorizados. Si cambia `id_proyecto`/`referencia_sitio`, la actualizacion del listado de proyecto es obligatoria al volver.
- La edicion de **varios equipos del mismo proyecto** sigue con el boton existente **Revisar y guardar lote**; nunca se autoguarda en lote.

**Permisos:** `ACCESO_VISUAL` para entrar y el permiso global explicito `.EDITAR` del FIX 1 para editar los 93 campos operativos; el nombre del rol no concede permiso por si solo. El Visor de Usuarios permanece en solo lectura. `id_ins_fl`, `created_at` y `updated_at` son tecnicos y no se editan. La autoridad de acceso es el backend.

## 2. Archivos incluidos (completos)

```
modules/instalaciones-administracion/instalaciones-administracion_cor.js
modules/instalaciones-administracion/instalaciones-administracion_cor.html
modules/instalaciones-administracion/instalaciones-administracion-form_cor.css
tests/instalaciones-administracion-fix2-detalle-equipo.test.js
tests/instalaciones-administracion-edicion-fantasma-v001.test.js
tests/instalaciones-administracion-fix2-autoguardado-v001.test.js
ACTUALIZAR_CACHE_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
EJECUTAR_QA_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
README_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.md
MANIFEST_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.txt
SHA256SUMS_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.txt
```

Las pruebas existentes `fix2-detalle-equipo` y `edicion-fantasma` se ajustaron porque sus afirmaciones previas de **guardado manual** ya no corresponden al comportamiento solicitado. Se conserva la cobertura de backend y del detalle. `edicion-fantasma-v001.test.js` puede ser archivo nuevo para clones donde no se instalo el FIX fantasma anterior.

## 3. Instalacion local segura

1. Antes de extraer, dentro del clon oficial ejecutar `git status --short`, `git rev-parse HEAD` y respaldar modificaciones propias. Si `main` avanzo o hay cambios concurrentes en estos archivos, **detener y reconciliar**, sin usar `reset --hard` ni sobrescribir. La referencia oficial usada para crear el paquete es el commit arriba indicado.
2. Validar el origen de los archivos de frontend ANTES de reemplazar (Git blob SHA con `git hash-object <ruta>`):

   | Archivo | SHA en main (origen aceptado) | SHA del FIX fantasma V001 (origen alterno aceptado) |
   |---|---|---|
   | `instalaciones-administracion_cor.js` | `39fb466587214732e990427665710e33465e94ce` | `a2e9123ac02778faf0ab66ad2eb10aeb0c754d6a` |
   | `instalaciones-administracion_cor.html` | `fa0b7061f00365ad27af05c82994bb81f71fc601` | `7fc01b65f7d962cae669a20ac5872a6d4716ee66` |
   | `instalaciones-administracion-form_cor.css` | `6328b2606eab1e6cca4a92c9b85729190c979022` | `f31daff73238fb78ec90f51dadf5ac40672fb593` |

   Solo aplicar si todos corresponden a una de las dos bases conocidas y el FIX 1 de backend esta aplicado; de otro modo solicitar reconciliacion, NO forzar la sobreescritura.
3. Extraer este ZIP en la **raiz** del clon manteniendo las carpetas. Sobrescribe unicamente los tres archivos de UI y los tests indicados. No incluye `core/module-loader.js` ni `index.html` completos porque contienen cambios de otros modulos.
4. En PowerShell, desde la raiz del repositorio:

   ```powershell
   & .\ACTUALIZAR_CACHE_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
   & .\EJECUTAR_QA_FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1
   git status --short
   git diff --check
   git diff -- core/module-loader.js index.html modules/instalaciones-administracion/
   ```

   El primer script SOLO reemplaza **un token versionado** de `instalaciones-administracion_cor.js` en `core/module-loader.js` y **un token** de `core/module-loader.js` en `index.html`. Valida prerequisitos antes de escribir, rechaza tokens desconocidos, es idempotente y restaura ambos archivos si falla la escritura. Version nueva: `20261009-instalaciones-administracion-autoguardado-fix2-v001`. El HTML utiliza `20261009-autoguardado-fix2-v001` para el CSS.
5. Validar en entorno local con usuario autorizado, sin permiso EDITAR, visor y usuarios fuera de alcance. Verificar capturas y auditoria en base de laboratorio antes de considerar GitHub Pages. Produccion Netlify requiere despliegue MANUAL luego de FIX 3.

## 4. Verificaciones reales y limites

- Se consulto `main` y se comparo el Git blob SHA de los 3 archivos frontend originales con la base de trabajo utilizada; el FIX 1 de backend provenia del ZIP entregado en el paso anterior.
- `node --check` en frontend y los tests offline con DOM/API y BD simulados: ver salida de pruebas de la entrega para el conteo exacto.
- Se comprobaron localmente los contratos de autoguardado, cola serial, `expected`, relectura, permisos, 409, errores y revocacion de alcance.
- **NO EJECUTADO/NO CONFIRMADO:** PowerShell en Windows, permisos reales en Aiven, despliegue backend Azure, navegadores/PWA, pruebas E2E, prueba GAS, despliegue GitHub Pages y Netlify. FIX 3 cubrira QA de integracion sobre entornos aprobados.

## 5. Riesgos y reversión

- Cambiar `id_proyecto` o `referencia_sitio` puede mover un equipo entre proyectos y chocar con el indice unico existente. El backend de FIX1 debe cancelar conflictos con 409 y auditoria consistente; validar con integraciones antes de produccion.
- Los campos derivados capturables segun FIX 1 podrian ser sobreescritos por procesos de importacion externos. No se promete sincronizacion bidireccional nueva.
- Para revertir el frontend, restaurar los tres archivos originales a partir de sus Git blob SHA base verificados y revertir manualmente los dos tokens de cache; no hacer `git reset --hard` ni borrar datos o auditorias. El backend y SQL de FIX 1 tienen reversión separada.
- **Sistemas modificados al generar este ZIP:** solo archivos locales bajo `/mnt/data`; **NO** GitHub, Azure, Aiven, Netlify ni GAS.

**Serie:** FIX 1 permisos/backend -> FIX 2 edicion fantasma + autoguardado (este) -> FIX 3 QA integral (pendiente).
