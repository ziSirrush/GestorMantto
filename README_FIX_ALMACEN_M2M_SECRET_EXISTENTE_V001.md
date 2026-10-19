# BLT NOW | Almacen NetSuite - FIX M2M / Secreto existente V001

**Firma:** `[Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN ID M2M SECRET EXISTENTE V001]`

## Causa

El receptor Azure buscaba dos variables inexistentes en la configuracion confirmada:
`INTEGRATION_ALMACEN_NS_ID` e `INTEGRATION_ALMACEN_NS_SECRET`.
Por separado, el CONFIG de Apps Script exigia `INTEGRATION_ALMACEN_ID` o
`ALMNS_INTEGRATION_ID`, tambien inexistentes. El proceso se detenía antes del envío.

**Configuracion real confirmada por las capturas:**

- Azure App Service: `INTEGRATION_ALMACEN_SECRET` (nombre de variable; el valor no se muestra).
- Script Properties de Google Apps Script: `INTEGRATION_ALMACEN_SECRET` (nombre de propiedad; no se muestra valor).

## Correccion

- `INTEGRATION_ID` **publico y fijo**: `almacen-appscript`. No es secreto y no requiere Script Property ni App Setting adicional.
- GAS obtiene el **secreto** exclusivamente de `INTEGRATION_ALMACEN_SECRET` en Script Properties.
- Azure obtiene el **secreto** exclusivamente de `process.env.INTEGRATION_ALMACEN_SECRET` para esa identidad.
- La verificacion HMAC-SHA256 continua siendo obligatoria para `/api/almacen/sync/*` incluso con `INTEGRATION_AUTH_ENABLED=false`.
- No se cambiaron las rutas M2M, los payloads, el identificador `id_inventario`, los lotes, las reglas de NULL, ni los otros endpoints de integraciones.
- La extraccion NetSuite que llena `Valuacion Inventario` **no se modifica**.

## Archivos completos para reemplazar (solo estos)

1. `backend/src/middleware/integration-auth.middleware.js` — identifica el secreto existente y admite un ID esperado fijo en la ruta de Almacen. Otras integraciones mantienen sus IDs por variables.
2. `backend/src/modules/almacen/almacen.ns-sync-routes.js` — usa `expectedIntegrationId: 'almacen-appscript'`, con firma obligatoria.
3. `scripts/almacen_ns/00_ALMNS_CONFIG.gs` — CONFIG V006 completo, elimina la solicitud de las propiedades de ID inexistentes y mantiene la configuracion anterior de Paso 0, historial, SEND y fuentes 230/433/Catalogo.
4. `tests/almacen-ns-sync-phase2.test.js` — actualiza los casos del contrato de autenticacion; conserva los ensayos de inventario 230, movimientos 433 y catalogo.

## Orden de aplicacion

1. En **local**, reemplazar los dos archivos completos del backend con sus rutas exactas.
2. Ejecutar `node --test tests/almacen-ns-sync-phase2.test.js` desde la raiz del repositorio y verificar arranque de API.
3. Confirmar que Azure tiene `INTEGRATION_ALMACEN_SECRET`. **No crear** `INTEGRATION_ALMACEN_NS_ID`, `INTEGRATION_ALMACEN_NS_SECRET`, ni variables nuevas de ID.
4. Desplegar el backend a Azure **solo con autorizacion expresa y conforme al proceso del Gestor**. Un archivo local no cambia Azure.
5. En Apps Script del libro `BG Inventario_230`, reemplazar el **contenido completo** del Config actual con `scripts/almacen_ns/00_ALMNS_CONFIG.gs` V006; si ya se llama `CONFIG.gs` puede conservar ese nombre. No agregar una segunda definicion de `ALMNS_ObtenerConfig()` ni `ALMNS_CONFIG`.
6. Confirmar que `INTEGRATION_ALMACEN_SECRET` ya existe en Script Properties. El **valor** del secreto debe ser **exactamente el mismo en Azure y GAS** (no es posible comprobarlo en las capturas).
7. Despues de desplegar Azure y guardar GAS, reintentar `ALMNS_230_Paso3_EnviarSENDaAiven()`. El motor CORE y SEND anteriores se conservan sin cambios.

## Validaciones efectuadas (locales)

- Sintaxis Node de middleware, rutas y pruebas: correcta.
- Config GAS interpretado en entorno JavaScript simulado: correcto.
- Pruebas Node del backend con BD simulada: **13/13 correctas**. Incluyen HMAC valido, firma incorrecta, ausencia de headers, falta de secreto y compatibilidad de otras integraciones.
- Firma HMAC generada por GAS: contrastada localmente contra Node para GET y POST, con unico secreto existente.
- Sin pruebas reales contra Azure, Aiven ni Google Sheets. No se puede confirmar aun el valor equivalente de los secretos ni el despliegue.

## Efectos y limites

- **SQL:** NO se requiere ALTER ni nuevas tablas.
- **Azure/Aiven/Google Sheets/GitHub:** no modificados por la preparacion de este ZIP.
- **Frontend:** no modificado.
- **No incluye** `.patch`, instaladores, credenciales, cambios al receptor NetSuite ni despliegues automaticos.
