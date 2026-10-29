# Bitácora colaborativa — BLT NOW

Registro local de microentregas de seguridad. Este archivo documenta únicamente el trabajo comprobado en el árbol local; no implica commit, push, ejecución de CI ni despliegue.

## Entrega local — 2026-10-29 12:16:20 -06:00

- **Rama:** `main`
- **Base auditada:** `cce8b8afc1443d9fe2d8c8b9e83624409c0b4f08`
- **Implementación:** Lumbre
- **Revisión humana:** pendiente
- **Estado:** implementación y QA local completados; pendiente de autorización para cualquier commit, push o despliegue

| Microentrega | Alcance ejecutado | Evidencia local | Estado |
|---|---|---|---|
| L-01 | Neutralización de XSS en detalles de tickets y equipos. | `tests/lumbre-seg-001-ticket-details-xss.test.js` | QA local aprobado |
| L-02 | Eliminación de la exposición pública heredada de `/uploads` y actualización de diagnósticos/validadores. | `tests/lumbre-seg-002-legacy-uploads-public.test.js` | QA local aprobado |
| L-03 | Actualización y fijación del baseline de dependencias vulnerables del backend. | `tests/lumbre-seg-003-dependency-baseline.test.js`; `npm audit` sin vulnerabilidades | QA local aprobado |
| L-04 | Endurecimiento de workflows: acciones fijadas por SHA, permisos mínimos, auditoría, pruebas y artefacto de despliegue separado. | `tests/lumbre-seg-004-ci-supply-chain.test.js` | Validación estática aprobada; ejecución remota pendiente |
| L-06 | Retiro de JWT y contexto de sesión de `localStorage`; aislamiento por pestaña y transferencia segura al visor. | `tests/lumbre-seg-006-jwt-storage.test.js` y pruebas de política de sesión | QA local aprobado |
| L-07 | CSP y cabeceras defensivas locales, eliminación de handlers inline y SRI para dependencias CDN. | `tests/lumbre-seg-007-csp-sri.test.js` y pruebas PWA | QA local aprobado; despliegue pendiente |
| L-08 | Caducidad, purga e aislamiento por identidad de snapshots, borradores y permisos offline. | `tests/offline-f2-storage.test.js` | QA local aprobado |

L-05 y L-09 no fueron ejecutadas por Lumbre porque fueron reasignadas por la dirección del proyecto.

### Validaciones ejecutadas

- `npm.cmd test --prefix backend`: aprobado; suites unitarias, validaciones, contratos y validadores de almacenamiento completadas.
- `npm.cmd run check --prefix backend`: aprobado.
- `npm.cmd audit --prefix backend --audit-level=moderate --json`: 0 vulnerabilidades informativas, bajas, moderadas, altas o críticas; 238 dependencias auditadas.
- `git diff --check`: aprobado, sin errores de espacios en blanco.

### Riesgos residuales y compatibilidad

- La CSP conserva `style-src 'unsafe-inline'` por compatibilidad con estilos inline existentes; los scripts no permiten `unsafe-inline`.
- Los workflows se validaron localmente de forma estática, pero todavía no se han ejecutado en GitHub Actions.
- Las cabeceras de `netlify.toml` no se han comprobado en un despliegue real.
- La retirada de `/uploads` presupone que los datos externos heredados ya no dependen de esa ruta pública; cualquier referencia residual deberá migrarse al almacenamiento privado.
- Los snapshots offline caducan a los siete días y los borradores a una hora, por lo que el cliente puede requerir una nueva descarga después de esos límites.

[Lumbre | 2026-10-29 | LUMBRE-MG | REGISTRO_BITACORA_SEGURIDAD_LOCAL_V001]
