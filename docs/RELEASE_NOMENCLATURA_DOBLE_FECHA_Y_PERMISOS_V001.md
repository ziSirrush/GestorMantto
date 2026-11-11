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

Estado de esta publicación:

- VER API: **111126.1**
- VER Frontend: **111126.1**
- Versión combinada: **111126.1.111126.1**

Los manifiestos versionados son:

- `config/releases/api.json`
- `config/releases/frontend.json`

Reglas:

- Un cambio exclusivamente Frontend conserva VER API e incrementa VER Frontend.
- Una publicación API incrementa VER API y vuelve a enlazar Frontend en revisión `.1`.
- Al cambiar la fecha, el componente publicado reinicia su revisión en `.1`.
- No existe una tercera versión global del repositorio.

## CI/CD separado por YML

- `main_mantto-gestor-api.yml` controla Azure y `config/releases/api.json`.
- `pages.yml` controla GitHub Pages y `config/releases/frontend.json`.
- Ambos validan que el título del commit sea exactamente la combinación de los dos manifiestos.
- La aplicación publica `version`, `apiVersion` y `frontendVersion`; `version` siempre es `API.Frontend`.

Comandos de trabajo:

```bash
node tools/release-version.js show
node tools/release-version.js bump frontend
node tools/release-version.js bump api
node tools/release-version.js verify
```

Respaldo anterior del CI/CD: rama `backup/ci-before-selective-20261109`, SHA `cb33a88051bb713576bd0b39899ca016b5d340f1`.
