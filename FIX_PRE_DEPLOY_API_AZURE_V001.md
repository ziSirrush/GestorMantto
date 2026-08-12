# FIX PRE-DEPLOY API AZURE V001

## Objetivo
Corregir los bloqueos detectados antes del deploy y dejar la versión publicada orientada a la API de Azure.

## Archivos incluidos
- `backend/package-lock.json`
- `backend/src/middleware/historical-sync.middleware.js`
- `backend/src/middleware/raw-body.middleware.js`
- `backend/src/modules/notificaciones/notificaciones.routes.js`
- `core/config.js`
- `.gitignore`
- `ELIMINAR_ANTES_DEL_DEPLOY.txt`

## Decisiones
- `core/config.js` publicado apunta exclusivamente a la API Azure.
- `backend/.env` NO se incluye ni se modifica: permanece como diferencia de entorno.
- `backend/sql/20260810_AUTH_SESSIONS.sql` NO se reemplaza: la versión pre-deploy conserva `usuario_id BIGINT`, consistente con `usuarios.id_SB` en Aiven.
- `modules/proyectos/proyectos.js` NO se reemplaza: conserva el ajuste de Fase 3 que agrega `ManttoAuth.authHeaders()` para evitar 401 al proteger las rutas de Proyectos.
- `.github/workflows/main_mantto-gestor-api.yml` se conserva; es infraestructura de deploy y no se elimina en este FIX.
- Los dos CSV de passwords temporales deben eliminarse del repositorio antes del deploy.
- `INTEGRATION_AUTH_ENABLED=false` debe mantenerse durante el deploy inicial.

## Validaciones realizadas
- `node --check` sobre los JS incluidos.
- `package.json` y el bloque raíz de `package-lock.json` tienen las mismas dependencias y versiones declaradas.
- El `core/config.js` incluido no contiene localhost y apunta a Azure.
- No se incluyen secretos ni `.env` en el ZIP.
