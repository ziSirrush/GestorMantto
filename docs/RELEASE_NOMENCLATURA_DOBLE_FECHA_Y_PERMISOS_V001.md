# BLT NOW — Versionado independiente API + Frontend

## Autoridad de acceso

- Inicio y Usuarios: cualquier usuario autenticado.
- Panel de Control: roles activos `Programador` (maestro) y `Director General`, principales o secundarios.
- Agrupación Soporte: rol activo exacto `Soporte`, principal o secundario.
- Resto de agrupaciones y módulos: únicamente los permisos efectivos del catálogo de Panel de Control.
- Experimental NS: permisos individuales `EXPERIMENTAL_NS_*_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` y alcance territorial `UNITED`.
- Administración Cobranza United: permiso `COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

## Nomenclatura aprobada

La versión publicada combina dos versiones independientes:

```
Version <VER_API>.<VER_FRONTEND>
```

Cada parte usa `DDMMYY.N` con fecha de `America/Mexico_City`.

Referencia histórica de la publicación del 11/11/2026 (no es la versión actual):

- VER API: **111126.1**
- VER Frontend: **111126.1**
- Versión combinada: **111126.1.111126.1**

Los manifiestos versionados son:

- `config/releases/api.json`
- `config/releases/frontend.json`

Reglas:

**Reforma obligatoria 2026-11-19.1**, ratificada el 23/11/2026. Sustituye cualquier regla anterior que reinicie o incremente Frontend por una publicación de API.

- Un cambio exclusivamente API incrementa solo VER API. VER Frontend conserva su fecha y consecutivo completos.
- Un cambio exclusivamente Frontend conserva VER API e incrementa solo VER Frontend.
- Si cambian ambos componentes, se incrementa cada uno de manera independiente.
- Cada componente conserva la fecha de su última versión funcional. Solo al publicar un cambio funcional de ese componente en otra fecha inicia su propio consecutivo en `.1`.
- Si un componente no cambia funcionalmente, su versión se conserva. Actualizar `frontend.apiVersion` para enlazar la API es metadata, no una nueva versión funcional Frontend.
- Los reintentos de despliegue no generan una nueva versión. No existe una tercera versión global del repositorio.
- El mensaje completo del commit debe ser exclusivamente `Version <VER_API>.<VER_FRONTEND>`, una sola línea, sin cuerpo ni sufijos.

Ejemplo de cambio exclusivo de API: `181126.7.191126.18` pasa a `191126.1.191126.18`, **no** a `191126.1.191126.1`.

El motor obligatorio es `tools/release-version.js`. Clasifica los recursos funcionales por los artefactos reales: API (`backend/server.js`, `backend/src/` y dependencias de backend); Frontend (recursos web de `tools/build-frontend.js` y sus generadores). Los cambios únicamente de pruebas, documentación, manifiestos de versionamiento o CI no son una nueva versión funcional por sí solos. No confundir una ejecución de workflow con un cambio funcional.

### Regularización del 24/11/2026

Los commits `9cb8e38`, `8cfaa3f`, `308f91e` y `2bc55a7` modificaron ambos componentes; `72e1e64` modificó solo Frontend. El contador Frontend quedó reiniciado indebidamente en las publicaciones de API. El estado funcional se regulariza de `241126.4.241126.2` a `241126.4.241126.5`, sin alterar código funcional ni reescribir historial. La excepción de transición está acotada al SHA padre exacto y a esa única corrección de metadata.

## CI/CD separado por YML

- `main_mantto-gestor-api.yml` controla Azure y `config/releases/api.json`.
- `pages.yml` controla GitHub Pages y `config/releases/frontend.json`.
- Ambos validan el mensaje completo, los manifiestos y la transición frente al commit padre según los recursos funcionales modificados. Un reinicio indebido, un incremento omitido o una versión alterada sin cambio funcional se rechazan antes de publicar.
- La aplicación publica `version`, `apiVersion` y `frontendVersion`; `version` siempre es `API.Frontend`.

Comandos de trabajo:

```bash
node tools/release-version.js show
node tools/release-version.js bump frontend
node tools/release-version.js bump api
node tools/release-version.js bump both
node tools/release-version.js verify
# Después de crear el commit, antes del push:
node tools/release-version.js verify --commit
```

Respaldo anterior del CI/CD: rama `backup/ci-before-selective-20261109`, SHA `cb33a88051bb713576bd0b39899ca016b5d340f1`.
