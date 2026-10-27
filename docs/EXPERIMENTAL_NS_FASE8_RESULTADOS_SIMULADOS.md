# Experimental NS F8 · Resultados de carga SIMULADA en localhost

Fecha (UTC): 2026-10-27T01:59:08.511Z

**Advertencia:** este banco mide HTTP loopback + coalescencia con repositorio MySQL simulado. **No mide Azure, Aiven, NetSuite ni usuarios reales.**

| Usuarios simulados concurrentes | Solicitudes HTTP | Consultas SQL simuladas | Consultas sin coalescencia | Reducción modelada | p95 HTTP local | Errores |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 8 | 8 | 0.0% | 56.71 ms | 0 |
| 10 | 40 | 16 | 80 | 80.0% | 26.09 ms | 0 |
| 50 | 200 | 16 | 400 | 96.0% | 47.23 ms | 0 |

Metodología: 4 oleadas separadas lógicamente (reinicio de caché de revisión entre oleadas), 1 solicitud por usuario y oleada, 2 zonas operativas simuladas. Cada consulta a repositorio equivale a dos agregaciones SQL ficticias. Las mediciones se basan en la ejecución local puntual; no constituyen SLA ni predicción de producción.

Para repetir: `node scripts/experimental-ns/bench-fase8-local.js` (solo escucha en `127.0.0.1`).
