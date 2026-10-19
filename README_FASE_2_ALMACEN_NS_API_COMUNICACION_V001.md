# [Aster | 2026-10-19 | ASTER-MG | FASE 2 ALMACEN NS API COMUNICACION V001]

**Proyecto:** BLT NOW / GestorMantto. **Entrega:** solo archivos completos nuevos o modificados, respetando rutas. **Objetivo:** habilitar la comunicacion segura Sheets -> Azure Express -> Aiven de los tres informes previamente definidos. **No crea tablas**, no modifica el frontend, no importa Excel.

**Base de codigo:** Entrega Fase 1 `FASE_1_ALMACEN_NS_LIMPIEZA_BACKEND_V001.zip` confirmada como aplicada por el usuario; GitHub main verificado `7d738d1e7ba712e6a08edf3115a66637610e39cf` (Version 101626.3, 17-oct-2026). **GitHub no mostraba aun los archivos Fase 1** al revisar ese SHA. Este router completo es una evolucion del router del ZIP F1, **no** del router legacy de `main`. Si el arbol local ha evolucionado, comparar antes de reemplazar.

## Archivos completos

- `backend/src/modules/almacen/almacen.routes.js` — unica modificacion a Fase 1: monta `/sync` y firma Aster.
- `backend/src/modules/almacen/almacen.ns-sync-routes.js` — router M2M independiente para tres reportes, operaciones de lote y contrato.
- `backend/src/modules/almacen/almacen.ns-sync-service.js` — validacion exacta del esquema F0+V002, cargas transaccionales por pagina, manifiestos SHA-256, idempotencia y publicacion.
- `backend/src/middleware/integration-auth.middleware.js` — **archivo compartido completo**: incorpora `INTEGRATION_ALMACEN_NS_ID/SECRET` y opcion `alwaysRequireAuth`/`algorithm` por ruta. Las rutas M2M preexistentes conservan semantica original al no activar esa opcion.
- `tests/almacen-ns-sync-phase2.test.js` — tests sin Aiven real.

## Endpoints definitivos (firma HMAC obligatoria en TODOS)

Prefijo: `/api/almacen/sync`.

| Accion | Metodo | Sufijo |
| --- | --- | --- |
| Contrato / conexion autenticada | GET | `/contrato` |
| Iniciar/reanudar lote | POST | `/{fuente}/lotes` |
| Consultar estado y paginas recibidas | GET | `/{fuente}/lotes/{idLote}` |
| Enviar pagina completa | POST | `/{fuente}/lotes/{idLote}/paginas` |
| Validar y publicar | POST | `/{fuente}/lotes/{idLote}/finalizar` |
| Rechazar lote no publicado | POST | `/{fuente}/lotes/{idLote}/rechazar` |

`{fuente}` es **EXACTAMENTE** una de: `inventario-230`, `movimientos-433`, `catalogo-articulos`.

El inicio recibe JSON `loteId` (UUID), `modoCarga` (`COMPLETA` para 230 y catalogo; `COMPLETA` o `INCREMENTAL` para 433), `fechaCorte` (`YYYY-MM-DD`), `filasEsperadas`, `tamanoPagina` (1-300), `hashCarga` (SHA-256 del manifiesto), `referenciaEjecucion` opcional; `fechaDesde`/`fechaHasta` son opcionales para el 433. `paginasEsperadas = CEIL(filasEsperadas / tamanoPagina)` (max 2000).

La pagina recibe `{ "pagina": 1, "filas": [ {...}, ... ] }`. El numero de filas de cada pagina debe coincidir con lo declarado en el inicio, incluida la ultima pagina. La numeracion inicia en 1. El servidor calcula `SHA256(JSON.stringify(filas))` para cada pagina y almacena su recibo en `almacen_ns_lotes.metadata_json`. `hashCarga = SHA256(hashPagina1 + '\n' + hashPagina2 + ... )` en el orden de pagina (para cero paginas, SHA256 de cadena vacia). **Se rechaza publicar** con paginas/cantidades/hash inconsistentes. Una pagina repetida con contenido identico no duplica; con contenido distinto recibe HTTP 409.

Los datos se insertan por pagina dentro de transaccion MySQL; `estado=RECIBIENDO` permanece hasta `/finalizar`. La finalizacion comprueba la cuenta real en tablas, establece `PUBLICADO`, `es_completo=1`, timestamps y hash validado. En Inventario 230, desactiva el ultimo lote y activa el nuevo en **una sola transaccion**, con `GET_LOCK`, validacion de fecha y el indice unico existente `uq_alm_ns_unico_inventario_activo`. El lote anterior sigue activo si el nuevo esta incompleto o si la publicacion falla. Catalogo queda publicado (activo=0) y F1 consulta el ultimo publicado. Movimientos quedan publicados (activo=0), se actualizan por `(id_transaccion_ns,id_linea_ns)` con `primer_lote_id` permanente y `ultimo_lote_id` actualizado. **No se deduplican lineas por articulo/documento, no se descartan fisico=0, ni cantidad=0 con importe.** No se anulan movimientos por ausencia en un reporte.

### IMPORTANTE: alcance del esquema de movimientos

La estructura actual de `almacen_ns_movimientos` contiene una sola fila mutable por `(id_transaccion_ns,id_linea_ns)`; **no existe tabla staging independiente de correcciones**. Durante `/paginas`, actualizar una linea existente cambia sus datos y `ultimo_lote_id` antes de publicar el lote; este paso NO es atomicamente visible como snapshot multi-pagina para futuros lectores de movimientos. **Fase 1 aun no consulta Movimientos 433 para Stock; la Fase 4 debe evitar presentar lotes RECIBIENDO.** Una sincronizacion fallida que modifico movimientos preexistentes puede requerir reprocesar una carga completa verificada. No puedo garantizar aislamiento de correcciones multi-pagina con las cuatro tablas actuales. Si se exige snapshot atomico historico de modificaciones 433, necesitaremos una decision explicita de ampliacion de esquema (no realizada ni supuesta aqui). **Evitar cargas 433 concurrentes**; ante duda detener F3 antes de operar en productivo.

## Seguridad M2M — fail closed

Definir **en Azure App Service > Configuration** (NO en Git ni frontend):

```
INTEGRATION_ALMACEN_NS_ID=<identificador-unico-exclusivo>
INTEGRATION_ALMACEN_NS_SECRET=<secreto-aleatorio-fuerte>
```

Usar un ID **diferente** al de todas las demas integraciones. `INTEGRATION_AUTH_ENABLED` puede seguir en `false` para las integraciones legacy: Almacen tiene `alwaysRequireAuth:true` y **NUNCA** lo omite. Para Almacen, HMAC SHA-256 es obligatorio independientemente del valor global `INTEGRATION_HMAC_ALGORITHM` (las integraciones anteriores siguen usando su propio contrato existente). Firma canonica sobre bytes crudos de request:

```
<timestamp-Unix-segundos>\n<METHOD-uppercase>\n<originalUrl-con-/api>\n<rawBody-exacto>
```

Headers predeterminados: `X-Integration-Id`, `X-Integration-Timestamp`, `X-Integration-Signature`. Si Azure utiliza `INTEGRATION_HEADER_ID`, `INTEGRATION_HEADER_TIMESTAMP` o `INTEGRATION_HEADER_SIGNATURE` personalizados, configurar los tres nombres equivalentes en el Script Property GAS. Ventana temporal predeterminada: `INTEGRATION_TIMESTAMP_TOLERANCE_SECONDS=300`. Body JSON maximo autorizado por servidor (`JSON_LIMIT`, actualmente 12mb por defecto). Firma invalida/faltante/expirada -> 401. `POST` no acepta JWT humano como sustituto de la firma.

**No guardar credenciales en archivos `.gs`, frontend, README o registro de errores**. Restringir editores del proyecto GAS. Se conserva el middleware `captureRawBody` del backend; no requiere cambios.

## Instalacion local y QA (SIN deploy automatico)

1. Revisar archivos del arbol local de Fase 1 contra este ZIP y el SHA objetivo. Si hay discrepancias, DETENER.
2. Copiar archivos completos sobre la raiz local del repo; el ZIP **no instala ni borra nada**.
3. Ejecutar en PowerShell en la raiz del proyecto:

```powershell
node --check backend/src/middleware/integration-auth.middleware.js
node --check backend/src/modules/almacen/almacen.routes.js
node --check backend/src/modules/almacen/almacen.ns-sync-routes.js
node --check backend/src/modules/almacen/almacen.ns-sync-service.js
node --test tests/almacen-ns-sync-phase2.test.js
git diff --check
git status --short
```

4. Configurar las dos variables M2M en ambiente local (para QA) y **solo bajo autorizacion** en Azure. No activar la carga de Sheets hasta validar.
5. Verificar esquema Aiven real (4 tablas, tipo de lote `CATALOGO_ARTICULOS`, PK/FK e indices de F0). No se ejecuta SQL desde este ZIP.
6. Pruebas E2E en entorno controlado: GET contrato firmado, 401 sin firma, carga 230/433/catalogo pequena, recepcion repetida y manifiesto, publicar 230, consulta Dashboard, historia Auditoria. La prueba de escritura **siempre** en BD de desarrollo autorizada y con respaldo, no en produccion involuntariamente.
7. Publicar Azure unicamente si el usuario lo solicita expresamente. No incluir secretos en commit. Posteriormente configurar GAS (ZIP Paso 2 / Fase 3).

**SQL adicional requerido:** NO. **Escrituras ejecutadas por Aster:** ninguna sobre GitHub, Azure, Aiven, Sheets o Netlify. **Pruebas realizadas:** sintaxis Node, estados/contrato HMAC con DB simulada. **NO confirmados:** compatibilidad con Aiven en vivo, ejecucion real de GAS, E2E y despliegue.

**Fuentes de implementacion:** SQL F0 `01_CREAR_TABLAS_INT_ALMACEN_NS_230_433_V001.sql`, SQL V002 catalogo, ZIP F1 y GitHub `ziSirrush/GestorMantto` SHA anterior (especialmente `integration-auth.middleware.js`, `raw-body.middleware.js`, `backend/src/app.js`).
