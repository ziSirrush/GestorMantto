# BLT NOW | Optimización de información: liberación por capas
Fecha de preparación: 2026-11-20. Rama de trabajo: `request`.

## Objetivo
Eliminar cálculos/consultas/transferencias redundantes sin separar servicios, crear
fuentes de verdad, cambiar permisos, cambiar fórmulas financieras ni tocar Aiven.
`main`, Azure, Pages y Netlify no se actualizan por preparar esta rama.

## Línea base
- `request` integró `main` al commit `cec9f086f8f575298c2a59336132b52e5e6f6ac6`
  mediante merge con dos padres `5d5257f56db5f93827501318d82cccfe4de38bf2`.
- Los datos SQL del 10-nov son referencia histórica, nunca Aiven vivo.
- No hay benchmark real, EXPLAIN Aiven, prueba en Pages ni validación E2E en este corte.
- La sincronización y los módulos financieros requieren controles adicionales.

## Hitos preparados en request (NO implica producción)
1. Almacén: listado de inventario reutiliza COUNT del resumen, eliminando una
   lectura agregada (cambio sin flag; revertir mediante commit inverso).
2. Call Center U365D: `BLT_OPT_CC_U365_WINDOW_COUNT=1` activa
   `COUNT(*) OVER()` para filas + total; página vacía hace conteo de respaldo.
   Nunca incluye columna interna del total en JSON de filas.
3. Dashboard Operativo: `BLT_OPT_PREVENTIVOS_RANGE_V1=1` filtra
   `mes_servicio DATE` por intervalos semiabiertos y compacta meses consecutivos.
   Conserva tipo PREVENTIVO, unión a portafolio, sumas y alcance por zona.
4. Almacén: `BLT_OPT_ALMACEN_FILTERS_V1=1` usa ROLLUP para total
   y empresas (dashboard/stock), elimina cruces del catálogo donde solo se leen
   empresa, almacén, existencias y valor. Las categorías siguen usando catálogo.

Las tres banderas se evalúan en backend y tienen valor legacy por defecto.
La activación en Azure App Settings requiere autorización independiente y puede
reiniciar el proceso: comprobar compatibilidad con GitHub Pages y Netlify.

## Capas propuestas de liberación
| Orden | Ámbito | Activación | Comprobación y reversión |
| --- | --- | --- | --- |
| C0 | QA base | Sin publicación | Pruebas locales, contratos, datasets, EXPLAIN SELECT (solo lectura) |
| C1 | Almacén COUNT | Commit aislado | Paginación, filtros, NULL, stock; revertir commit si difiere |
| C2 | Preventivos indexables | Flag individual 0->1 | Totales por zona/mes, meses disjuntos, índice de fecha; retornar 0 |
| C3 | U365D conteo window | Flag individual 0->1 | Fila, total, página fuera de rango, zona, permisos; retornar 0 |
| C4 | Almacén catálogos / ROLLUP / stock | Flag individual 0->1 | Referencias, físicos, valores, subsidiarias y NULL; retornar 0 |
| C5 | UI histórica paginada y payloads | Requiere acuerdo Nevera y pruebas UI | Comparación de navegación, fechas, búsquedas y gráficos |
| C6 | Cobranza COR/UNI por lotes | Requiere reconciliación financiera y accesos | Pagos parciales, facturas, saldos, moneda, permisos |
| C7 | NS incremental / identidad / cache | Requiere contrato semántico de NULL, ACK y pruebas NS | Ledger, checkpoints, reintento, no pérdida/duplicados |
| C8 | Índices SQL | Archivo SQL aparte, no repo; autorización Aiven | SHOW INDEX, EXPLAIN, backup, DDL supervisado |

No se debe promover C5-C8 como implementadas sin pruebas y acuerdo específico.

## Orden técnico de promoción
1. Verificar que `main` no avanzó mientras se revisaba la rama.
2. Ejecutar `cd backend && npm ci && npm test` y `npm run check`.
3. Probar respuestas legacy (=0) y optimized (=1) contra un mismo dataset
   autorizado; comparar JSON normalizado, excluyendo marcas volátiles.
4. Medir latencia p50/p95, consultas SQL por solicitud, filas recibidas,
   errores 4xx/5xx, memoria, CPU y saturación del pool.
5. Promover una sola capa por commit/PR de integración a main, solo previa
   autorización. Un push de backend a main puede desplegar Azure;
   frontend Pages también depende de main. No promover todas en bloque.
6. Activar una sola bandera por ventana, mantener las demás en 0;
   verificar permisos y resultados antes y después; regresar a 0 si falla.
7. Comprobar ambas versiones consumidoras del backend: Pages y Netlify.
8. Netlify se queda en la versión publicada hasta un Combo Diario autorizado.

## Criterios GO / NO GO
- **Datos equivalentes**: mismas filas visibles, mismo total, mismas monedas,
  mismos saldos de pagos parciales y mismos rangos de fechas.
- **Seguridad**: sin fuga entre zonas, dominios ni usuarios; Guard intacto.
- **Rendimiento**: mejora medible de consultas/carga sin incremento sostenido
  de p95, errores, CPU, memoria o pool. Sin benchmark, no afirmar porcentaje.
- **Reversión**: flag 1->0 sin migración para C2-C4; C1 mediante revert.
- **Cobertura de pruebas**: test unitario + HTTP/contratos + E2E autorizado.

## Pendientes no implementados en esta tanda
- Resumen del Día: selector día/histórico y proyección de columnas.
- Dashboard Operativo: ventana de tickets y carga histórica.
- Call Center U365D: paginación **real del frontend** (hoy baja todas las páginas).
- Cobranza COR/UNI: operaciones por lotes que mantengan exactamente los pagos.
- Instalaciones, Logística y Ventas: normalización de consultas por identidad.
- Experimental NS: huella/invalidez sin perder frescura ni exactitud.
- NetSuite: contrato explícito entre campo ausente, NULL y borrado intencional.
- Índices duplicados: se preparan solo en SQL externo tras verificar Aiven.

Este documento es un plan técnico, no es la Constitución del proyecto,
no aprueba despliegues ni sustituye validación de Joseph.
