# BLT NOW — Versionado de doble fecha y permisos del menú (2026-11-09)

## Autoridad de acceso

- Inicio y Usuarios: cualquier usuario autenticado.
- Panel de Control: roles activos `Programador` (maestro) y `Director General`, principales o secundarios. No se extiende a `Programador United` ni `Programador Corellian`.
- Agrupación Soporte: rol activo exacto `Soporte`, principal o secundario. No equivale a `Coordinador de Soporte` ni `Supervisor de Soporte`.
- Resto de agrupaciones y módulos: únicamente los permisos efectivos del catálogo de Panel de Control. No existen excepciones por nombre, correo ni ID de usuario.
- Experimental NS: permisos individuales `EXPERIMENTAL_NS_*_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`; además, el backend mantiene autenticación, puerta de información, ámbito y alcance territorial `UNITED`, sin permiso automático por rol.
- Administración Cobranza United: menú por `COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`. Dentro del módulo, el backend conserva permisos adicionales de consulta y edición por tabla.

## Nomenclatura aprobada

Formato publicado: `DDMMYY.R_API.DDMMYY.R_FRONT`.

Ejemplo del primer fix integrado:
- Versión API: **091126.6**.
- Versión frontend: **091126.1**.
- Versión combinada: **091126.6.091126.1**.

El último despliegue API anterior usaba `Version 110926.5` (formato antiguo MMDDYY). En esta transición se interpreta como el 09/11/2026 revisión 5; el siguiente despliegue de API es revisión 6. No se reescribe el historial de commits anteriores.

En un cambio exclusivamente frontend, la versión API se mantiene; el contador frontend sube uno el mismo día y reinicia a 1 al cambiar de fecha según `America/Mexico_City`. En una publicación de API, cambia la versión API y el frontend se vuelve a publicar enlazado a la nueva base, reiniciando el contador frontend a 1.

Los manifiestos versionados son:
- `config/releases/api.json`
- `config/releases/frontend.json`

Comandos de trabajo desde la raíz del repositorio:

```bash
node tools/release-version.js show
node tools/release-version.js bump frontend
# O para una actualización API:
node tools/release-version.js bump api
node tools/release-version.js verify
```

El comando `verify` valida la consistencia y, en GitHub Actions de tipo `push`, exige que el título del commit sea exactamente `Version <version_combinada>`. Por ejemplo:

```bash
git commit -m "Version 091126.6.091126.1"
```

Los workflows de CI/CD siguen separados por dominios:
- `config/releases/api.json` y `backend/**` activan Azure.
- `config/releases/frontend.json` y los recursos del frontend activan Pages.

Los dos pipelines también se disparan si cambian los componentes compartidos de CI. El nombre visible de cada ejecución de GitHub Actions procede del mensaje del commit; el frontend empaquetado además contiene `apiVersion`, `frontendVersion` y `version` en `core/build-info.generated.js`.

**Precaución:** un commit con backend y frontend ejecuta ambos workflows. La publicación solo está comprobada cuando ambos terminan correctamente y se valida en Azure y Pages. Que un commit cambie de versión no demuestra por sí mismo que la API esté publicada.

Respaldo anterior del CI/CD (sin alteraciones): rama `backup/ci-before-selective-20261109`, SHA `cb33a88051bb713576bd0b39899ca016b5d340f1`.
