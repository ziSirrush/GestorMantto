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
`npm test --prefix backend`. Las pruebas de contrato no certifican Aiven ni
sustituyen la validacion funcional en un entorno autorizado.

## Publicacion

Generar metadatos con `tools/generate-build-info.js` y
`tools/generate-change-audit.js`, y preparar el frontend con
`node tools/build-frontend.js`. El destino es **dist/web**, no la raiz del repo.
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
contratos de alcance y herramientas operativas. No considerar muerto un
endpoint M2M solo porque no lo llame el navegador.

`backend/scripts/validate-clean-tree.js` impide reintroducir los archivos
prohibidos. `tests/limpieza-total-v002.test.js` verifica el retiro y el empaquetado.

El historial Git y los artefactos ya publicados pueden contener copias antiguas.
Su saneamiento y la revocacion de credenciales requieren un procedimiento
separado; borrar el archivo actual no equivale a limpiar el historial.
