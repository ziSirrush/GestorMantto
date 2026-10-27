# ADR · Experimental NS · F8 · Coalescencia y medición de rendimiento

Fecha: 26/10/2026. Estado: propuesta implementada para laboratorio, pendiente de validación en entorno real.

## Contexto

F6 revisa huellas cada 30 s y refresca vistas si cambian; F7 conserva borradores y detecta conflictos visuales. La lectura de revisiones en varios clientes puede repetir SQL costoso y las invalidaciones sucesivas pueden desencadenar comprobaciones innecesarias. El usuario solicitó evaluar 1, 10 y 50 clientes sin modificar el Core global.

## Decisión

- Crear utilitario **exclusivo del frontend Experimental NS** que coalesca eventos de invalidación (250 ms) y mida solicitudes GET, errores, duración de petición y refrescos en memoria.
- Dispersar sondas periódicas para suavizar picos y aplicar backoff acotado si falla la red. Mantener botón/forzado manual y revalidación al recuperar conexión.
- Incorporar **coalescencia de revisiones solo después del Guard** usando como clave una huella del SQL autorizado, parámetros, permiso, agrupación y dominio, por hasta 1 segundo y 128 claves. No compartir filas ni reutilizar datos entre alcances distintos.
- Mostrar la información técnica únicamente con actor `is_programador === true` (no por rol nominal ni llave maestra inferida). No enviar telemetría.
- Simular carga HTTP con loopback y DB ficticia; no ofrecer estas cifras como datos reales de Azure/Aiven.

## Riesgos, mitigaciones y retorno

- Huella desfasada hasta 1 s: TTL intencional corto, sin persistencia.
- Marca `updated_at` / `actualizado_en` no totalmente confiable: permanece revalidación forzada de F6 cada 120 s.
- 50 usuarios de prueba no equivalen a 50 usuarios reales: informar resultados como simulados y mantener E2E pendiente.
- Seguridad: Guard y alcance se comprueban por solicitud, cache por SQL+parámetros+permiso; si no existe contexto de autorización completo, se ejecuta el repositorio sin cachear.
- Rollback: reemplazar únicamente archivos modificados desde respaldo local y eliminar los creados; no se necesitan migraciones.

## Fuera de alcance

`core/data-sync.js`, WebSocket/SSE global, cambios en módulos originales, columnas/índices, persistencia NetSuite, sincronización de comentarios reales y actualizaciones delta por fila.
