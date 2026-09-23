# FIX_DASHBOARD_LOGISTICA_CORTES_HISTORICOS_V001

Fecha: 2026-09-23
Módulo: `Logística > Dashboard`
Tipo: FIX incremental de frontend

## Objetivo

Permitir cargar desde el Dashboard cualquiera de los cortes semanales de Logística que ya estén guardados en `logistica_cortes_semanales`, sin crear una tabla nueva ni volver a calcular el corte.

## Fuente verificada

En `main` del repositorio `ziSirrush/GestorMantto` se verificaron los endpoints ya existentes:

- `GET /api/logistica/cortes/semanales/ultimo`: último corte cerrado con `movimientos_json`.
- `GET /api/logistica/cortes/semanales`: catálogo histórico, ordenado de más reciente a más antiguo, hasta 100 registros.
- `GET /api/logistica/cortes/semanales/:anio/:semana`: corte específico con `snapshot_json` y `movimientos_json` parseados.

Archivos verificados en GitHub `main`:

- `backend/src/modules/logistica-cortes/logistica-cortes.routes.js`
- `backend/src/routes/index.js`

Por esto el FIX no modifica backend ni SQL.

## Comportamiento nuevo

El bloque **Movimientos semanales** incorpora un selector `Corte guardado`.

Al abrir el Dashboard:

1. Se sigue cargando el último corte cerrado como selección inicial.
2. Se consulta el catálogo de cortes guardados.
3. El selector muestra únicamente registros con `estado = CERRADO`.
4. Cada opción se presenta como `Semana NN / AAAA · X mov.`.

Al elegir otra semana se consulta:

`GET /api/logistica/cortes/semanales/:anio/:semana`

El Dashboard sustituye la tabla actual por el `movimientos_json` del corte seleccionado.

## Resumen visible del corte

Sobre la tabla se muestran cuatro indicadores del corte elegido:

- Movimientos.
- Ingresos.
- Cambios de estatus.
- Registros del corte (`total_log_ops`).

El subtítulo conserva año ISO, semana ISO y fecha del corte.

## Resiliencia

- Si falla el catálogo histórico pero `/ultimo` responde, el último corte sigue visible y el selector queda deshabilitado.
- Si falla la carga de otra semana, se conserva el corte que estaba visible.
- No se genera ni recalcula ningún corte desde el frontend.
- No se modifica `movimientos_json`, `snapshot_json` ni la tabla de cortes.

## Corrección incluida

Se corrigieron las referencias de inicialización/estado vacío de la tabla mensual del ring V002 para usar los IDs vigentes:

- `dl-containers-months-first`
- `dl-containers-months-second`

Esto evita depender del ID anterior `dl-containers-months-body`.

## Archivos modificados

- `modules/dashboard-logistica/dashboard-logistica.js`
- `modules/dashboard-logistica/dashboard-logistica.css`
- `core/module-loader.js`

## Prerrequisitos

Aplicar sobre la versión que ya contiene:

- FASE 1 Dashboard Logística Analítica.
- FASE 2 gráficas verticales.
- FASE 3 analítica visual.
- `FIX_DASHBOARD_LOGISTICA_RING_TABLA_12_MESES_V002`.

## Instalación

Copiar los archivos del ZIP respetando sus rutas y sobreescribir los existentes.

No ejecutar migraciones SQL. No hay cambios de backend en este FIX.

## Validaciones realizadas

Ejecutadas sobre los archivos entregados:

- `node --check modules/dashboard-logistica/dashboard-logistica.js` -> OK.
- `node --check core/module-loader.js` -> OK.
- `node --check tests/logistica_dashboard_cortes_historicos.test.js` -> OK.
- `node tests/logistica_dashboard_cortes_historicos.test.js` -> OK.
- Revisión del diff contra `FIX_DASHBOARD_LOGISTICA_RING_TABLA_12_MESES_V002` -> cambios localizados en Dashboard y cache-bust.
- Verificación en GitHub `main` de que los endpoints históricos requeridos ya existen -> OK.

No se realizó E2E contra Azure/Aiven ni despliegue remoto.

## Prueba funcional esperada

1. Abrir `Logística > Dashboard`.
2. Confirmar que `Movimientos semanales` muestra el último corte cerrado.
3. Abrir `Corte guardado`.
4. Elegir una semana anterior.
5. Confirmar que cambian:
   - movimientos,
   - ingresos,
   - cambios de estatus,
   - registros del corte,
   - filas de la tabla.
6. Volver a seleccionar la semana más reciente y confirmar que recupera su información.

## Alcance

Este FIX solo **consulta cortes existentes**. No crea cortes nuevos y no altera la lógica del job semanal.
