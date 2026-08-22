# FASE 6 - Activacion M2M y cierre

## Objetivo
Cerrar la incorporacion de `updated_code` sobre la version publicada activando la validacion HMAC solo despues de confirmar que Fases 1 a 5 estan desplegadas y estables.

## Archivos incluidos
- `backend/scripts/validate-m2m-auth.js`
- `backend/.env.example`

No se incluyen secretos ni valores reales de Azure.

## Precondiciones obligatorias
1. Fases 1 a 5 aplicadas en la version publicada.
2. Backend Azure arranca correctamente.
3. `/api/health` responde OK y Aiven conecta.
4. Login, refresh, `/api/auth/me` y logout funcionan.
5. Los SYNC siguen operando con `INTEGRATION_AUTH_ENABLED=false`.
6. Azure contiene los IDs y secrets M2M de Tickets, Portafolio, INS_FL, Logistica, Instalaciones Drive y Ventas.
7. Los emisores usan los mismos IDs/secrets y generan la firma HMAC con el contrato vigente.

## Activacion controlada
Cambiar en Azure App Service:

`INTEGRATION_AUTH_ENABLED=false` -> `INTEGRATION_AUTH_ENABLED=true`

Guardar los cambios y reiniciar el App Service antes de ejecutar las pruebas.

## Validador
El script `backend/scripts/validate-m2m-auth.js` verifica para cada integracion:
- ausencia de headers -> rechazo 401;
- Integration ID desconocido -> rechazo 401;
- timestamp vencido -> rechazo 401;
- firma incorrecta -> rechazo 401;
- firma correcta -> supera el guard HMAC.

El payload de prueba valido es deliberadamente vacio para no provocar mutaciones operativas. Una respuesta distinta de 401/403/404 en la prueba de firma valida confirma que el guard permitio avanzar al controlador; el controlador puede despues responder 2xx o 4xx por reglas propias del payload.

## Orden recomendado de validacion
1. FL / INS_FL
2. Tickets
3. Portafolio
4. Logistica
5. Instalaciones Drive
6. Ventas

Si una integracion falla, volver temporalmente `INTEGRATION_AUTH_ENABLED=false`, reiniciar Azure y corregir antes de continuar. No modificar secretos como mecanismo de rollback.

## Variables necesarias para ejecutar el validador
El entorno desde el que se ejecute el script debe disponer, sin imprimirlas, de los mismos IDs/secrets M2M usados en Azure. Opcionalmente puede definirse `M2M_BASE_URL`; si no se define, el script usa la URL productiva actualmente configurada en `updated_code`.

## Validaciones realizadas al generar este paquete
- `validate-m2m-auth.js`: `node --check` OK.
- Se preservo el `.env.example` de la base auditada; no contiene secretos reales.
- No se modifican controladores, servicios, rutas, frontend ni logica de negocio en esta fase.
- Esta fase requiere una accion manual en Azure para pasar el switch a `true`; el ZIP por si solo no activa M2M.

## Cierre posterior
Tras validar las seis integraciones con HMAC activo:
1. comprobar nuevamente `/api/health`;
2. comprobar login y navegacion normal;
3. ejecutar un SYNC real controlado por integracion;
4. comparar la version publicada resultante contra `updated_code` y clasificar cualquier diferencia residual como intencional, pendiente o error.
