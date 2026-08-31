# FASE 2 — Gestión de Almacén — Motor común de fuente/cierre V001

Fecha: 31/08/2026  
Proyecto: Mantto Gestor  
Repo revisado: `ziSirrush/GestorMantto`  
Baseline confirmado: `main` · `ac57b79c6510a441fd7e4e960d6befdfd3fffac5` (`Version 083026.12 - Organizacion`)

## Prerrequisito

Aplicar primero:

```text
FASE_1_ALMACEN_EXCEL_ESTRUCTURA_OFICIAL_V001
```

Esta Fase 2 asume que ya existen en el repo:

```text
backend/src/modules/almacen/almacen.official-workbook.js
```

y la integración de Fase 1 dentro de `almacen.service.js`.

## Objetivo

Centralizar la selección de la fuente/cierre de Gestión de Almacén para evitar que Dashboard, Inventario, Stock, Préstamos, Resguardos y Auditoría tengan lógica independiente basada en `activo=1`.

Después de esta fase:

```text
almacen_fuente_excel
        ↓
almacen.source-engine.js
        ↓
resolveSource()
        ↓
lote_importacion resuelto
        ↓
almacen.query-service.js
        ↓
Dashboard / Inventario / Stock / Préstamos / Resguardos / Auditoría
```

## Regla funcional

Si una consulta no solicita un lote:

```text
usa el cierre actualmente activo
```

Si solicita:

```text
?loteImportacion=<ID_LOTE>
```

usa exactamente ese cierre histórico sin modificar `activo`, sin reimportar el Excel y sin afectar a otros usuarios.

La selección histórica es de solo lectura en esta fase.

## Histórico de cierres

Se agrega:

```http
GET /api/almacen/fuentes
```

La respuesta lista los lotes disponibles de `almacen_fuente_excel`, incluyendo conteos por tipo de registro cuando existan:

```text
INVENTARIO
PRESTAMO
RESGUARDO
```

Fase 2 no dibuja todavía el selector visual. El selector corresponde a Fase 3.

## Lecturas que aceptan `loteImportacion`

```text
GET /api/almacen/dashboard
GET /api/almacen/inventario
GET /api/almacen/inventario/catalogos
GET /api/almacen/inventario/empresa
GET /api/almacen/inventario/almacenes
GET /api/almacen/inventario/top
GET /api/almacen/stock
GET /api/almacen/prestamos/catalogos
GET /api/almacen/prestamos/resumen
GET /api/almacen/prestamos
GET /api/almacen/resguardos/catalogos
GET /api/almacen/resguardos
GET /api/almacen/auditoria/catalogos
GET /api/almacen/auditoria/muestra
```

Ejemplo:

```text
/api/almacen/dashboard?loteImportacion=<LOTE_HISTORICO>
```

## Auditoría en esta fase

Auditoría continúa siendo lectura/contraste. Su información esperada ya puede provenir del cierre solicitado:

```text
almacen_fuente_excel
    → cierre seleccionado
    → Auditoría / muestra
```

Esta fase NO escribe todavía en `almacen_auditoria`.

La persistencia de conteos, observaciones, diferencias y cierre de auditoría corresponde a Fase 3.

## Compatibilidad con Carga de Información

No se modifica el flujo definido en Fase 1:

```text
Excel → validar → importar → almacen_fuente_excel
```

Al importar un archivo nuevo:

- el nuevo lote continúa quedando activo;
- los lotes anteriores permanecen conservados;
- esos lotes históricos pueden consultarse con `loteImportacion` sin reactivarlos físicamente.

## Archivos incluidos

Todos los archivos incluidos son completos y están ubicados con la misma ruta que deben tener dentro de la raíz de `GestorMantto`:

```text
backend/src/modules/almacen/almacen.service.js
backend/src/modules/almacen/almacen.controller.js
backend/src/modules/almacen/almacen.routes.js
backend/src/modules/almacen/almacen.source-engine.js
backend/src/modules/almacen/almacen.query-service.js
```

Modificados:

```text
almacen.service.js
almacen.controller.js
almacen.routes.js
```

Nuevos:

```text
almacen.source-engine.js
almacen.query-service.js
```

## Forma correcta de aplicación

1. Tener aplicada Fase 1.
2. Hacer respaldo o revisar `git status` antes de sobrescribir.
3. Extraer este ZIP directamente sobre la raíz local de `GestorMantto`.
4. Permitir sobrescritura de los tres archivos existentes.
5. Revisar el diff antes de ejecutar el backend.

No existe aplicador `.py` y no se ejecuta ninguna acción automática sobre Aiven, GitHub, Azure o Netlify.

## Validación de sintaxis

Desde la raíz del repo:

```powershell
node --check .\backend\src\modules\almacen\almacen.service.js
node --check .\backend\src\modules\almacen\almacen.controller.js
node --check .\backend\src\modules\almacen\almacen.routes.js
node --check .\backend\src\modules\almacen\almacen.source-engine.js
node --check .\backend\src\modules\almacen\almacen.query-service.js
```

## Prueba local recomendada

Con backend reiniciado y al menos un lote activo:

```text
GET /api/almacen/dashboard
GET /api/almacen/fuentes
```

Tomar un lote histórico y probar:

```text
GET /api/almacen/dashboard?loteImportacion=<LOTE_HISTORICO>
GET /api/almacen/inventario?loteImportacion=<LOTE_HISTORICO>
GET /api/almacen/prestamos?loteImportacion=<LOTE_HISTORICO>
GET /api/almacen/resguardos?loteImportacion=<LOTE_HISTORICO>
GET /api/almacen/auditoria/catalogos?loteImportacion=<LOTE_HISTORICO>
```

Después volver a consultar sin parámetro. El lote activo original debe seguir siendo el predeterminado.

## Base de datos

No requiere SQL y no crea ni altera tablas.

Utiliza exclusivamente la tabla existente:

```text
almacen_fuente_excel
```

`almacen_auditoria` permanece intacta en Fase 2.

## Qué NO hace esta fase

- No crea selector visual de cierres.
- No cambia `activo` al consultar un histórico.
- No reimporta Excel para consultar un cierre previo.
- No persiste auditorías.
- No modifica `almacen_auditoria`.
- No modifica frontend.
- No ejecuta SQL.
- No hace commit/push.
- No despliega Azure, GitHub Pages ni Netlify.

## Validaciones realizadas al regenerar esta entrega

- `almacen.service.js` → `node --check`: OK.
- `almacen.controller.js` → `node --check`: OK.
- `almacen.routes.js` → `node --check`: OK.
- `almacen.source-engine.js` → `node --check`: OK.
- `almacen.query-service.js` → `node --check`: OK.
- Resolución de lote activo con conexión simulada: OK.
- Resolución de lote histórico con conexión simulada: OK.
- Lote inexistente → 404 en prueba simulada: OK.
- `query-service` sin filtros directos `activo=1`: OK.
- No se ejecutó prueba contra Aiven real.
- No se realizó despliegue ni escritura remota.
