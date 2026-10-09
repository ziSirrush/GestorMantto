# FIX BACKEND CX VENTA / INSTALACIONES SYNC V001

Fecha: 2026-10-09
Repositorio: `ziSirrush/GestorMantto` / rama `main`
Referencia HEAD observada al cierre de la preparacion: `208df80c0dacb9c5708e6b50676f5d296bdc0601`.

## Objetivo

Crear el receptor backend para el libro Google Sheets identificado en `CX_VI_CONFIG_V001.gs` y su hoja `BD_Venta_Instalacion_SEND` producida por `CX_VI_PASO_2_MAPEO_SNAKE_AIVEN_V001.gs`.

- Tabla: `cx_venta_instalacion_encuestas` (Aiven MySQL).
- Fuente: `CX_VENTA_INSTALACION_SHEETS`.
- Campos JSON/MySQL: exactamente **91**, mismos nombres y orden de la hoja SEND.
- Sin `CREATE`, `ALTER`, tablas auxiliares ni columnas nuevas.
- Sin cambios al frontend ni a los pasos Apps Script existentes.
- Autenticacion M2M: **`INTEGRATION_VENTAS_ID` / `INTEGRATION_VENTAS_SECRET`**, firma HMAC SHA-256 del cuerpo exacto; reutiliza middleware ya montado.

## Endpoints

| Metodo | Ruta | Comportamiento |
|---|---|---|
| POST | `/api/customer-experience/venta-instalacion/sync/validar` | Valida payload, 91 encabezados, valores, filas y grupos; **no escribe** |
| POST | `/api/customer-experience/venta-instalacion/sync` | Reconcilia los registros de la tabla con la foto completa, **una sola transaccion** |

Los dos endpoints **rechazan** llamadas si `INTEGRATION_AUTH_ENABLED` no esta activo, incluso si el middleware M2M general permite bypass para otras rutas.

## Por que no se usa UPSERT por fila

La tabla presentada tiene `id` autoincremental, pero **no una llave logica de encuesta**. No hay evidencia de unicidad de `pp_nt` u otra combinacion. Por tanto, un UPSERT por 300 filas podria duplicar encuestas o sobreescribir una distinta.

La opcion segura sin cambiar el esquema es `FULL_SNAPSHOT_ATOMIC`:

1. El SEND futuro manda **todos los registros juntos en un POST**; no manda bloques HTTP de 300.
2. El backend verifica que se recibieron todos, que las 91 columnas son las esperadas y que `snapshot_completo` y `confirmar_reemplazo` son `true`.
3. Bajo bloqueo exclusivo para este proceso y transaccion MySQL, compara el contenido de los 91 campos. Conserva el `id` de registros identicos, incluso cuando existen duplicados legitimos.
4. Elimina registros que ya no figuran en Sheets e inserta nuevos o modificados, trabajando internamente en grupos SQL de **300 filas**.
5. Si falla cualquier operacion SQL, ejecuta `ROLLBACK` del snapshot completo.

**ATENCION:** un registro cuyo contenido cambio no puede identificarse como el mismo registro sin llave estable; se elimina el anterior y se inserta otro con `id` nuevo. Las filas ausentes en el SEND se eliminaran en Aiven. **Realizar respaldo Aiven y validar las cinco hojas antes del primer envio real.**

El Paso 2 continua usando 300 filas por bloque para procesar Google Sheets. Ese numero NO equivale a un bloque HTTP parcial. El limite HTTP actual de Express es `JSON_LIMIT=12mb` salvo configuracion contraria; si toda la foto excede ese limite se detiene el envio, en lugar de hacer un reemplazo parcial peligroso. Para volumenes que no quepan en una solicitud sera necesario un protocolo de carga por lotes con almacenamiento transitorio duradero o una llave persistente, ambos sujetos a revision antes de cambiar esquema.

## Contrato del futuro SEND

`POST` JSON. Ejemplo estructural (cada registro real lleva **exactamente las 91 propiedades**):

```json
{
  "source": "CX_VENTA_INSTALACION_SHEETS",
  "table": "cx_venta_instalacion_encuestas",
  "key": null,
  "mode": "FULL_SNAPSHOT_ATOMIC",
  "snapshot_completo": true,
  "confirmar_reemplazo": true,
  "bloque": 1,
  "total_bloques": 1,
  "campos": ["proyecto_padre", "cliente", "... restantes segun CX_VI_PASO2_CAMPOS_BD, en orden"],
  "total_registros": 1,
  "registros": [{"proyecto_padre": "...", "...": "las otras 90 propiedades, con null donde no apliquen"}]
}
```

La notacion `...` es ilustrativa; **no** es un campo valido. Al construir el SEND real se usara la lista completa de encabezados de Paso 2, no este ejemplo abreviado. Nunca enviar la columna `id`. Se rechazan columnas sobrantes o faltantes; se rechaza un registro con campos de otro tipo de encuesta; se rechaza foto vacia. Si se utilizan `bloque` y `total_bloques`, ambos deben ser `1`.

Firma: `timestamp + '\n' + 'POST' + '\n' + rutaSinDominio + '\n' + JSON_EXACTO`, HMAC SHA-256 hex; coincide con `CX_VI_CONFIG_PrepararSolicitud_` y el middleware de GitHub `main`. No agregar parametros a la URL firmada.

## Configuracion de Azure

```text
INTEGRATION_AUTH_ENABLED=true
INTEGRATION_VENTAS_ID=valor-igual-al-config-del-Script
INTEGRATION_VENTAS_SECRET=secreto-real
```

En Apps Script, las mismas propiedades se guardan en **Script Properties**. No incorporar el secreto en el repositorio ni en los archivos del FIX.

## Archivos del FIX

Modificados completos:

- `backend/src/modules/customer-experience/customer-experience.routes.js`
- `backend/src/modules/customer-experience/customer-experience.controller.js`

Nuevos:

- `backend/src/modules/customer-experience/customer-experience-vi-sync.contract.js`
- `backend/src/modules/customer-experience/customer-experience-vi-sync.service.js`
- `backend/src/modules/customer-experience/customer-experience-vi-sync.repository.js`

No modificar ni restaurar `backend/src/routes/index.js`, porque `/api/customer-experience` ya esta montado.

## Precondicion antes de aplicar

Verificar que los **blobs originales** de los dos archivos modificados siguen siendo:

- `customer-experience.routes.js`: `ad7ff1a6aff42364109ec61503a2a2387b4ac646`
- `customer-experience.controller.js`: `3a40f3a4d3300fdddadc5bdb889da36da744bff6`

Estos blobs permanecieron iguales aunque `main` avanzo durante la preparacion. Si alguno cambia, **no sobrescribir** sin comparar e integrar el nuevo contenido.

## Aplicacion local

1. Respaldar repositorio/cambios locales y verificar que no hay cambios pendientes en los dos archivos.
2. Extraer este ZIP en la raiz del proyecto, conservando carpetas.
3. Ejecutar `node --check` sobre los cinco `.js` y `git diff --check`.
4. Probar primero `/sync/validar` con un snapshot pequeno pero representativo.
5. Antes de `/sync` real, hacer respaldo de la tabla Aiven y comprobar la cantidad esperada de encuestas de las cinco hojas.
6. Preparar e instalar **SEND (Paso 3)**, el cual aun **no** existe en este paquete. Debe enviar una unica foto completa firmada.

## Validaciones realizadas

- `node --check`: aprobado en los cinco archivos.
- Los 91 nombres y su orden se compararon contra Paso 2 V001 y el CREATE TABLE subido el 2026-10-09.
- Pruebas aisladas con DB simulada: insertar, repetir sin cambios, cambiar respuesta, duplicados identicos, borrado controlado, rollback total, bloqueo ocupado: aprobadas.
- Registro de rutas con dependencias simuladas: aprobado; `/mantenimiento/sync` conserva su handler; desactivacion HMAC rechaza nueva ruta.

**NO verificado:** conexion real con Aiven, HMAC contra Azure desplegado, E2E con Google Apps Script, numero real de encuestas, tamanos reales de payload o permisos efectivos del servidor MySQL. No afirmar despliegue ni pruebas de produccion.

## Sistemas externos modificados

Ninguno: sin escritura a GitHub, Aiven, Azure o Google Sheets.
