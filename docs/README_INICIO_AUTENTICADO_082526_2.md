# Inicio Autenticado 082526.2

## Objetivo
Evitar que `estados-visuales` y `criticidad-corporativa` consulten endpoints protegidos antes de que Mantto Auth termine de restaurar/validar la sesion.

## Causa confirmada
`core/estados-visuales.js` iniciaba `load()` y `loadCriticidadCorporativa()` en `DOMContentLoaded`. `ManttoAuth.init()` tambien inicia desde `DOMContentLoaded`, por lo que las consultas podian salir sin JWT y responder HTTP 401.

Adicionalmente, `loadingPromise` y `criticidadPromise` quedaban retenidas despues de un intento fallido, impidiendo un reintento normal sin `force`.

## Archivos de proyecto afectados
- `core/estados-visuales.js`
- `index.html` (solo cambia los query-string de version/cache de `core/config.js` y `core/estados-visuales.js`)

## Cambios
1. Los fallbacks visuales siguen disponibles inmediatamente.
2. `load()` y `loadCriticidadCorporativa()` tienen una guarda interna: sin sesion autenticada no realizan consultas protegidas.
3. Las consultas protegidas se ejecutan despues del evento `mantto:auth-ready`.
4. Se contempla el caso en que `estados-visuales.js` se cargue despues de que Auth ya tenga token.
5. `loadingPromise` y `criticidadPromise` se liberan al terminar cada intento, permitiendo reintentos reales.
6. Se actualizan las referencias de cache de `config.js` y `estados-visuales.js` en `index.html`.

## No se modifica
- Backend Azure.
- Cookies / refresh token.
- Duracion JWT de 12 horas.
- Sesion absoluta de 90 dias.
- Permisos, alcance, modulos ni tablas.
- GitHub Pages / Netlify de forma automatica.

## Aplicacion manual
Extrae este ZIP fuera del proyecto. Desde PowerShell, ubicado en la raiz de tu copia local de `GestorMantto`, ejecuta el script indicando su ruta, por ejemplo:

```powershell
& "C:\RUTA\INICIO_AUTENTICADO_082526_2\APLICAR_FIX_INICIO_AUTENTICADO_082526_2.ps1"
```

El script valida las referencias esperadas antes de cambiar `index.html`, copia el archivo completo `core/estados-visuales.js` y se detiene si la estructura no coincide.

## Validaciones realizadas al paquete
- `node --check core/estados-visuales.js`: OK.
- El FIX no realiza commits, pushes ni deploys.

## Validacion posterior recomendada
```powershell
node --check core/estados-visuales.js
git diff -- core/estados-visuales.js index.html
```

Despues de publicarlo manualmente en Netlify, hacer un F5 limpio y comprobar que `/api/estados-visuales` y `/api/criticidad-corporativa` ya no generen 401 antes de `mantto:auth-ready`.
