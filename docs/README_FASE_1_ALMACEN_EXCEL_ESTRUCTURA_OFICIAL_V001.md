# FASE 1 — Gestión de Almacén — Excel Estructura Oficial V001

Fecha: 31/08/2026  
Proyecto: Mantto Gestor  
Repositorio: `ziSirrush/GestorMantto`  
Baseline confirmado de `main`: `ac57b79c6510a441fd7e4e960d6befdfd3fffac5` — `Version 083026.12 - Organizacion`

## Forma de entrega

Este ZIP está preparado para **extraerse directamente sobre la raíz de `GestorMantto`**.

No contiene aplicadores `.py`, instaladores ni ejecución automática de SQL.

Archivos entregados completos:

```text
backend/
└── src/
    └── modules/
        └── almacen/
            ├── almacen.service.js
            └── almacen.official-workbook.js
README_FASE_1_ALMACEN_EXCEL_ESTRUCTURA_OFICIAL_V001.md
```

`almacen.service.js` es el archivo completo resultante de aplicar esta Fase 1 sobre el `main` confirmado arriba; no es un fragmento ni un parche parcial.

## Objetivo de Fase 1

Adaptar la validación/importación temporal de Gestión de Almacén para reconocer el formato operativo de inventarios definido para el Excel, conservando el validador genérico actual como fallback.

Flujo vigente del repo:

```text
Excel / CSV
   ↓
Almacén > Carga de Información
   ↓
POST /api/almacen/carga/validar
   ↓
Validador estructura operativa o validador genérico
   ↓
POST /api/almacen/carga/importar
   ↓
Aiven · almacen_fuente_excel
```

La carga Excel continúa siendo una **fuente temporal** para compensar que esta información todavía no existe nativamente en Aiven. No se convierte en la fuente definitiva del módulo.

## Estructura operativa reconocida

Cuando el libro contiene marcadores del perfil operativo, se esperan obligatoriamente estas tres hojas de detalle:

```text
CORELLIAN DET
NUBIAN DET
UNITED DET
```

La empresa se obtiene del nombre de la hoja:

```text
CORELLIAN DET -> Corellian
NUBIAN DET    -> Nubian
UNITED DET    -> United
```

En cada hoja `DET` se interpreta la matriz:

```text
Columna A -> Artículo de inventario
Columna B -> Código
Columna C -> Costo / precio unitario
Columna D en adelante -> un almacén por columna
```

Cada intersección Artículo × Almacén se normaliza a un registro independiente para `almacen_fuente_excel`.

El valor por registro se calcula únicamente cuando existe precio unitario:

```text
valor = fisico * precio_unitario
```

Las cantidades en cero no generan registros normalizados para evitar materializar combinaciones vacías de la matriz.

## ARTICULOS

Si existe la hoja `ARTICULOS`, se usa como catálogo complementario:

```text
Columna C -> Artículo
Columna D -> Parte
Columna E -> Categoría
```

La categoría se integra al inventario cuando se encuentra coincidencia por artículo. Si la hoja no existe, el inventario puede continuar y Categoría queda `NULL` con advertencia.

## Préstamos

Se reconocen opcionalmente:

```text
Desglose Prestamo Corellian
Desglose Prestamo United
```

Estructura esperada:

```text
Fecha | Artículo | Cantidad | Costo | Responsable | Sitio | AG | Antigüedad
```

Se almacenan mediante el tipo existente:

```text
tipo_registro = PRESTAMO
```

## Resguardos

Se reconoce opcionalmente:

```text
RESGUARDOS
```

Se reutilizan los campos ya existentes de `almacen_fuente_excel` y:

```text
tipo_registro = RESGUARDO
```

## Movimientos

Se detectan informativamente las hojas:

```text
CORELLIAN MOVIMEINTOS
NUBIAN MOVIMEINTOS
UNITED MOVIMEINTOS
```

La grafía `MOVIMEINTOS` se conserva porque corresponde al nombre esperado del formato operativo.

**Fase 1 no persiste MOVIMIENTO ni recalcula Stock a partir de esas hojas.** Esa integración pertenece a la siguiente fase de programación.

## Compatibilidad y fail-closed

El validador anterior sigue disponible para archivos genéricos que no correspondan al perfil operativo.

Cuando se detecta el perfil operativo, la validación no cae silenciosamente al parser genérico. Se detiene con error si, entre otros casos:

- falta alguna hoja `CORELLIAN DET`, `NUBIAN DET` o `UNITED DET`;
- una hoja DET no tiene encabezado reconocible;
- no existen columnas de almacén;
- una existencia no vacía no es numérica;
- un préstamo trae cantidad no numérica;
- un resguardo trae cantidad no numérica o sin Subsidiaria;
- se supera el límite vigente de filas normalizadas.

En una validación fallida no se ejecuta la importación.

## Histórico

Fase 1 no elimina el comportamiento transaccional existente de importación:

- se genera un nuevo `lote_importacion`;
- el lote nuevo se inserta antes de sustituir al activo;
- los lotes anteriores no se borran;
- el histórico permanece en `almacen_fuente_excel`.

La selección/reapertura de cierres históricos no pertenece a Fase 1.

## Base de datos

**No requiere SQL.**

No crea ni modifica tablas.

Reutiliza:

```text
almacen_fuente_excel
```

La tabla:

```text
almacen_auditoria
```

no se usa ni modifica en esta fase.

## Instalación

1. Haz respaldo o verifica tu estado Git local.
2. Extrae el contenido del ZIP directamente sobre la raíz de `GestorMantto`.
3. Permite sobrescribir `backend/src/modules/almacen/almacen.service.js`.
4. El archivo `backend/src/modules/almacen/almacen.official-workbook.js` debe quedar agregado.
5. Revisa el diff antes de continuar.

Validación de sintaxis:

```powershell
node --check .\backend\src\modules\almacen\almacen.service.js
node --check .\backend\src\modules\almacen\almacen.official-workbook.js
```

Después reinicia el backend local y prueba:

```text
Gestión de Almacén > Carga de Información > Validar
```

con el Excel operativo antes de ejecutar la importación.

## Alcance explícitamente NO incluido

Esta fase no:

- crea selector visual de cierres;
- cambia Dashboard/Inventario/Stock/Préstamos/Resguardos para seleccionar un lote histórico;
- escribe en `almacen_auditoria`;
- guarda auditorías;
- activa hojas MOVIMEINTOS como fuente operativa;
- crea o altera tablas;
- cambia permisos;
- ejecuta SQL;
- hace commit o push a GitHub;
- despliega Azure, GitHub Pages o Netlify.

## Validación realizada al regenerar la entrega

- El archivo base `almacen.service.js` fue contrastado contra el blob de GitHub `96c2c8be83a8649a8dd02bd50699fa47e2c56712`, correspondiente al `main` confirmado.
- `node --check backend/src/modules/almacen/almacen.service.js`: OK.
- `node --check backend/src/modules/almacen/almacen.official-workbook.js`: OK.
- Prueba sintética del perfil operativo: OK.
- Detección de las tres hojas DET: OK.
- Empresa inferida por hoja: OK.
- Normalización Artículo × Almacén: OK.
- Omisión de cantidades cero: OK.
- Categoría desde ARTICULOS: OK.
- Préstamos Corellian/United: OK.
- Resguardos: OK.
- Detección informativa de MOVIMEINTOS: OK.
- Fail-closed al faltar una hoja DET: OK.
- Fallback genérico cuando no se detecta el perfil: OK.

No se realizó conexión ni escritura en Aiven durante la generación del ZIP y no se modificó GitHub, Azure ni Netlify.
