# FIX ALMACEN NS | ID_INVENTARIO UPSERT BACKEND | V001

**Firma:** [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN 230 ID INVENTARIO BACKEND V001]

## Base y objetivo

- Repositorio: `ziSirrush/GestorMantto`, rama `main`.
- Commit comprobado al preparar el fix: `075e74eadeb284c18f7a306d56bb0ef7eb28856b` (Version 101926.1).
- La tabla `almacen_ns_inventario` **ya tiene** `id_inventario` como `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`.
- Antes, el receptor ignoraba el ID procedente de la hoja SEND y generaba otro ID en Aiven.
- Ahora el contrato exige `idInventario` en cada fila del informe 230. Es el campo JSON camelCase correspondiente al encabezado `id_inventario` de SEND.
- Se conserva el contrato de endpoints y la autenticacion HMAC existente. Sin ALTER, tablas nuevas ni cambios a otros informes.

## Archivos completos del ZIP

1. `backend/src/modules/almacen/almacen.ns-sync-service.js`: valida `idInventario`, hace INSERT/UPDATE segun la PK y publica solo al finalizar el lote completo.
2. `backend/src/modules/almacen/almacen.ns-sync-routes.js`: el endpoint `/api/almacen/sync/contrato` informa version 2 y declara la PK obligatoria; **no cambia las rutas** de carga.
3. `tests/almacen-ns-sync-phase2.test.js`: sustituye las pruebas previas por pruebas compatibles con el nuevo contrato, conservando cobertura de 433, catalogo y HMAC.

## Regla de escritura de inventario 230

| Condicion al finalizar lote | Resultado |
| --- | --- |
| `id_inventario` no existe | INSERT usando el ID enviado (no otro AUTO_INCREMENT definitivo). |
| `id_inventario` existe y cambian sus datos | UPDATE por esa PK; se conserva `created_at`. |
| `id_inventario` existe y no cambian sus datos | Se conserva el contenido/fecha de modificacion; la fila se asocia al lote vigente. |
| Un ID no aparece en la nueva hoja SEND | Se conserva en el inventario vigente; no se borra automaticamente. |
| ID duplicado en la misma pagina o entre paginas | Error; el lote no se publica. |
| ID ya ocupado por otra importacion pendiente | Error sin sustituir esa fila. |
| Mismo articulo/subsidiaria/ubicacion bajo IDs incompatibles | Error de unicidad y rollback completo. |
| Lote incompleto | No se modifica inventario publicado. |
| Lote rechazado | Se borran solamente las filas temporales de esa carga. |

**Como funciona sin tablas adicionales:** durante `/paginas` se crean registros temporales en `almacen_ns_inventario`, asociados al lote RECIBIENDO y con IDs AUTO_INCREMENT de staging. Los IDs reales de SEND van dentro del `raw_json` validado. En `/finalizar`, bajo transaccion MySQL y bloqueo de publicacion, se eliminan solo esos staging del lote, se aplican los INSERT/UPDATE con los IDs enviados, se conservan registros ausentes, y se activa el nuevo lote. Ante error se revierte toda la operacion.

La respuesta de finalizar incluye `resumenInventario` con `insertados`, `actualizados`, `sinCambios` y `conservados`. Las otras fuentes (433 y catalogo) conservan el comportamiento de Fase 2.

## ADVERTENCIAS IMPORTANTES

### 1. Se necesita adecuar el emisor GAS (NO incluido en este fix de backend)

El Config V004 de Sheets **actualmente excluye** `id_inventario` de `FUENTES['230'].headers`. Si no se actualiza antes de enviar, Azure devolvera 422 (`idInventario es obligatorio`). El mapeo requerido en el emisor es:

```javascript
['idInventario', 'id_inventario']
```

Debe agregarse **al inicio** de `FUENTES['230'].headers` del Config de GAS, conservando los demas 10 campos y el motor de HMAC actual. No enviar `id_inventario` con ese nombre dentro del JSON: el backend recibe `idInventario`.

### 2. Estabilidad de la clave de SEND

El `id_inventario` debe ser **permanente** para cada registro. La formula `=ARRAYFORMULA(SI(C2:C="","",FILA(C2:C)-1))` NO es una PK estable si se insertan, eliminan u ordenan filas; puede reasignar el mismo numero a un articulo diferente. No activar la carga hasta que se asegure la estabilidad de los IDs de `Res.!A` y SEND. Una hoja puede manejar IDs numericos fijos, asignados una sola vez; no deben reciclarse.

### 3. Historial de cortes

Este modelo UPSERT mantiene **una sola fila vigente por `id_inventario`**. Cuando se publica una nueva carga, las filas anteriores se actualizan/traspasan al nuevo lote. `almacen_ns_lotes` conserva la trazabilidad del lote, pero las fotografias completas de inventario de cortes anteriores NO quedan disponibles como filas separadas en `almacen_ns_inventario` (no es compatible con una PK unica reutilizada entre cortes, sin ampliar el esquema). La tabla `almacen_auditoria` y sus capturas NO se tocan.

Si se requiere consultar fotografias historicas en Aiven por corte, hace falta una decision de esquema adicional, **no incluida ni realizada** aqui. Res. conserva sus registros conforme al flujo de Sheets definido.

### 4. Lotes previos

Los lotes de inventario `RECIBIENDO` generados con el contrato V001 (sin `idInventario`) no se pueden finalizar con V002. Rechazarlos por el endpoint existente y comenzar un UUID nuevo. Asegurar que no haya una carga de inventario en curso durante el reemplazo del backend.

### 5. Consulta durante publicacion

Una operacion SQL ve cambios confirmados atomicamente al publicar. Las consultas del frontend que ejecutan varias consultas SQL independientes podrian coincidir con el cambio de lote entre consultas. Este fix **no cambia el servicio de consultas de Fase 1**; validar en ambiente local su comportamiento durante cortes de gran volumen antes de usarlo con usuarios simultaneos.

## Ejemplo de JSON para pagina de Inventario 230

```json
{
  "pagina": 1,
  "filas": [{
    "idInventario": "15",
    "idArticuloNs": "9239",
    "articulo": "ARTICULO DEMO",
    "descripcion": "Descripcion de prueba",
    "valorFactura": "100.00",
    "porcentajeValorFactura": "0.15",
    "fisico": "2",
    "idSubsidiariaNs": "2",
    "subsidiaria": "CORELLIAN",
    "idUbicacionNs": "38",
    "almacenUbicacion": "ALMACEN CENTRAL"
  }]
}
```

Se conservan las operaciones ya existentes:
`POST /api/almacen/sync/inventario-230/lotes`, `POST /.../lotes/{uuid}/paginas`, `POST /.../lotes/{uuid}/finalizar`, `POST /.../lotes/{uuid}/rechazar`, `GET /.../lotes/{uuid}`.

## Instalacion local, sin publicacion

1. Confirmar que la copia local corresponde a la base referenciada o revisar manualmente el diff antes de copiar.
2. Extraer el ZIP en la raiz local del repositorio; sobrescribir solo los tres archivos indicados.
3. Ejecutar en PowerShell, desde la raiz del repositorio:

```powershell
node --check backend/src/modules/almacen/almacen.ns-sync-service.js
node --check backend/src/modules/almacen/almacen.ns-sync-routes.js
node --check tests/almacen-ns-sync-phase2.test.js
node --test tests/almacen-ns-sync-phase2.test.js
git diff --check
git status --short
```

4. **No ejecutar primeras cargas** hasta actualizar el mapeo del GAS y asegurar IDs estables.
5. Realizar prueba de integracion contra Aiven de desarrollo autorizada antes de un despliegue Azure. No hay despliegue automatico ni commit en este ZIP.

## Resultados de Aster / limites de verificacion

- Sintaxis Node: verificada.
- Pruebas locales con MySQL simulado: **12/12 correctas** (ID, INSERT, UPDATE, sin cambios, conservar ausentes, rollbacks, rechazo, lote parcial, 433, catalogo y HMAC).
- GitHub main verificado: commit de referencia citado arriba. No hubo escritura a GitHub.
- **NO probado contra MySQL Aiven real, Azure ni Google Sheets reales**. No se declara E2E aprobado.
- SQL adicional: **NO**.
- Cambios de datos o produccion realizados por Aster: **NINGUNO**.
- ZIP sin `.patch`, instaladores, secretos, cambios visuales o GAS.
