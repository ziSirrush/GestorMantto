# SESION RESILIENTE 082526.3

## Objetivo

Evitar que Mantto Gestor destruya una sesion renovable valida de 90 dias cuando el JWT de acceso de 12 horas vence y el refresh falla temporalmente por red, proxy o Azure.

## Base verificada

- El JWT de acceso dura 12 horas.
- La sesion renovable en `auth_sessions` dura 90 dias.
- En Netlify, `/api/auth/refresh` ya fue validado con HTTP 200, JWT nuevo, usuario y CSRF.
- El problema pendiente estaba en la resiliencia del frontend: `core/auth.js` eliminaba el estado persistido al detectar un JWT de acceso vencido y algunos flujos de 401 terminaban cerrando la sesion aunque el refresh hubiera fallado solo temporalmente.

## Archivos incluidos

- `core/auth.js` completo.
- `index.html.patch` con el cambio de cache-busting para `core/auth.js`.
- `APLICAR_FIX_SESION_RESILIENTE_082526_3.ps1` para aplicacion manual.

## Cambios principales

1. `readPersistedActorSession()` ya no elimina token + usuario solo porque el JWT de acceso de 12 horas haya vencido.
2. Se conserva el vencimiento absoluto de 90 dias como limite local de la sesion.
3. Al arrancar con JWT vencido, primero se intenta `/api/auth/refresh`.
4. Si el refresh falla por red, `AbortError`, HTTP 408, 429 o 5xx:
   - no se ejecuta `clearSession()`;
   - se conserva token/usuario persistido;
   - se programa un nuevo intento de refresh en 60 segundos.
5. Un 401 de una API protegida ya no provoca cierre local cuando el refresh falla solo de forma transitoria.
6. Un refresh confirmado con 401/403 sigue siendo terminal y puede cerrar la sesion.
7. La validacion inicial `/api/auth/me` reutiliza el mismo criterio de resiliencia para fallos temporales.
8. `logout()` conserva su comportamiento actual: el usuario que pulsa cerrar sesion siempre cierra localmente.

## Comportamiento esperado

### Caso normal

JWT 12 h -> refresh 200 -> JWT nuevo -> misma sesion renovable.

### Falla temporal

JWT vencido -> refresh falla por red/5xx -> se conserva la sesion local -> reintento -> al recuperar conectividad se renueva.

### Sesion realmente invalida

Refresh 401/403 -> se limpia la sesion local -> se solicita login.

## Aplicacion junto con Inicio Autenticado 082526.2

Puedes aplicar ambos FIX y enviarlos en un solo commit.

Orden recomendado:

1. Aplicar `INICIO_AUTENTICADO_082526_2`.
2. Aplicar `SESION_RESILIENTE_082526_3`.
3. Revisar `git diff`.
4. Hacer un solo `git add`, `git commit` y `git push`.
5. Cuando decidas actualizar Netlify, hacer el deploy manual con Netlify CLI.

El segundo FIX no reemplaza `core/estados-visuales.js` ni revierte los cambios del primero. En `index.html` solo cambia la referencia de cache de `core/auth.js`.

## Validaciones realizadas

- `node --check core/auth.js`: OK.
- Se verifico que el FIX no modifica backend, SQL, permisos, rutas ni tablas.
- No se realizaron cambios automaticos en GitHub.
- No se realizo deploy automatico a Netlify.

## Pruebas recomendadas despues del deploy

1. Login nuevo en Netlify.
2. `/api/auth/refresh` manual debe responder 200.
3. F5 / Ctrl+F5 con sesion activa: no debe pedir login.
4. Cerrar y volver a abrir la pestana: debe restaurar sesion.
5. Simular temporalmente backend no disponible y comprobar que no se borren `mantto_token`, `mantto_user` ni `mantto_session` por un fallo transitorio.
6. Al restaurar backend, el refresh debe volver a funcionar sin iniciar sesion nuevamente.
