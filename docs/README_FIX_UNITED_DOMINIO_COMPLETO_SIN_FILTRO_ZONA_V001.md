# FIX - UNITED DOMINIO_COMPLETO sin filtro de zonas V001

## Base verificada

- Repo: `JIVMBLT/updated_code`
- Rama: `main`
- Commit: `c9815bca3f3bd1573e7ee35f49ba35f484d6b5e5`
- Mensaje: `fix FASES DE ALCANCE 1 - 11 . 2`

## Regla corregida

Antes:

`DOMINIO_COMPLETO UNITED` abria puertas, pero el usuario seguia limitado por `usuario_zop`.

Despues:

`DOMINIO_COMPLETO UNITED` abre las puertas UNITED autorizadas por el modelo y elimina el filtro territorial dentro de UNITED. No importa si el usuario tiene cero, una o varias zonas asignadas.

La llave NO sustituye los permisos funcionales de cada modulo/ruta.

## Archivos runtime modificados

1. `backend/src/services/alcance/alcance-uni.service.js`
   - master UNITED ya no consulta `usuario_zop`;
   - `requiere_filtro_zona` pasa a `false` para master;
   - `llave_maestra_ignora_zonas` pasa a `true` para master;
   - builders de Zona/Portafolio/Tickets devuelven alcance irrestricto solo para `llave_maestra === true`;
   - usuarios normales mantienen exactamente el filtro territorial.

2. `backend/src/services/alcance/informacion-cruzada.service.js`
   - una llave maestra ya validada no vuelve a ser limitada por `recordScopeCheck`;
   - el permiso funcional y la puerta siguen validandose antes del bypass.

## No se modifica

- GENERAL;
- CORELLIAN;
- `information-access-gnral.middleware.js`;
- rutas de Tickets;
- permisos funcionales;
- tablas o datos Aiven;
- frontend;
- M2M;
- `usuario_zop` para usuarios normales.

## Validacion incluida

`backend/scripts/test-fix-united-dominio-completo-sin-filtro-zona.js`

Comprueba:

1. master UNITED no consulta `usuario_zop`;
2. master UNITED devuelve `requiere_filtro_zona: false`;
3. Portafolio y Tickets master generan `1 = 1`;
4. master acepta cualquier zona valida;
5. usuario normal sigue consultando y filtrando `usuario_zop`;
6. usuario normal sin zonas sigue fallando cerrado (`1 = 0`);
7. informacion cruzada UNITED master omite el filtro por registro;
8. informacion cruzada UNITED normal sigue validando el registro/zona;
9. master no sustituye el permiso funcional.

## Aplicacion

Copiar el contenido del ZIP respetando la estructura de carpetas. Los unicos archivos que reemplazan codigo runtime existente son los dos indicados arriba.

## Limite de validacion

Las pruebas incluidas son locales y con mocks. No realizan consultas contra Aiven ni validan el despliegue vivo de Railway.
