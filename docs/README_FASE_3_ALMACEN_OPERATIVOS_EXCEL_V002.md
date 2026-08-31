# Fase 3 — Almacén — Stock + Préstamos + Resguardos desde Excel V002

**Fecha:** 30/08/2026  
**Proyecto:** Mantto Gestor  
**Baseline GitHub revisado:** `ziSirrush/GestorMantto` · `main` · `151bcb1952558ceab5cafa6bdad5c9c049fff951`  
**Prerrequisito:** aplicar primero `FASE_1_ALMACEN_ESQUELETO_V001` y `FASE_2_ALMACEN_DATOS_EXCEL_V002`.

## Objetivo

Convertir los tres módulos operativos de Almacén de maqueta a consulta real **sin depender todavía de las BG**:

1. Stock
2. Préstamos
3. Resguardos

Se conserva la arquitectura temporal aprobada:

```text
Excel .xlsx
   ↓
Backend Mantto Gestor
   ↓ validación + clasificación por hoja + transacción
Aiven · almacen_fuente_excel
   ↓
Dashboard / Inventario / Stock / Préstamos / Resguardos
```

## Regla principal: sigue existiendo una sola tabla

Esta fase **NO crea otra tabla**. Amplía la tabla creada en Fase 2:

- `almacen_fuente_excel`

Se agrega `tipo_registro` para poder guardar dentro del mismo lote:

- `INVENTARIO`
- `PRESTAMO`
- `RESGUARDO`

Stock no es un cuarto tipo: se deriva del conjunto `INVENTARIO`.

También se modifica la llave única de Fase 2 para permitir que distintas hojas del mismo libro tengan la misma fila física:

```text
lote_importacion + tipo_registro + hoja_origen + fila_origen
```

El SQL de Fase 3 es idempotente, no contiene `CREATE TABLE` ni `DROP TABLE` y debe ejecutarse **manualmente** en Aiven.

## Importación multihoja

Fase 2 seleccionaba únicamente la mejor hoja de inventario. Fase 3 extiende ese mismo importador para reconocer, dentro de un único `.xlsx`, hasta tres conjuntos independientes.

### Inventario — obligatorio

Sigue siendo obligatorio para aceptar una importación. Requiere:

- Empresa
- Almacén
- Físico / existencia
- Artículo o Código

La validación fail-closed de Fase 2 permanece.

### Préstamos — opcional

Se activa únicamente si se detectan como mínimo:

- Empresa
- Fecha
- Artículo
- Responsable
- Cantidad
- y al menos uno de: AG o Sitio (para no confundir una hoja de inventario con préstamos)

Campos reconocidos adicionales:

- Código
- AG
- Sitio
- Costo
- Valor

Si se detecta una hoja de Préstamos pero contiene filas sin Empresa, Fecha, Artículo, Responsable o una Cantidad no numérica, **la importación completa se detiene**. No se activa un lote parcial o ambiguo.

### Resguardos — opcional

Se activa si se detectan:

- Subsidiaria / Empresa
- Descripción
- Cantidad
- y al menos un campo característico de resguardo, como Folio, Departamento, Entregado por, A cargo de, Proyecto o Equipo.

Campos reconocidos:

- Fecha
- Folio
- Subsidiaria
- Departamento
- AG
- Cantidad
- Unidad
- Descripción
- Proyecto
- Equipo
- Entregado por
- Salida
- A cargo de
- Ubicación
- Con stock

Una hoja detectada como Resguardo con Empresa/Descripción faltante o Cantidad no numérica bloquea la importación.

## Stock

El módulo ya consulta existencia física real desde `INVENTARIO`.

También reconoce, **solo cuando el Excel los trae explícitamente**:

- ABC
- Criticidad
- Demanda
- Stock de seguridad
- Punto de reorden / ROP
- Mínimo
- Máximo

### Lo que esta fase NO calcula

No se generan artificialmente:

- ABC
- demanda histórica
- desviación de demanda
- Stock de seguridad
- ROP
- mínimo
- máximo

No existe información suficiente para derivarlos correctamente a partir de un snapshot de inventario. Si el Excel no trae el campo, el frontend muestra `—` y una explicación de cobertura.

### Alertas de Stock

Solo se evalúan contra valores explícitos del archivo:

```text
Físico < Stock seguridad  → critico
Físico <= Punto reorden   → reorden
Físico > Máximo           → exceso
otro caso                 → ok
```

La prioridad es `critico` → `reorden` → `exceso`.

La tabla mantiene paginación de 30 registros y scroll horizontal interno.

## Préstamos

Con un conjunto `PRESTAMO` activo muestra:

- Total de registros/artículos en préstamo
- Valor en préstamo cuando existe costo/valor
- Piezas totales
- Responsables
- Vista por responsable
- Detalle individual
- Filtros por empresa, responsable, antigüedad y búsqueda
- Fecha, Artículo, AG, Responsable, Sitio, Cantidad, Costo y días
- Paginación de 30 registros en detalle

### Rangos de antigüedad

La V001 contenía una contradicción: después de `6-15 MESES` mostraba `MAYOR A 6 MESES`, lo que solapaba los rangos. **No se corrigió silenciosamente**; en V002 queda documentado y normalizado como:

- `1-6 MESES`: hasta 180 días
- `6-15 MESES`: 181 a 450 días
- `MAYOR A 15 MESES`: más de 450 días

Los días se calculan con la fecha del préstamo contra la fecha del servidor MySQL al consultar.

## Resguardos

Con un conjunto `RESGUARDO` activo muestra:

- Total resguardos
- Con salida registrada
- Sin salida
- Filtrados
- búsqueda por descripción/proyecto/AG/folio
- subsidiaria
- departamento
- estado de salida
- tabla completa de 15 columnas
- paginación de 30 registros

`Con salida` significa que el campo `Salida` del archivo tiene un valor no vacío. No se interpreta ni inventa un flujo de entrega adicional.

## Cuando el Excel no trae Préstamos o Resguardos

Dashboard, Inventario y Stock actual continúan funcionando.

Préstamos y Resguardos muestran explícitamente que el lote activo no contiene un conjunto compatible. **No se transforman existencias de inventario en préstamos/resguardos ni se simulan registros.**

## Backend

Archivos completos modificados:

- `backend/src/modules/almacen/almacen.routes.js`
- `backend/src/modules/almacen/almacen.controller.js`
- `backend/src/modules/almacen/almacen.service.js`

Se reutiliza sin modificación el lector `xlsx-lite.js` instalado por Fase 2.

Endpoints nuevos:

```text
GET /api/almacen/stock
GET /api/almacen/prestamos/catalogos
GET /api/almacen/prestamos/resumen
GET /api/almacen/prestamos
GET /api/almacen/resguardos/catalogos
GET /api/almacen/resguardos
```

Los endpoints existentes de Dashboard, Inventario e Importaciones permanecen.

## Permisos

No se crean permisos nuevos.

Stock, Préstamos y Resguardos reutilizan el permiso existente del dominio Almacén:

```text
ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

El guard continúa bajo:

```text
CORELLIAN / ALMACEN
```

Dashboard e Inventario conservan sus permisos de Fase 2.

## Frontend

Archivos completos modificados:

- `modules/almacen/almacen.js`
- `modules/almacen/almacen.css`

Se mantiene el contrato responsive del Gestor:

- cards, filtros, KPIs, botones y encabezados permanecen dentro del viewport;
- las tablas pueden conservar un ancho superior al viewport;
- el desbordamiento de tablas ocurre únicamente dentro de `.alm-table-wrap` con scroll horizontal;
- no se usa `zoom` ni `transform:scale()` para acomodar contenido.

## SQL

Aplicar manualmente después de extraer el paquete:

```text
sql/FASE_3_ALMACEN_OPERATIVOS_EXCEL_V002.sql
```

El SQL:

- exige que `almacen_fuente_excel` ya exista;
- agrega `tipo_registro`;
- agrega columnas de Stock opcionales;
- agrega campos comunes de Préstamos y Resguardos;
- reemplaza la llave única de Fase 2;
- agrega índices de consulta;
- marca registros históricos existentes como `INVENTARIO`;
- no borra información existente.

## Orden de aplicación

1. Fase 1 Almacén V001.
2. Fase 2 Almacén Datos Excel V002.
3. Confirmar que `almacen_fuente_excel` existe.
4. Extraer este ZIP en la raíz del repo conservando carpetas.
5. Ejecutar:

```powershell
python .\aplicar_fase_3_almacen_v002.py
```

6. Aplicar manualmente en Aiven:

```text
sql/FASE_3_ALMACEN_OPERATIVOS_EXCEL_V002.sql
```

7. Reiniciar backend local.
8. Volver a validar e importar el Excel. Un lote importado antes de Fase 3 seguirá siendo `INVENTARIO`; para cargar Préstamos/Resguardos hay que volver a importar el `.xlsx` con esas hojas.
9. Probar Stock, Préstamos y Resguardos en local.
10. Solo después promover a GitHub Pages/Netlify según el flujo normal del proyecto.

## Cache-bust

El aplicador cambia únicamente las 12 referencias de `modules/almacen/almacen.css/js` en `core/module-loader.js` a:

```text
20260830-almacen-fase3-operativos-v002
```

No reescribe `index.html`, no cambia navegación y no vuelve a montar `/api/almacen`, porque eso ya pertenece a Fase 1/Fase 2.

## Validación realizada al generar

- `node --check` de service/controller/routes/frontend;
- `py_compile` del aplicador;
- smoke test multihoja con Inventario + Préstamos + Resguardos mediante parser simulado;
- verificación de 5 registros distribuidos 2/2/1;
- verificación de importación transaccional;
- verificación de correspondencia entre placeholders y parámetros SQL;
- prueba estática de permisos/endpoints/tipos de registro;
- SQL verificado para no crear ni borrar tablas;
- contrato responsive: scroll horizontal local de tablas y sin zoom/scale;
- prueba de aplicación e idempotencia del cache-bust.

## Lo que NO puedo confirmar todavía

**No puedo confirmar que el Excel real que usarás contenga encabezados compatibles de Préstamos, Resguardos o parámetros avanzados de Stock porque ese archivo real todavía no fue proporcionado.**

La validación del importador está diseñada para informar exactamente qué conjuntos fueron reconocidos antes de activar el lote.

Tampoco se ejecutó esta fase contra Aiven real ni se realizó E2E en Azure/Netlify.
