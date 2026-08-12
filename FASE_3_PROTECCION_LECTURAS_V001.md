# FASE 3 - Proteccion de lecturas autenticadas

## Base
- Version publicada de referencia: `Ult Ver 1506hrs - 0812.zip`
- Debe aplicarse despues de FASE 1 y FASE 2.
- Fuente funcional: `JIVMBLT/updated_code` / espejo `BLT_NOW`.

## Objetivo
Cerrar lecturas operativas que en la version publicada aun podian ejecutarse sin sesion valida, sin activar todavia la autenticacion M2M/HMAC de los SYNC.

## Archivos incluidos
1. `backend/src/modules/catalogos/catalogos.routes.js`
   - Aplica `requireAuth` a todo el router de catalogos.

2. `backend/src/modules/criticos/criticos.routes.js`
   - Sustituye lecturas con `optionalAuth` por autenticacion obligatoria a nivel router.

3. `backend/src/modules/proyectos/proyectos.routes.js`
   - Aplica `requireAuth` a todo el router de Proyectos.

4. `modules/proyectos/proyectos.js`
   - Ajuste de compatibilidad necesario detectado durante la auditoria.
   - El `fetchJson` de Proyectos ahora adjunta `ManttoAuth.authHeaders()` para que las nuevas rutas protegidas no generen 401 en usuarios autenticados.

## Hallazgo de auditoria
El archivo de Proyectos del frontend era identico entre la publicada y `updated_code`, pero su `fetchJson` no agregaba Authorization. Aplicar el `requireAuth` del backend sin este ajuste romperia el modulo Proyectos con HTTP 401. Por estabilidad, esta fase incluye el ajuste minimo de frontend aunque no represente una diferencia previa del repo.

Los consumidores de Estados Visuales, Criticos y detalles globales ya adjuntan los headers de autenticacion, por lo que no requieren cambios adicionales en esta fase.

## Fuera de alcance
- No se agrega `integration-auth.middleware.js` a rutas SYNC.
- No se activan guards HMAC.
- No se modifica `INTEGRATION_AUTH_ENABLED`.
- No se modifican controladores, servicios, permisos ni logica de negocio.
- No se cambia Notificaciones: su proteccion existente ya era equivalente funcionalmente.

## Estado Azure requerido
Mantener:

`INTEGRATION_AUTH_ENABLED=false`

## Validaciones realizadas
- `node --check` sobre los cuatro archivos JavaScript incluidos.
- Verificacion estatica de imports de `requireAuth`.
- Verificacion de que `modules/proyectos/proyectos.js` adjunte `ManttoAuth.authHeaders()`.

## Validacion posterior a aplicar
1. Reiniciar backend.
2. Confirmar `/api/health`.
3. Iniciar sesion normalmente.
4. Abrir Proyectos y confirmar carga sin HTTP 401.
5. Abrir Equipos Criticos / vistas relacionadas y confirmar carga.
6. Confirmar carga de catalogos/estados visuales.
7. Desde una sesion no autenticada, las lecturas protegidas deben responder 401.

No activar M2M/HMAC en esta fase.
