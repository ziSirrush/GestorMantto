# Mantto Gestor - Fase 4 Movimientos Criticos - Integracion y Navegacion V002

## Estado

Esta entrega **sustituye por completo** a `FASE_4_MOVIMIENTOS_CRITICOS_INTEGRACION_NAVEGACION_V001.zip`.

La V001 no debe utilizarse como entregable de despliegue porque se entrego como parche. La V002 corrige el formato conforme a la Constitucion de Mantto Gestor: contiene los **archivos completos modificados**, conserva las rutas reales del repositorio e incluye solo los archivos afectados por esta fase mas esta documentacion.

## Fuente oficial revisada

Repositorio: `ziSirrush/GestorMantto`  
Rama: `main`  
Commit base verificado: `e5d0d3f5b7ab4bf85a3ed7d89557ee9566068a0c`  
Mensaje: `Version 100226.9`

Los cuatro archivos base fueron reconstruidos desde GitHub y validados contra sus Git blob SHA oficiales antes de modificarlos:

- `index.html` -> `531f490509d2439958eb383a8340fa1267cc9c1f`
- `core/module-loader.js` -> `53f3cb8bdfc7af4af101cbdbd456ba63a589272e`
- `core/router.js` -> `0ffd02829c74d7f11adae7e6fe7adf65717fe60d`
- `core/data-sync.js` -> `fa8b20f31d2f692ce49539e574c27d8dd3175d05`

## Prerrequisitos

Esta fase es incremental y asume aplicadas/preparadas las fases anteriores de Movimientos Criticos:

1. Fase 1: backend `/api/movimientos-criticos` y job semanal.
2. Fase 2: catalogo y permiso `OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
3. Fase 3: `modules/movimientos-criticos/` con HTML, CSS y JS.

Fase 4 no vuelve a incluir esos archivos porque no son modificados por esta fase.

## Archivos modificados

- `index.html`
- `core/module-loader.js`
- `core/router.js`
- `core/data-sync.js`

## Cambios

### index.html

- Agrega `Movimientos Criticos` dentro de la agrupacion `Operacion`.
- Usa el permiso exacto de Fase 2 mediante `data-permission-code`.
- Agrega el contenedor `view-movimientos-criticos`.
- Actualiza cache-busting de `data-sync.js`, `module-loader.js` y `router.js` a Fase 4 V002.

### core/module-loader.js

- Registra `movimientos-criticos` como ruta persistente.
- Registra lazy-load de:
  - `modules/movimientos-criticos/movimientos-criticos.css`
  - `modules/movimientos-criticos/movimientos-criticos.js`

### core/router.js

- Registra la etiqueta `Movimientos Criticos`.
- Agrega `showMovimientosCriticos()`.
- Integra la ruta `movimientos-criticos` al flujo normal del router.
- Conserva el modulo bajo `Operacion`, separado de `Movimientos Portafolio`.

### core/data-sync.js

- Registra `ManttoMovimientosCriticos` como objeto de sincronizacion de la ruta.
- Marca la vista dirty/refrescable solo ante mutaciones de `/api/movimientos-criticos`.
- No incorpora el modulo a las mutaciones generales de Tickets o Portafolio; un historico semanal cerrado no se reescribe por cambios posteriores de esos dominios.

## Instalacion

Copiar el contenido del ZIP sobre la raiz del repositorio conservando exactamente la estructura de carpetas.

Antes de reemplazar estos cuatro archivos, confirmar que no contienen cambios locales no versionados. Si existen cambios locales en alguno de ellos, no sobreescribir a ciegas: comparar/mergear primero.

Despues de copiar, revisar:

```powershell
git status
git diff -- index.html core/module-loader.js core/router.js core/data-sync.js
```

El diff esperado de esta fase es: **4 archivos modificados, 24 inserciones y 5 eliminaciones** contra el commit base indicado.

## Permiso

El acceso lateral depende exclusivamente de:

```text
OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

Fase 4 no concede el permiso a roles ni usuarios. Si el permiso no esta efectivo para la sesion, el modulo debe permanecer oculto.

## Alcance de esta entrega

No contiene ni ejecuta:

- SQL;
- cambios de tablas;
- backend;
- cambios de reglas 3 BLT / U35;
- cambios en Movimientos Portafolio;
- asignaciones de permisos;
- push a GitHub;
- despliegue a Azure, GitHub Pages o Netlify.

## Validacion realizada

**Validacion estatica/local:**

- coincidencia byte a byte de los cuatro archivos base con los Git blob SHA de `main`: PASS;
- `git diff --check`: PASS;
- `node --check core/module-loader.js`: PASS;
- `node --check core/router.js`: PASS;
- `node --check core/data-sync.js`: PASS;
- `node --check` del JS entregado en Fase 3: PASS;
- ruta lateral unica: PASS;
- permiso exacto unico: PASS;
- contenedor de vista unico: PASS;
- lazy-load CSS/JS: PASS;
- router/dispatcher: PASS;
- DataSync propio: PASS;
- sin IDs duplicados nuevos en `index.html`: PASS.

**No realizado:**

- prueba contra Aiven;
- despliegue;
- prueba E2E con sesion real;
- validacion visual final en GitHub Pages/Netlify.

Esas validaciones corresponden a las fases de pruebas posteriores.
