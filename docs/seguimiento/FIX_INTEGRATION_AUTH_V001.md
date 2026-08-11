# FIX_INTEGRATION_AUTH_V001_COMPLETO

Proyecto: Mantto Gestor  
Fecha: 11/08/2026  
Autor técnico: Aster  
Firma: ASTER-MG  
Estado: FIX GENERADO — NO APLICADO A GITHUB

## Objetivo
Preparar autenticación M2M por HMAC para futuras rutas `/sync`, sin activar todavía el bloqueo.

## Archivos modificados
- `backend/src/app.js`
- `backend/src/middleware/raw-body.middleware.js`
- `backend/src/middleware/integration-auth.middleware.js`

## Comportamiento actual
Con `INTEGRATION_AUTH_ENABLED=false`, `requireIntegrationAuth` hace bypass y no bloquea solicitudes.

## Firma definida para fases siguientes
La firma HMAC se calcula sobre:

`timestamp + "\n" + METHOD + "\n" + originalUrl + "\n" + rawBody`

La salida esperada es hexadecimal.

## Headers
- `X-Integration-Id`
- `X-Integration-Timestamp`
- `X-Integration-Signature`

Los nombres reales se leen desde:
- `INTEGRATION_HEADER_ID`
- `INTEGRATION_HEADER_TIMESTAMP`
- `INTEGRATION_HEADER_SIGNATURE`

## Integraciones preparadas
- Tickets
- Portafolio
- INS_FL
- Logística
- Instalaciones Drive
- Ventas

## Importante
Este FIX:
- NO modifica rutas `/sync`;
- NO modifica Apps Script;
- NO cambia `INTEGRATION_AUTH_ENABLED`;
- NO implementa persistencia de nonces/replay;
- NO modifica Aiven;
- NO modifica Azure;
- NO modifica GitHub automáticamente.

La protección anti-replay completa queda pendiente para la siguiente fase. La validación temporal sí se aplica cuando la autenticación esté activada.

## Validación esperada después de copiar los archivos
1. Deploy backend.
2. Confirmar arranque normal en Azure.
3. Confirmar Aiven conectado.
4. Confirmar `/api/health`.
5. Mantener `INTEGRATION_AUTH_ENABLED=false`.
