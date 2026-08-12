# FASE 5 - Endurecimiento de SYNC por registro

## Objetivo
Incorporar a la version publicada el endurecimiento ya presente en `JIVMBLT/updated_code` / `BLT_NOW`, manteniendo `INTEGRATION_AUTH_ENABLED=false`.

Esta fase no activa HMAC. Su objetivo es que un registro invalido no derribe el lote completo cuando el flujo soporta procesamiento individual.

## Cambios incluidos

### Portafolio
- `backend/src/controllers/data.controller.legacy.js`
- El SYNC contabiliza recibidos, procesados y rechazados.
- Una fila invalida se reporta y el resto continua.
- Los errores estructurales del proceso completo siguen devolviendo fallo del endpoint.

### INS_FL
- `backend/src/controllers/ins-fl.controller.js`
- SAVEPOINT por registro.
- ROLLBACK solo de la fila con error.
- El resto del lote continua.

### Logistica
- `backend/src/controllers/logistica.controller.js`
- SAVEPOINT por registro.
- ROLLBACK solo de la fila con error.
- Se conserva el procesamiento de las demas filas.

### Instalaciones Drive
- `backend/src/modules/instalaciones-drive/instalaciones-drive.repository.js`
- `backend/src/modules/instalaciones-drive/instalaciones-drive.service.js`
- SAVEPOINT por fila y detalle de errores.
- Respuesta parcial cuando hay registros rechazados.

### Instalaciones Proyecto Drive
- `backend/src/modules/instalaciones-proyecto-drive/instalaciones-proyecto-drive.service.js`
- SAVEPOINT por registro.
- Acumulacion de errores sin cancelar todo el lote.
- Respuesta con estado parcial y detalle de errores.

### Ventas - Clientes
- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`
- SAVEPOINT por registro.
- Los errores se acumulan y los registros validos continúan.

### Ventas - Cotizaciones
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- Aislamiento de errores por registro mediante SAVEPOINT.
- Indicador `parcial` cuando existen rechazados.

### Ventas - Prospeccion
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.service.js`
- SAVEPOINT por prospeccion/comentario.
- Los registros invalidos incrementan `rejected` sin detener los validos.
- Se mantiene `ok: true` para proceso estructuralmente correcto y se informa `parcial` cuando aplica.

### Ventas - Redes
- `backend/src/modules/ventas-redes/ventas-redes-sync.service.js`
- SAVEPOINT por registro y por comentario.
- Los fallos individuales no cancelan el lote completo.
- Se informa `parcial` y el detalle de rechazados.

## Tickets
No hay un archivo adicional de endurecimiento por registro marcado por esta fase en `updated_code`. El cambio de Tickets correspondiente a autenticacion M2M ya fue incorporado en Fase 4.

## Configuracion de Azure
Mantener:

```text
INTEGRATION_AUTH_ENABLED=false
```

No cambiar a `true` durante esta fase.

## Validacion realizada al paquete
- Se copiaron exclusivamente los archivos marcados en `updated_code` con `FASE_4_BACKEND_FLEXIBLE_REGISTRO_V001`.
- Se valido sintaxis JavaScript con `node --check` para todos los archivos incluidos.
- No se modificaron rutas, frontend, permisos, tablas ni esquema de base de datos en esta fase.

## Validacion recomendada despues de aplicar
Para cada SYNC intervenido, usar un lote de prueba que contenga al menos:
1. un registro valido;
2. un registro invalido controlado;
3. otro registro valido posterior.

Resultado esperado:
- los registros validos se procesan;
- el invalido se reporta/rechaza;
- el registro posterior al error tambien se procesa;
- el endpoint no cae por completo por un error aislado;
- los errores estructurales siguen produciendo fallo general.
