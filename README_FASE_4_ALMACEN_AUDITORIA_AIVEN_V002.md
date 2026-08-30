# Fase 4 — Almacén — Auditoría contra inventario Aiven V002

**Fecha:** 30/08/2026  
**Proyecto:** Mantto Gestor  
**Baseline:** `FASE_3_ALMACEN_OPERATIVOS_EXCEL_V002`  
**Prerrequisitos:** Fase 1 Almacén V001 + Fase 2 Datos Excel V002 + Fase 3 Operativos Excel V002.

## Decisión de alcance

Esta versión implementa **Auditoría en modo consulta/contraste, sin persistencia histórica**.

Motivo:

- `almacen_fuente_excel` es la fuente temporal del lote importado, no una tabla histórica de auditorías;
- mezclar conteos de auditoría con filas de importación rompería la separación de responsabilidades y la trazabilidad del lote;
- crear tablas históricas nuevas requiere una decisión explícita de esquema y no se hace silenciosamente en esta fase.

Por ello F4 V002 **NO crea SQL**, **NO agrega tabla**, **NO guarda auditorías** y **NO usa almacenamiento local del navegador**.

## Flujo implementado

```text
Excel importado
     ↓
Backend Fase 2/3
     ↓
Aiven · almacen_fuente_excel
     ↓ activo=1 + tipo_registro=INVENTARIO
Auditoría F4 V002
     ↓
Selección de empresa/almacén
     ↓
Muestra de artículos desde Aiven
     ↓
Captura física en memoria
     ↓
Contraste esperado vs encontrado
     ↓
Resumen + Imprimir/Guardar PDF
```

El PDF se genera desde la sesión del navegador y no implica persistencia del resultado.

## Fuente del esperado

Solo se consideran registros:

```text
activo = 1
tipo_registro = INVENTARIO
fisico > 0
```

Por cada empresa + almacén, el backend devuelve referencias, piezas y valor esperado. La muestra consolida un artículo por Código/Artículo dentro de ese almacén y utiliza:

- `fisico` → existencia esperada;
- `valor` cuando existe, o el valor normalizado por Fase 2/3 → valor esperado;
- valor unitario implícito = valor esperado / existencia esperada cuando ambos están disponibles.

No se inventa valor cuando el lote no tiene cobertura.

## Muestreo

Se conserva la regla funcional del prototipo:

- tamaño objetivo: **5% de las referencias** del almacén;
- mínimo: hasta **3 artículos** cuando el almacén tenga al menos 3 referencias;
- aproximadamente **70%** desde un grupo orientado a mayor valor;
- **30%** aleatorio entre las referencias restantes;
- la muestra se mezcla antes de enviarse al frontend.

La muestra vive solo durante la sesión actual. Si se cancela o se recarga la pantalla, no se reconstruye como auditoría histórica.

## Captura y contraste

Cada artículo permite:

- capturar **Encontrado**;
- marcar **✓ Correcto**, que copia la existencia esperada;
- visualizar diferencia de piezas;
- visualizar diferencia de valor cuando existe valor unitario comparable.

Al completar todos los artículos, **Finalizar contraste** muestra:

- renglones correctos;
- porcentaje de coincidencia exacta;
- piezas esperadas;
- piezas encontradas;
- diferencia total de piezas;
- impacto estimado de valor sobre artículos con cobertura;
- tabla de detalle.

No se crea un porcentaje sintético de “cumplimiento de monto” que pueda ocultar sobrantes; se reportan las diferencias observadas directamente.

## Backend

Archivos completos modificados:

- `backend/src/modules/almacen/almacen.routes.js`
- `backend/src/modules/almacen/almacen.controller.js`
- `backend/src/modules/almacen/almacen.service.js`

Endpoints nuevos, ambos **GET**:

```text
GET /api/almacen/auditoria/catalogos
GET /api/almacen/auditoria/muestra?company=...&warehouse=...
```

No existe endpoint de escritura de Auditoría en esta versión.

### Permiso

Se reutiliza el permiso ya empleado por Stock, Préstamos y Resguardos:

```text
ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

Dominio/grupo:

```text
CORELLIAN / ALMACEN
```

No se crean permisos nuevos.

## Frontend

Archivos completos modificados:

- `modules/almacen/almacen.js`
- `modules/almacen/almacen.css`

Auditoría deja de ser `Pend. Información` y pasa a tener tres estados reales:

1. **Selección** — catálogo de almacenes consultado desde Aiven.
2. **Captura** — muestra real y conteo físico en memoria.
3. **Resultado** — diferencias y reporte imprimible.

No se usa `localStorage` ni otra persistencia del navegador para el histórico.

## SQL

**No hay SQL de Fase 4 V002.**

Esta fase no modifica el esquema ni escribe resultados en `almacen_fuente_excel`.

Si posteriormente se autoriza persistir auditorías, deberá diseñarse una estructura histórica propia (cabecera + detalle o equivalente reutilizable tras revisar el esquema vigente). Esa decisión no forma parte de este paquete.

## Orden de aplicación

1. Tener aplicadas Fases 1, 2 V002 y 3 V002.
2. Extraer `FASE_4_ALMACEN_AUDITORIA_AIVEN_V002` dentro de la raíz del repo.
3. Ejecutar desde la raíz:

```powershell
python .\FASE_4_ALMACEN_AUDITORIA_AIVEN_V002\aplicar_fase_4_almacen_v002.py
```

4. Revisar:

```powershell
git diff -- core/module-loader.js modules/almacen/almacen.js modules/almacen/almacen.css backend/src/modules/almacen/almacen.routes.js backend/src/modules/almacen/almacen.controller.js backend/src/modules/almacen/almacen.service.js
```

5. Reiniciar backend local.
6. Abrir **Almacén > Auditoría**.
7. Confirmar que aparece el lote activo y sus almacenes.
8. Seleccionar un almacén y generar muestra.
9. Capturar todos los artículos y finalizar el contraste.
10. Validar impresión/PDF.
11. Solo después promover por el flujo normal del proyecto.

## Cache-bust

El aplicador cambia las 12 referencias Almacén en `core/module-loader.js` a:

```text
20260830-almacen-fase4-auditoria-v002
```

No modifica `index.html`, `core/router.js` ni `backend/src/routes/index.js` porque el montaje de Almacén ya existe desde fases anteriores.

## Validaciones del paquete

- `node --check` de routes, controller, service y frontend;
- `py_compile` del aplicador;
- smoke test de backend con Aiven simulado;
- muestra 5% con mínimo de 3 cuando corresponde;
- prueba de que Auditoría no ejecuta INSERT/UPDATE/DELETE/DDL;
- prueba de que solo consume `INVENTARIO` activo;
- prueba de que no existe endpoint POST de Auditoría;
- prueba de que frontend no usa persistencia local;
- prueba de ausencia de `Pend. Información` en el frontend V002;
- responsive sin `zoom` ni `transform:scale()`;
- prueba del aplicador sobre worktree simulado de Fase 3.

## Lo que NO se ha validado E2E

- No se ejecutó contra Aiven real.
- No se desplegó Azure.
- No se desplegó GitHub Pages/Netlify.
- No se hizo una auditoría física real.
- No se confirmó todavía la distribución real de referencias/valores de tu Excel productivo.

El paquete está preparado y validado estáticamente/localmente, pero eso no equivale a despliegue ni validación productiva.
