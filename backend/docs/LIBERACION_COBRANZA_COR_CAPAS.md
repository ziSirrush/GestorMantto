# Corellian / Cobranza COR — Liberación aislada por capas
Fecha: 2026-11-23
Rama: release-cobranza-cor-opt-v1 (derivada de main, no de request)
Fuente de optimizaciones: request, commit 073c9d7b65f51f1d33b1bc187be12dedf9f7b16c
Main base: cec9f086f8f575298c2a59336132b52e5e6f6ac6

## Alcance y prohibiciones
- Solo archivos backend/src/modules/cobranza-cor/* afectados por la optimizacion, dos pruebas COR, este plan, un flujo QA de la rama y tres flags de .env.example.
- No se integra ni se activa ninguna mejora United: resumen-dia, dashboard-operativo, callcenter, cobranza-uni, experimental-ns.
- Tampoco se integran Almacen, Ventas, Logistica, Instalaciones ni integracion NetSuite.
- No se edita main, request, Aiven, NetSuite, Azure, Pages ni Netlify durante la preparacion.
- Se preparara PR en modo draft hacia main: SOLO para revision. Ningun merge ni deploy autorizado.
- Ninguna migracion/DDL, ningun cambio de formula financiera, pagos, contabilidad ni control de acceso.

## Optimizaciones incluidas: TODAS INACTIVAS (valor 0)
| Bandera | Cambios cuando vale 1 | Reversion |
| --- | --- | --- |
| BLT_OPT_COBRANZA_COR_SUMMARY_V1 | El resumen Dashboard no consulta aditivas de formulario que no presenta | Regresar a 0 |
| BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1 | Indexa relaciones pago/factura por ID sin cambiar importes ni orden de pagos | Regresar a 0 |
| BLT_OPT_COBRANZA_COR_BATCH_V1 | Precarga fuentes y facturas de hasta 24 PPNS autorizados en 2 queries por pagina resumen; cada detalle sigue validando acceso por proyecto | Regresar a 0 |

**Nota operacional**: las banderas son de entorno backend, no segmentan usuarios. Activarlas en Azure aplica a las peticiones correspondientes de Cobranza COR; NO es una canary por usuario. Una nueva configuracion de Azure puede reiniciar la instancia. No activar ninguna sin aprobacion y comparacion.

## Puertas (Gates) de liberacion
1. **COR-0 Preparacion:** main y release son equivalentes salvo los cambios COR permitidos; repo y tests limpios. GitHub Actions de release: npm ci, npm run check, npm test y casos COR; todas las flags 0.
2. **COR-1 Baseline:** autorizar una prueba de solo lectura. Capturar con el codigo anterior y el nuevo (0) resultados para mismas cuentas, PPNS, zona, asesor, moneda y periodo; medir SQL por llamada, latencias p50/p95, bytes, 5xx, memoria, CPU, estado del pool. No leer ni escribir facturas externas para cambiar estados.
3. **COR-2 Revision y promocion del codigo:** aprobar PR draft solo despues de COR-0/1; verificar el diff de main actualizado. El merge a main puede activar despliegue automatico Azure: ejecutar en ventana autorizada, con las tres banderas aun 0. Comprobar login, permisos, otras rutas y comportamiento legacy.
4. **COR-3 Resumen:** activar solo SUMMARY=1. Comparar respuesta de tipo RESUMEN 0 vs 1, incluyendo proyectos sin aditivas y con aditivas, MXN/USD/EUR, busqueda, paginacion y asesores. Si difiere, 0.
5. **COR-4 Relaciones de pagos:** con flags restantes 0, activar PAYMENT_INDEX=1; validar 1-7 pagos por factura, varios hitos, pagos parcializados/diferidos, relaciones sin factura, fechas y sumas. Si difiere, 0.
6. **COR-5 Precarga por lote:** con batch 0 comparar pagina resumen de 1, 8 y 24 proyectos, mezcla de monedas, zonas y asesores. Activar BATCH=1 y comparar SHA JSON normalizado/cifras/orden con 0, incluyendo pagina vacia. Verificar especialmente que no haya fuga territorial ni diferencias en saldos; volver a 0 ante cualquier anomalía.
7. **COR-6 Cierre:** solo si COR-3/4/5 pasan, registrar metricas, resultados y aprobacion. Continuar con el siguiente modulo Corellian en un release independiente.

## Matriz de regresion exigida
- Acceso: sin rol, acceso limitado a asesor, dos asesores, multiples zonas, cuentas sin permisos. 403/404 y solo PPNS autorizados; 0 exposición extra.
- Identidad: PPNS con mayusculas/minusculas, espacios, duplicados, sin fuente, sin factura.
- Finanzas: cero pagos, 1 pago, varios pagos por factura, parcial/diferido, moneda MXN/USD/EUR, saldo cero y positivo, facturas historicas, aditivas, cancelados.
- Dashboard: tipo DETALLE no se beneficia del batch; RESUMEN pagina 1/2/ultima/fuera de rango, filtro moneda/asesor/año.
- Paridad: comparar JSON normalizado y campos financieros, sin excluir ID, importes, saldo, fecha ni estado. Un cambio no esperado = NO GO.
- Rendimiento: >=30 lecturas comparables por escenario; p50/p95, SQL/request, bytes, slow query >750 ms, errores 4xx/5xx, CPU, memoria, pool.
- La mejora de consultas no prueba por si sola que el sistema sea mas rapido: evaluar resultado SQL EXPLAIN del lote, saturación y tiempo total.

## Rollback
- Una bandera alterada: devolverla a 0, esperar el reinicio/config del servicio si aplica, repetir los mismos casos y documentar recuperacion.
- Si el codigo con banderas 0 causa regresion: revertir el PR/commit de liberacion (no hacer force-push sobre main) y comprobar funcionamiento de Pages y Netlify contra Azure.
- Si finanzas o permisos difieren: NO GO sin excepciones.
- No se debe continuar a la siguiente capa mientras exista un hallazgo de datos no resuelto.

## Estado actual
- El QA del commit original request 073c9d7b paso en Github Actions (suites automatizadas con datos simulados).
- La rama aislada debe completar su propio QA CI; no afirmar QA vivo, métricas o reconciliacion financiera antes de ejecutarlas.
- Aprobación humana pendiente para promover cualquier codigo y para activar flags en Azure.
