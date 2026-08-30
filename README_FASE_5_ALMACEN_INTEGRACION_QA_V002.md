# Fase 5 - Almacen - Integracion y QA V002

Fecha: 30/08/2026
Proyecto: Mantto Gestor
Baseline funcional: FASE_4_ALMACEN_AUDITORIA_AIVEN_V002
Prerrequisitos: Fase 1 Almacen V001 + Fase 2 Datos Excel V002 + Fase 3 Operativos Excel V002 + Fase 4 Auditoria Aiven V002.

## Objetivo

Cerrar la integracion funcional de Gestion de Almacen y convertir Fase 5 en una puerta de calidad real.

La cadena validada por esta fase es:

```text
Excel / CSV
   -> backend Mantto Gestor
   -> validacion de encabezados y mapeo
   -> transaccion
   -> Aiven / almacen_fuente_excel
   -> lote activo
   -> Dashboard
   -> Inventario
   -> Stock
   -> Prestamos
   -> Resguardos
   -> Auditoria
```

Esta version NO valida ni muestra `Pend. Informacion`.

## Hallazgo de integracion corregido

Durante el QA de la baseline Fase 4 V002 se detecto una colision real de nombres en `modules/almacen/almacen.js`:

```text
function pager(pagination, prefix)
function pager(scope, pagination)
```

Al estar ambas declaraciones en el mismo scope, la segunda reemplaza a la primera por hoisting de declaraciones de funcion. Como consecuencia, Inventario y Por Empresa podian renderizar botones con el contrato `data-alm-op-*`, mientras su binder escucha `data-alm-page`, dejando la paginacion de esas vistas inconsistente.

Fase 5 V002 corrige solamente este punto:

```text
inventoryPager(...)
operationalPager(...)
```

Se actualizan las llamadas correspondientes para:

- Inventario;
- Por Empresa;
- Stock;
- Prestamos;
- Resguardos.

No se modifica la logica de consultas, importacion, Auditoria, permisos ni calculos.

## Archivos que modifica al aplicar

Solo:

- `modules/almacen/almacen.js`
- `core/module-loader.js` (solo cache-bust de las seis rutas Almacen)

Nuevo cache-bust:

```text
20260830-almacen-fase5-integracion-qa-v002
```

No modifica:

- backend;
- SQL;
- `index.html`;
- `core/router.js`;
- Aiven;
- Azure;
- GitHub;
- Netlify.

## Que valida Fase 5

### 1. Excel -> backend -> Aiven

Comprueba estaticamente y mediante smoke tests:

- lector XLSX/CSV disponible;
- importador multihoja;
- encabezados canonicos y aliases;
- error 422 si no puede confirmar Inventario;
- detalle de hojas/encabezados/calidad en los errores;
- validacion de archivo sin tocar Aiven;
- importacion transaccional.

### 2. Rollback

Se inyecta un fallo justo cuando el nuevo lote intenta activarse.

El orden esperado y probado es:

```text
BEGIN
INSERT nuevo lote
DEACTIVATE_OLD
ACTIVATE_NEW -> fallo inyectado
ROLLBACK
RELEASE
```

Tambien se prueba el camino correcto:

```text
BEGIN
INSERT nuevo lote
DEACTIVATE_OLD
ACTIVATE_NEW
COMMIT
RELEASE
```

La prueba es simulada y no provoca fallos deliberados sobre Aiven real.

### 3. Lote activo

La validacion estatica confirma que los modulos consultan `activo=1` y el tipo de registro correcto.

Adicionalmente se incluye un precheck Aiven opcional y SOLO LECTURA que exige:

- exactamente un `lote_importacion` activo;
- al menos una fila activa;
- conjunto `INVENTARIO` presente;
- ninguna fila INVENTARIO activa sin Empresa, Almacen, identificador o Fisico.

### 4. Dashboard

Valida:

- endpoint `/api/almacen/dashboard`;
- permiso Dashboard;
- consumo real desde frontend;
- lectura sobre el lote activo.

### 5. Inventario

Valida:

- endpoint principal y catalogos;
- Por Empresa;
- Por Almacen;
- Top;
- paginacion 30 desde frontend;
- separacion correcta de `inventoryPager`;
- filtros y lectura del lote activo.

### 6. Stock

Valida:

- endpoint `/api/almacen/stock`;
- paginacion de 30;
- filtro `INVENTARIO`;
- permiso de operaciones;
- ausencia de calculos inventados cuando el Excel no trae parametros.

### 7. Prestamos

Valida:

- catalogos;
- resumen;
- detalle;
- paginacion 30;
- dataset `PRESTAMO`;
- permiso de operaciones.

### 8. Resguardos

Valida:

- catalogos;
- detalle;
- paginacion 30;
- dataset `RESGUARDO`;
- permiso de operaciones.

### 9. Auditoria

Valida:

- catalogos desde Aiven;
- muestra desde el inventario activo;
- ausencia de endpoint POST de Auditoria;
- ausencia de persistencia local;
- esperado obtenido de Aiven;
- muestra funcional en smoke test.

Fase 5 NO convierte `almacen_fuente_excel` en historico de auditorias.

### 10. Permisos

Comprueba los tres permisos existentes:

```text
ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

Y conserva:

```text
CORELLIAN / ALMACEN
```

La importacion sigue restringida a:

```text
PROGRAMADOR
PROGRAMADOR_CORELLIAN
```

### 11. Responsive

Valida:

- `.alm-table-wrap`;
- scroll horizontal local de tablas;
- media queries;
- ausencia de `zoom`;
- ausencia de `transform:scale()`.

### 12. Ausencia de Pend. Informacion

El validador falla si `modules/almacen/almacen.js` vuelve a contener:

```text
Pend. Informacion
```

El texto con acento usado en la V001 tambien esta prohibido por la validacion del archivo real.

## Scripts del paquete

### Aplicar fix de integracion

Desde la raiz del repo:

```powershell
python .\FASE_5_ALMACEN_INTEGRACION_QA_V002\aplicar_fase_5_almacen_v002.py --repo .
```

El aplicador exige que Fase 4 V002 este presente y cambia solamente el JS de Almacen y el cache-bust.

### QA local completo

```powershell
python .\FASE_5_ALMACEN_INTEGRACION_QA_V002\validar_fase_5_almacen_v002.py --repo .
```

Incluye:

- verificaciones estaticas;
- `node --check`;
- prueba de encabezados;
- prueba de rollback;
- smoke de servicios Dashboard/Inventario/Stock/Prestamos/Resguardos/Auditoria;
- paginacion;
- permisos;
- responsive.

### QA contra Aiven real - solo lectura

Solo cuando el backend local tenga las variables del ambiente que deseas comprobar:

```powershell
python .\FASE_5_ALMACEN_INTEGRACION_QA_V002\validar_fase_5_almacen_v002.py --repo . --with-aiven
```

`tests/fase5_aiven_readonly.js` ejecuta solamente `SELECT`.

No importa, actualiza ni borra datos.

### QA HTTP real - solo lectura + /validar

Configura la URL y la autenticacion en variables de entorno. No pongas credenciales dentro del paquete.

Ejemplo PowerShell:

```powershell
$env:MANTTO_API_BASE="http://localhost:3001"
$env:MANTTO_COOKIE="<cookie de sesion>"
python .\FASE_5_ALMACEN_INTEGRACION_QA_V002\validar_fase_5_almacen_v002.py --repo . --with-http
```

Alternativamente el script reconoce:

```text
MANTTO_BEARER_TOKEN
MANTTO_QA_EXCEL
```

El smoke HTTP:

- consulta todos los endpoints de Almacen;
- prueba muestra de Auditoria si hay almacenes;
- envia un CSV con encabezados invalidos a `/importaciones/validar`;
- opcionalmente valida el Excel real indicado por `MANTTO_QA_EXCEL`.

Nunca llama:

```text
POST /api/almacen/importaciones
```

por lo que no activa un lote nuevo.

## Archivos incluidos

- `modules/almacen/almacen.js`
- `aplicar_fase_5_almacen_v002.py`
- `validar_fase_5_almacen_v002.py`
- `tests/fase5_headers_smoke.js`
- `tests/fase5_import_rollback_smoke.js`
- `tests/fase5_integration_service_smoke.js`
- `tests/fase5_aiven_readonly.js`
- `tests/fase5_http_readonly.py`
- `README_FASE_5_ALMACEN_INTEGRACION_QA_V002.md`
- `VALIDACION_FASE_5.txt`
- `APLICACION_MOCK_FASE_5.txt`
- `SOURCE_BASELINE.txt`
- `SHA256SUMS.txt`

## Validacion realizada al generar el paquete

Se construyo un worktree simulado con la Fase 4 V002 y se ejecuto:

1. aplicador Fase 5;
2. aplicador nuevamente para comprobar idempotencia;
3. validador integral;
4. `node --check` de frontend y backend;
5. smoke de encabezados;
6. smoke de rollback;
7. smoke de integracion de servicios.

Resultado local: APROBADO.

## Lo que NO se puede afirmar con este paquete por si solo

No se ejecutaron las verificaciones opcionales contra tu Aiven real ni contra tu API desplegada al generar el ZIP.

Por lo tanto:

- QA local/estatico: confirmado;
- rollback simulado: confirmado;
- Aiven real: pendiente de ejecutar `--with-aiven` en el ambiente correcto;
- API/Azure real: pendiente de ejecutar `--with-http`;
- responsive visual en navegador real: requiere recorrido manual complementario en desktop/tablet/movil;
- deploy: no realizado.

No se modifica GitHub, Aiven, Azure ni Netlify al generar este paquete.
