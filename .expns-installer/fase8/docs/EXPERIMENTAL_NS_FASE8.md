# BLT NOW · Experimental NS · Fase 8 V001 — Optimización y rendimiento

**Preparado:** 26/10/2026, CDMX. **Estado:** archivos de aplicación LOCAL, no desplegados.
**Fuente oficial:** `ziSirrush/GestorMantto`, `main` (`aaa1f1ed30798716d0885dee1692ce56b1583402`), superponiendo entregas locales Experimental NS F1–F7 V001.

## Objetivo

Reducir consultas redundantes y medir el costo de los refrescos de los tres módulos de Experimental NS, sin alterar Core global ni pantallas productivas, sin enviar información a otro proveedor y preservando los borradores locales de F7.

## Implementación (solo módulo experimental)

1. **Agrupación de invalidaciones cliente (250 ms):** múltiples eventos `mantto:experimental-ns-invalidate` en la misma pestaña generan **una sola comprobación** por ruta activa. Durante una comprobación en curso se encola un reintento al terminar. Los módulos inactivos permanecen sin polling.
2. **Sondeo controlado:** intervalo existente de F6, 30 s, con dispersión inicial de hasta 1.75 s para evitar oleadas simultáneas. No es push de NetSuite. La revalidación integral cada 120 s de F6 sigue funcionando.
3. **Backoff ante fallos transitorios:** 30/60/120 s (máx. 120 s), sin borrar caché ni borradores. Reconexión explícita permite reintentar inmediatamente. HTTP 401/403 sigue invalidando las vistas y borradores, sin reintentar contra un permiso revocado.
4. **Coalescencia backend por alcance:** `experimental-ns-live-coalescer.js` agrupa revisiones simultáneas con el **mismo SQL, parámetros de alcance territorial, dominio, agrupación y permiso**; cachea solo la huella SHA-256 durante **1 s** y limita la memoria a 128 claves. El Guard oficial se ejecuta en **cada petición**, antes de la coalescencia. No se comparte la respuesta de datos completos, nunca se accede a tablas productivas.
5. **Diagnóstico local (solo Programador autorizado):** GET por módulo, revisiones, consultas de datos, actualizaciones, elementos visuales cambiados, coalescencias, errores y p50/p95. El uso de memoria es opcional y corresponde al heap de la pestaña completa, **no** al módulo solamente; en navegadores sin esa API se muestra `N/D`. Ningún campo del ticket o contenido de solicitud se registra en métricas, y no existe telemetría persistente ni nueva tabla.
6. **GET de datos de módulos NS instrumentados:** se mide duración de sus consultas sin envolver llamadas de producción ni cambiar sus respuestas. Los scripts de los tres módulos mantienen sus rutas existentes y su actualización DOM focalizada, sin reset de formularios.

## Limitaciones y evidencias

- F8 **no implementa deltas SQL por registro**. Cuando cambia la huella, el backend sigue generando el snapshot autorizado del módulo, y el navegador aplica solo las diferencias visibles. Una mayor reducción de tráfico por filas requiere un contrato delta y validación adicional.
- No hay notificación push instantánea; son comprobaciones cada ~30 s con una revalidación completa cada 120 s.
- El receptor NetSuite todavía requiere habilitar y verificar la persistencia real en Aiven. **No puedo confirmar los tiempos bajo carga real en Azure/Aiven**, porque las pruebas fueron simuladas.
- Las mediciones de navegador son temporales y por pestaña. No incluyen consumo de CPU/IO de Azure ni métricas MySQL de Aiven.
- El detalle de borradores sigue siendo **local** y no equivale a comentario enviado ni bloqueo transaccional en servidor (limitación de F7).
- El 1 s de caché del backend puede mostrar una huella levemente anterior durante esa ventana. Se elimina automáticamente y es independiente por alcance/permisos. El Guard sigue verificando acceso en cada petición.

## Pruebas ejecutadas

- `node --check`: todos los JS nuevos/modificados (correctos).
- `node --test backend/tests/experimental-ns-fase{2..8}.test.js`: **108/108 aprobadas**, mediante mocks de datos y autorización. F1 no se reejecutó sobre la copia aislada porque no contiene un `index.html`/`core/router.js` íntegro; el ZIP no modifica estos archivos.
- Chromium headless: **3/3 vistas** (Resumen, Equipos, Proyectos) con API simulada. Cambio de ticket `Abierto → Cerrado` con borrador, foco, advertencia e historial conservados. Se verificó el diagnóstico visible para Programador.
- `node scripts/experimental-ns/bench-fase8-local.js`: HTTP sobre `127.0.0.1`, 1/10/50 usuarios simulados, 4 oleadas por caso, sin backend/Aiven/NetSuite reales. Resultados anexos en `docs/EXPERIMENTAL_NS_FASE8_RESULTADOS_SIMULADOS.md`.
- No se ejecutaron `UPDATE`, escrituras en repositorio, SQL ni pruebas de carga reales sobre infraestructura compartida.

## Archivos nuevos

- `backend/src/modules/experimental-ns/experimental-ns-live-coalescer.js`
- `modules/experimental-ns/experimental-ns-performance.js`
- `modules/experimental-ns/experimental-ns-performance.css`
- `backend/tests/experimental-ns-fase8.test.js`
- `scripts/experimental-ns/bench-fase8-local.js`
- Documentación / ADR / resultados simulados de F8.

## Archivos completos modificados sobre F7

- `backend/src/modules/experimental-ns/experimental-ns-live.routes.js`
- `backend/tests/experimental-ns-fase3.test.js` (actualización de mock del cargador)
- `modules/experimental-ns/experimental-ns-live.js`
- `modules/experimental-ns/experimental-ns.js`
- `modules/experimental-ns/resumen-dia/resumen-dia-ns.js`
- `modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js`
- `modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js`

**Sin cambios:** `core/data-sync.js`, `core/module-loader.js`, `index.html`, router principal, módulos productivos, autenticación, permisos, tablas de datos, scripts NetSuite o GAS.

## Aplicación y comprobación en local

1. Aplicar y validar F1–F7 V001 en secuencia sobre el repo local.
2. Descargar `EXPERIMENTAL_NS_FASE8_V001.zip` a `Downloads` y seguir `COMANDOS_POWERSHELL.txt`. Valida SHA256, respalda y ofrece rollback automático.
3. Entrar como **Programador** a los tres módulos y abrir «Diagnóstico de rendimiento NS». Revisar consultas al navegar y datos persistentes durante una invalidación.
4. Escribir un borrador de prueba, provocar cambio simulado NS y verificar que no se borre, no se cierre el detalle ni cambie el foco.
5. Ejecutar banco sintético aislado y comparar resultados. **No dirigir 50 usuarios virtuales a Azure/Aiven sin aprobación explícita.**

**GitHub, Azure, Aiven, NetSuite, Netlify y datos productivos permanecen intactos.**
