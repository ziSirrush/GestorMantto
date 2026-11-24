# BLT NOW / GestorMantto

Aplicacion modular de mantenimiento, operaciones, logistica, instalaciones,
ventas y cobranza. Frontend HTML/CSS/JavaScript; API Node.js/Express; datos
operativos en MySQL (Aiven). El backend online se publica en Azure. GitHub Pages
es validacion; Netlify es el frontend de produccion, con publicacion manual.

## Trabajo local

El frontend se sirve desde la raiz; `backend/server.js` inicia la API.
La configuracion local y los secretos van en `backend/.env`, nunca en Git.
Las dependencias y comandos declarados estan en `backend/package.json`.

Antes de preparar un commit, ejecutar `npm run check --prefix backend` y
`npm test --prefix backend`. Esta ultima orden ejecuta las suites unitarias,
de validacion, backend y contratos. Las pruebas de contrato no certifican Aiven
ni sustituyen la validacion funcional en un entorno autorizado.

## Publicacion

**Versionado obligatorio — reforma 2026-11-19.1.** Leer
[la norma operativa de doble fecha](docs/RELEASE_NOMENCLATURA_DOBLE_FECHA_Y_PERMISOS_V001.md#nomenclatura-aprobada)
antes de preparar una publicación. API y Frontend conservan fechas y revisiones
funcionales independientes; incrementar API nunca reinicia Frontend.
Usar `node tools/release-version.js bump api|frontend|both` según el impacto
real, y `node tools/release-version.js show` para obtener el mensaje exacto.
Los cambios sin impacto funcional conservan ambas versiones. Tras crear el
commit y antes del push, ejecutar `node tools/release-version.js verify --commit`.
Los dos pipelines aplican esa misma validación antes de desplegar.


Preparar el frontend con `node tools/build-frontend.js`. El build genera ambos
metadatos de despliegue directamente en **dist/web/core** y actualiza solamente
el `index.html` del artefacto. El destino es **dist/web**, no la raiz del repo;
los archivos fuente tracked permanecen estables.
El builder se detiene si el destino ya existe: no sobrescribe datos ajenos.
Retirar un build anterior generado o indicar un destino nuevo antes de repetir.

El artefacto de API incluye server.js, package.json, package-lock.json, src/ y
node_modules/. No necesita los SQL historicos, instaladores ni documentos.
La limpieza local no autoriza commit, push, despliegue, reinicio o cambios de BD.

## Politica de limpieza

No versionar instaladores, aplicadores de entregas antiguas, archivos SQL
archivados ni CSV de credenciales. Los SQL se retiraron del arbol por decision
explicita del responsable; ello no elimina ni modifica tablas de Aiven.
Conservar las consultas SQL que forman parte del codigo operativo de la API.

Conservar pruebas de seguridad y negocio vigentes, documentacion normativa,
contratos de alcance y herramientas operativas. Retirar snapshots de
arquitectura que contradigan al codigo actual y utilidades QA ligadas a casos
cerrados. No considerar muerto un endpoint M2M solo porque no lo llame el
navegador.

`backend/scripts/validate-clean-tree.js` audita `git ls-files` e impide
reintroducir archivos prohibidos sin castigar archivos locales correctamente
ignorados. `tests/limpieza-total-v003.test.js` verifica el retiro, la autoridad
Git y el empaquetado.

Las herramientas manuales conservadas tienen una ruta explicita: el respaldo
UTF8MB4 vive en `backend/scripts/backup-aiven-mysql.ps1`; el monitor de tickets y
los smokes de Instalaciones/CX se ejecutan con los scripts `qa:*` de
`backend/package.json`; la validacion M2M, el diagnostico UTF8MB4 y la generacion
VAPID usan respectivamente `validate:m2m`, `check:db:utf8mb4` y `generate:vapid`.

El historial Git y los artefactos ya publicados pueden contener copias antiguas.
Su saneamiento y la revocacion de credenciales requieren un procedimiento
separado; borrar el archivo actual no equivale a limpiar el historial.
