# Fase 2 — Almacén — Fuente temporal Excel + Dashboard/Inventario V002

**Fecha:** 30/08/2026  
**Proyecto:** Mantto Gestor  
**Baseline GitHub revisado:** `ziSirrush/GestorMantto` · `main` · `151bcb1952558ceab5cafa6bdad5c9c049fff951`  
**Prerrequisito:** aplicar primero `FASE_1_ALMACEN_ESQUELETO_V001`.

## Objetivo

Sustituir temporalmente la dependencia de las BG de NetSuite por una fuente controlada:

```text
Excel / CSV
    ↓
Backend Mantto Gestor
    ↓ validación + mapeo + transacción
Aiven · almacen_fuente_excel
    ↓
Dashboard Almacén + Inventario
```

Esta fase convierte **Dashboard** e **Inventario** de maqueta a lectura real desde Aiven. Stock, Préstamos, Resguardos y Auditoría permanecen explícitamente pendientes para sus fases V002 correspondientes.

## Alcance de base de datos

Se crea **una sola tabla nueva**, solicitada expresamente como fuente temporal:

- `almacen_fuente_excel`

La tabla persiste cada renglón del archivo, sus campos normalizados y `raw_json`, además de:

- `lote_importacion`;
- archivo/hoja/fila origen;
- fecha de corte/importación;
- hash del archivo y de la fila;
- encabezados y mapeo JSON;
- usuario que importó;
- bandera `activo`.

Cada importación se ejecuta dentro de una transacción. El lote anterior permanece activo hasta que el nuevo termina de insertarse correctamente. Solo al final se desactiva el lote anterior y se activa el nuevo. Un error provoca `ROLLBACK` y conserva la fuente anterior.

**El SQL no se ejecuta automáticamente.** Debe aplicarse manualmente en Aiven antes de probar el backend.

## Archivo aceptado

La fase acepta:

- `.xlsx` estándar no cifrado;
- `.csv` UTF-8.

No acepta `.xls`, `.xlsm` ni libros protegidos/cifrados.

Para evitar agregar una dependencia npm nueva y volver a desalinear `package.json` / `package-lock.json`, el backend incluye un lector XLSX acotado basado únicamente en módulos estándar de Node. Puede revisar varias hojas y selecciona la que tenga el mejor encabezado reconocido.

## Mapeo mínimo requerido

La validación **no importa por posición fija de columna**. Busca encabezados conocidos y exige como mínimo:

| Campo canónico | Requisito |
|---|---|
| Empresa | obligatorio |
| Almacén | obligatorio |
| Físico / existencia | obligatorio y numérico |
| Artículo o Código | al menos uno obligatorio |
| Categoría | opcional |
| Tipo de almacén | opcional |
| Precio unitario | opcional |
| Valor | opcional |
| Fecha de corte | opcional; también puede capturarse en pantalla |

Ejemplos de alias reconocidos: `Código`, `SKU`, `Artículo`, `Descripción`, `Empresa`, `Subsidiaria`, `Almacén`, `Bodega`, `Físico`, `Existencia`, `Stock`, `Precio unitario`, `Costo unitario`, `Valor inventario`.

### Regla fail-closed

La importación se detiene si encuentra filas con:

- Empresa vacía;
- Almacén vacío;
- sin Código y sin Artículo;
- existencia física no numérica.

No se activa un lote ambiguo. Los valores opcionales de precio/valor no numéricos se reportan como advertencia y quedan `NULL`.

**No puedo confirmar que los encabezados del Excel real estén cubiertos hasta revisar ese archivo.** Si no mapean, `/validar` responde `422`, muestra los encabezados detectados y **no modifica Aiven**.

## Valor de inventario

Orden de cálculo:

1. Si existe `Valor`, se usa el valor del archivo.
2. Si no existe, pero hay `Físico` y `Precio unitario`, se calcula `Físico × Precio unitario`.
3. Si no hay datos suficientes, el valor queda `NULL` y el frontend muestra `—`.

No se inventa `$0` cuando el origen no permite calcular valor.

## Backend nuevo

Archivos:

- `backend/src/modules/almacen/almacen.routes.js`
- `backend/src/modules/almacen/almacen.controller.js`
- `backend/src/modules/almacen/almacen.service.js`
- `backend/src/modules/almacen/xlsx-lite.js`

Rutas:

```text
GET  /api/almacen/dashboard
GET  /api/almacen/inventario
GET  /api/almacen/inventario/catalogos
GET  /api/almacen/inventario/empresa
GET  /api/almacen/inventario/almacenes
GET  /api/almacen/inventario/top
GET  /api/almacen/importaciones/capabilities
POST /api/almacen/importaciones/validar
POST /api/almacen/importaciones
```

Las lecturas reutilizan los permisos existentes:

- `ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- `ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

Dominio/grupo: `CORELLIAN / ALMACEN`.

La **carga temporal** queda restringida en esta fase a roles activos:

- `PROGRAMADOR`
- `PROGRAMADOR_CORELLIAN`

No se crean permisos nuevos en esta fase.

## Dashboard habilitado

Con el lote activo muestra:

- Valor total, cuando existe cobertura;
- Piezas;
- Almacenes;
- referencias sin stock;
- resumen por empresa;
- Top 5 almacenes;
- Top 15 artículos por volumen;
- Top 15 por valor.

**Top más movidos no se calcula**: un snapshot de Excel no permite distinguir consumo, entrada, transferencia o ajuste. Queda pendiente de movimientos/BG.

## Inventario habilitado

Tabs:

1. Inventario
   - búsqueda;
   - empresa;
   - categoría;
   - almacén;
   - valor mínimo/máximo;
   - solo con stock;
   - paginación de **30** registros.
2. Por Empresa
   - valor;
   - piezas;
   - precio promedio;
   - listado paginado 30.
3. Por Almacén
   - empresa;
   - búsqueda;
   - piezas, valor, referencias y tipo cuando venga en el archivo.
4. Top
   - por valor / cantidad;
   - empresa;
   - 10 / 20 / 30 / 50 resultados.

Las tablas mantienen su ancho útil y usan scroll horizontal interno. Los controles, cards, filtros y encabezados permanecen dentro del viewport.

## Qué NO hace esta fase

- No ejecuta el SQL en Aiven.
- No hace commit/push en GitHub.
- No despliega Azure/Netlify.
- No conecta BG de NetSuite.
- No calcula ABC, demanda, stock de seguridad, ROP, mínimos/máximos sin historia verificable.
- No inventa Préstamos o Resguardos si el Excel no trae esos datos.
- No crea histórico de Auditoría.
- No guarda el archivo binario XLSX en MySQL; guarda sus registros, metadatos, hash y representación original de cada fila en JSON.

## Orden de aplicación

1. Aplicar **FASE 1 ALMACÉN V001**.
2. Extraer este ZIP en la raíz del repo conservando carpetas.
3. Ejecutar:

```powershell
python .\aplicar_fase_2_almacen_v002.py
```

4. Revisar diff:

```powershell
git diff -- core/module-loader.js core/router.js backend/src/routes/index.js modules/almacen backend/src/modules/almacen sql/FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql
```

5. Aplicar manualmente en Aiven:

```text
sql/FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql
```

6. Reiniciar backend local.
7. Probar primero `Almacén > Inventario > Validar` con el Excel real.
8. Solo si la validación es correcta, usar `Importar y activar`.
9. Revisar Dashboard e Inventario en local antes de promover.

## Archivos globales modificados por el aplicador

- `core/module-loader.js`
  - solo cache-bust de las seis rutas Almacén a `20260830-almacen-fase2-excel-v002`.
- `core/router.js`
  - solo texto de contexto de Almacén.
- `backend/src/routes/index.js`
  - registra `almacenRoutes` en `/api/almacen`.

El script falla si Fase 1 no está presente o si los anchors no son inequívocos.

## Validación realizada al generar el paquete

- `node --check` de todos los JS nuevos.
- `py_compile` del aplicador.
- prueba sintética de lector `.xlsx` generado con OpenPyXL;
- prueba sintética `.csv`;
- prueba de selección de hoja correcta en libro con portada + datos;
- prueba de mapeo canónico y cálculo `Físico × Precio unitario`;
- prueba fail-closed de fila sin Empresa;
- prueba estática de endpoints/permisos/transacción/rollback;
- prueba de que el SQL crea exactamente **una** tabla y no contiene `DROP TABLE`;
- prueba de paginación 30;
- prueba responsive: tabla con scroll horizontal local, sin `zoom` ni `transform:scale()`;
- prueba de aplicación e idempotencia del script sobre worktree simulado de Fase 1.

**No se probó contra el Excel real.**  
**No se ejecutó contra Aiven real.**  
**No se hizo E2E contra Azure/Netlify.**
