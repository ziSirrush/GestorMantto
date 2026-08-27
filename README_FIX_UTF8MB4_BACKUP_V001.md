# FIX_UTF8MB4_BACKUP_V001

Fecha: 27/08/2026  
Proyecto: Mantto Gestor  
Base de codigo: `c7b6bba7b3be8356b5277252c0bf5d9f88980cb6` (`Update Notificaciones 082726.2 - Notificaciones`)

## Objetivo

Cerrar el riesgo de corrupcion de caracteres de cuatro bytes detectado en `SABANA270826.sql` sin cambiar logica funcional de Notificaciones.

El snapshot de referencia fue generado con `/*!50503 SET NAMES utf8 */;` y los iconos criticos quedaron sustituidos por `?` / `??`, aunque las tablas de Notificaciones estan declaradas con `utf8mb4`.

## Archivos incluidos

- `backend/src/config/db.js`
- `backend/scripts/backup-aiven-mysql.ps1`
- `backend/scripts/validate-backup-utf8mb4.js`
- `backend/scripts/check-db-utf8mb4.js`
- `validation/utf8mb4-backup.test.js`
- `README_FIX_UTF8MB4_BACKUP_V001.md`

No se modifica ninguna tabla ni dato de Aiven.

## Cambio 1 - conexion backend

`backend/src/config/db.js` fija:

```js
charset: 'utf8mb4'
```

El charset no se deja configurable mediante una variable `DB_CHARSET`; se considera contrato tecnico del proyecto para evitar una regresion accidental a `utf8` / `utf8mb3`.

## Comprobacion real de la conexion

Despues de instalar el archivo `db.js` en Local, con las variables `DB_*` apuntando al Aiven autorizado, se puede ejecutar una prueba de solo lectura:

```powershell
node backend/scripts/check-db-utf8mb4.js
```

La prueba verifica que `character_set_client`, `character_set_connection` y `character_set_results` sean `utf8mb4`, y compara el texto + `HEX(icono_default)` de los cinco eventos criticos. No escribe datos.

## Cambio 2 - respaldo mensual

Se agrega `backend/scripts/backup-aiven-mysql.ps1` dentro de la carpeta de scripts ya existente en el repositorio.

Usa las mismas variables de entorno ya oficiales:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

El script ejecuta `mysqldump` con:

- `--default-character-set=utf8mb4`
- `--ssl-mode=REQUIRED`
- `--single-transaction`
- `--quick`
- `--routines`
- `--events`
- `--triggers`
- `--hex-blob`
- `--no-tablespaces`
- `--column-statistics=0`
- `--set-gtid-purged=OFF`

La contrasena se pasa temporalmente mediante `MYSQL_PWD` y se restaura al terminar; no se agrega `--password=...` a la linea de comandos.

Por defecto genera:

```text
./backups/SABANA_YYYYMMDD.sql
```

No sobreescribe un respaldo del mismo dia salvo que el operador use conscientemente `-Force`.

Ejemplo desde PowerShell con las variables `DB_*` ya cargadas:

```powershell
.\backend\scripts\backup-aiven-mysql.ps1
```

Destino alterno:

```powershell
.\backend\scripts\backup-aiven-mysql.ps1 -OutputDirectory "D:\Backups\GestorMantto"
```

## Cambio 3 - validacion automatica del dump

Despues de `mysqldump`, el script ejecuta:

```powershell
node backend/scripts/validate-backup-utf8mb4.js <ruta_dump>
```

La validacion falla cerrado si:

- no existe encabezado de `mysqldump`;
- el encabezado no declara `SET NAMES utf8mb4`;
- falta la marca final `Dump completed`;
- `notificacion_eventos` no esta en `utf8mb4`;
- falta cualquiera de los cinco eventos criticos actuales;
- alguno de sus iconos no conserva el valor esperado:
  - `PERSONA_ATRAPADA` -> `🚨`
  - `FALLA_EQUIPO_CRITICO` -> `🆘`
  - `NUEVO_EQUIPO_CRITICO` -> `💥`
  - `PERSONA_ATRAPADA_EQUIPO_CRITICO` -> `🚨🆘`
  - `PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO` -> `🚨💥`

Un archivo que se genero pero falla estas comprobaciones se conserva para diagnostico, pero NO debe marcarse como respaldo validado.

## Importante - restauracion

Este FIX valida integridad basica del archivo y la preservacion UTF8MB4. No sustituye la prueba mensual de recuperacion definida por la Constitucion.

El respaldo solo queda completamente validado despues de restaurarlo en un MySQL LAB y ejecutar smoke tests/conteos sobre esa restauracion.

`--set-gtid-purged=OFF` evita que el dump dependa de escribir `@@GLOBAL.GTID_PURGED` al restaurarlo en un laboratorio. No altera los datos de las tablas.

## Validaciones realizadas por Aster

- `node --check backend/src/config/db.js`
- `node --check backend/scripts/validate-backup-utf8mb4.js`
- `node --check backend/scripts/check-db-utf8mb4.js`
- `node --check validation/utf8mb4-backup.test.js`
- pruebas focalizadas `validation/utf8mb4-backup.test.js`
- validacion intencional de `SABANA270826.sql`: debe FALLAR porque contiene `SET NAMES utf8` y no conserva los emojis criticos.

No se ejecuto `mysqldump` real porque este entorno no dispone del binario/credenciales Aiven. No se probo sintaxis de PowerShell con `pwsh` porque no esta instalado en este entorno.

## Sistemas intactos

- GitHub: no modificado.
- Aiven: no modificado.
- Azure: no desplegado.
- GitHub Pages: no desplegado.
- Netlify: intacto.

## Compatibilidad con FIX 1

Este FIX no modifica ninguno de los archivos de `FIX_PUSH_CURSOR_ID_V001`, por lo que ambos fixes son independientes a nivel de archivos de aplicacion. Si se aplican sobre una rama que ya contiene FIX 1, no deben existir conflictos de contenido entre ambos.
