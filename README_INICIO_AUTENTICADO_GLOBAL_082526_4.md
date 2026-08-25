# Inicio Autenticado Global 082526.4

## Objetivo

1. Evitar que el router restaure una ruta protegida antes de que Auth termine de restaurar/renovar la sesión.
2. Volver a mostrar la versión visible en la pantalla de Login, **debajo del recuadro blanco**, en texto gris y legible.

## Archivos afectados

- `core/router.js` — se modifica de forma controlada por el script de aplicación.
- `core/build-info.js` — se reemplaza por el archivo completo incluido en este ZIP.
- `index.html` — solo se actualizan los cache-busting de `core/build-info.js` y `core/router.js` para no sobrescribir cambios de 082526.2 / 082526.3.

## Cambio de navegación

Se elimina el fallback fijo de 800 ms que podía restaurar Panel de Control u otra ruta protegida mientras Auth todavía no tenía el JWT disponible.

Con `window.ManttoAuth` presente, la restauración inicial ocurre únicamente cuando se emite:

`mantto:auth-ready`

Si Auth no existe, se conserva el fallback de navegación para no bloquear una ejecución sin módulo Auth.

## Versión visible en Login

Se crea dinámicamente debajo de `.auth-card` un elemento de diagnóstico que muestra **solo** `MANTTO_BUILD_INFO.message`.

Ejemplo visible:

`3 Entornos 082526.1 - Config Netifly`

No muestra:

- proveedor (`NETLIFY`, `GITHUB`, etc.);
- SHA/commit;
- metadatos técnicos adicionales.

La metadata completa sigue disponible internamente para diagnóstico de Programador.

Estilo aplicado:

- centrado;
- fuera del recuadro blanco;
- gris `#B8C0CC`;
- 14 px en escritorio;
- 13 px en móvil.

## Aplicación

Desde PowerShell, con el ZIP extraído:

```powershell
.\APLICAR_INICIO_AUTENTICADO_GLOBAL_082526_4.ps1 -RepoPath "C:\RUTA\DE\TU\REPO"
```

Si ejecutas PowerShell ya ubicado en la raíz del repo, también puedes usar:

```powershell
.\RUTA_DEL_FIX\APLICAR_INICIO_AUTENTICADO_GLOBAL_082526_4.ps1
```

El script **no hace commit, push ni deploy**.

## Validación recomendada

1. Aplicar después de `Inicio Autenticado 082526.2` y `Sesión Resiliente 082526.3`.
2. Ejecutar `git diff -- core/router.js core/build-info.js index.html`.
3. Hacer el commit conjunto que deseas.
4. Desplegar manualmente Netlify.
5. Cerrar sesión: debajo del recuadro blanco debe aparecer únicamente el mensaje del último build/commit.
6. Dejar Panel de Control como última ruta, hacer `Ctrl+F5` con sesión activa y verificar que `/api/panel-control/bootstrap` salga después de Auth con `Authorization: Bearer ...` y `200`, sin el `401` prematuro.

## Validaciones incluidas

El script ejecuta, si Node.js está disponible:

- `node --check core/build-info.js`
- `node --check core/router.js`

También detiene la aplicación del parche si no encuentra exactamente el bloque de router esperado, para evitar modificar una versión incompatible.
