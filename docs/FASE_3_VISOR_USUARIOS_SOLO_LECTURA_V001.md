# Fase 3 · Visor de usuarios · Solo lectura V001

## Base acumulativa

1. `ult ver 2235hrs - 0804.zip`
2. `FASE_1_VISOR_USUARIOS_NUEVA_PESTANA_V001.zip`
3. `FASE_2_VISOR_USUARIOS_IDENTIDAD_EFECTIVA_V001.zip`

## Hallazgo

La Fase 2 ya cargaba permisos, filtros y datos con la identidad del usuario visualizado, pero las operaciones de escritura todavía podían llegar a los endpoints usando la sesión real. Ocultar botones por sí solo no protegía la información.

## Cambios

### Backend

- Se agregó un middleware global de solo lectura antes de todas las rutas `/api`.
- En modo visor se permiten únicamente `GET`, `HEAD` y `OPTIONS`.
- Se bloquean globalmente `POST`, `PUT`, `PATCH` y `DELETE` con `HTTP 403` y código `VIEWER_READ_ONLY`.
- El bloqueo aplica aunque un módulo use una llamada directa distinta de `ManttoAuth.api`.
- La única mutación permitida es `POST /api/panel-control/viewer-close`, utilizada para registrar el cierre del visor.
- Se valida que el token temporal corresponda a la sesión real y al usuario visualizado.
- Se registran en `auth_audit`:
  - `VIEWER_SESSION_STARTED`;
  - `VIEWER_SESSION_CLOSED` al usar “Salir del visor”;
  - `VIEWER_MUTATION_BLOCKED` cuando una solicitud intenta modificar información.
- Los registros de auditoría no guardan el cuerpo de la solicitud ni datos sensibles.

### Frontend

- Se agregó `core/viewer-readonly.js` como protección general para todos los módulos.
- Se interceptan llamadas `fetch` de escritura antes de salir del navegador.
- Se bloquean formularios de guardado, comentarios y demás mutaciones dentro de la aplicación.
- Los controles terminales de escritura se muestran visualmente inactivos.
- Los botones que solamente abren formularios o detalles permanecen disponibles.
- Los filtros, navegación, acordeones, archivos y consultas permanecen habilitados.
- Los intentos bloqueados muestran el aviso: “Modo visor: esta acción es solo de consulta”.
- La franja del visor muestra el distintivo `SOLO LECTURA`.

## Archivos modificados

- `index.html`
- `styles/base.css`
- `core/user-viewer.js`
- `backend/src/app.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/routes/panel-control.routes.js`
- `backend/src/services/user-viewer.service.js`

## Archivos nuevos

- `core/viewer-readonly.js`
- `backend/src/middleware/viewer-readonly.middleware.js`
- `docs/FASE_3_VISOR_USUARIOS_SOLO_LECTURA_V001.md`

## Base de datos

No requiere SQL adicional. La auditoría utiliza la tabla existente `auth_audit` y sus encabezados reales:

- `usuario_id`
- `event_type`
- `event_details`
- `ip_address`

## Orden de aplicación

1. Publicar backend.
2. Confirmar `GET /api/health`.
3. Publicar frontend.
4. Abrir el visor desde una sesión autorizada.
5. Validar una consulta y después intentar guardar, comentar o cambiar un estatus; la operación debe responder `403 VIEWER_READ_ONLY` y no modificar Aiven.

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check`.
- `npm run check` del backend completado correctamente.
- Correspondencia entre `viewer-close`, controlador y exportación verificada.
- Montaje estructural de `/api/health` confirmado sin modificación.
- Pruebas simuladas del middleware confirmaron:
  - una solicitud normal no se bloquea;
  - una lectura del visor se permite;
  - una mutación del visor devuelve `403`;
  - el cierre del visor permanece permitido;
  - el intento bloqueado genera auditoría.
- Comparación contra la Fase 2 confirmó que solo se modificaron o agregaron los archivos indicados.

No se ejecutó el backend completo contra Aiven en este entorno. La instalación local de dependencias para una prueba de arranque fue impedida por el registro interno, que no tenía disponible `@azure/identity`; no se modificaron `package.json` ni `package-lock.json`.
