# FIX F5 SESION + API UNIFICADA V001

Fecha: 2026-08-20
Repositorio revisado: `JIVMBLT/updated_code`
Rama: `main`
Commit base verificado: `f4e7b56b25d4c34e67ccd17aaceacbe8f0e5687b` (`fix FASES DE ALCANCE 1 - 6 . 1`)

## Causa confirmada

`core/config.js` estaba usando dos backends al trabajar en local:

- Auth (`/api/auth/*`) -> backend local `:3001`.
- Consultas operativas -> Azure.

Un JWT generado por el backend local puede no ser valido para Azure si ambos entornos no comparten exactamente la misma configuracion de autenticacion. Al presionar F5, la restauracion de sesion podia validar Auth en local y despues recibir un 401 al consultar otro backend.

Ademas, `core/auth.js` destruia la sesion persistida ante cualquier error durante el bootstrap, incluyendo fallos temporales de red o respuestas 5xx.

## Cambios

### `core/config.js`

Se selecciona un solo backend por entorno y se usa tanto para Auth como para datos:

- `http://localhost:*`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x` y `172.16-31.x.x` -> backend local del mismo host en puerto `3001`.
- Frontend HTTPS (GitHub Pages/PWA) -> backend Azure actual.

Resultado esperado en desarrollo actual:

`http://192.168.1.40:5500` -> `http://192.168.1.40:3001` para Auth Y para consultas operativas.

### `core/auth.js`

- Un 401 real sigue cerrando la sesion.
- Un error de red o 5xx durante el bootstrap ya no elimina automaticamente token/usuario persistidos.
- En fallo temporal se conserva la sesion local y se permite que los endpoints protegidos vuelvan a validar el JWT cuando el backend/Aiven responda.
- Un error no-401 de acceso no borra la sesion persistida.

## No modificado

- Backend.
- Aiven.
- SQL/tablas.
- JWT_SECRET.
- Auth de 90 dias.
- Permisos/Alcance.
- Jobs de Portafolio/Push.
- Modulos funcionales.

## Requisito local

El backend local debe seguir ejecutandose con `NODE_ENV=development` para aceptar automaticamente origenes RFC1918, o `CORS_ORIGINS` debe incluir exactamente el origen local utilizado.

Ejemplo actual:

`CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://192.168.1.40:5500`

No usar `CORS_ORIGINS=*` si Auth utiliza `credentials`.

## Validacion realizada

- Base `core/auth.js` verificada contra blob GitHub `7da12d3d7c8f997b98039b8e8f0e7be308f78586`.
- Base `core/config.js` verificada contra blob GitHub `603560041d97b884792247c645b3d94e0bc49cb4`.
- `node --check core/auth.js`: OK.
- `node --check core/config.js`: OK.
- Prueba aislada de seleccion de backend:
  - `http://192.168.1.40:5500` -> API/Auth local `http://192.168.1.40:3001`.
  - `http://localhost:5500` -> API/Auth local `http://localhost:3001`.
  - `https://zisirrush.github.io/GestorMantto/` -> API/Auth Azure.

## Prueba runtime requerida

1. Reemplazar los dos archivos.
2. Confirmar backend local activo en puerto 3001.
3. Hacer `Ctrl+F5` para evitar cache del JS anterior.
4. Iniciar sesion.
5. Confirmar en Network que `/api/auth/me` y una consulta operativa usan el mismo host `192.168.1.40:3001`.
6. Presionar F5 y verificar que la sesion permanezca activa y los datos vuelvan a cargarse.

No puedo confirmar el resultado real contra tu Aiven local hasta ejecutar esta prueba en tu entorno.
