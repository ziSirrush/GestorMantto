# BLT NOW | CX Visitas | Matriz de salida F4 V001

| Control | Evidencia local | Validacion real pendiente | Criterio GO |
|---|---|---|---|
| Base de integracion `c8923226` | GitHub main consultado, blobs F2 y F3 conocidos | `git rev-parse HEAD` y `--check` en clon destino | Installer sin conflictos |
| F1 tablas Aiven | Contrato SQL + tests Node F1 | 02_SMOKE_FASE_1 y 03_PRECHECK_RELEASE en `mydb` | Tablas InnoDB, columnas requeridas y FK validas |
| Catalogo permisos | Contratos F1 + F2 iguales | Consulta SQL Aiven y Panel Control | 6 permisos activos; 5 de gestion + visual, asignacion aprobada |
| Backend F2 | 12/12 Node mocks | Azure con `CX_VISITAS_API_ENABLED=true` tras precheck | 6 rutas accesibles solo por JWT/autorizacion |
| Frontend F3 | 20/20 Node + CSS version F3 | Publicaciones Netlify/GH | Ruta `cx-visitas` reemplaza placeholder sin tocar otras |
| F4 historial post-baja | 15/15 Node (servicio F2 + frontend F4 real con BD mock) | Prueba en staging con visita de QA | Historial disponible por ID tras baja logica |
| Seguridad/alcance | Pruebas mocks de scope, Visor, validacion | Roles reales permitidos/no permitidos, Visor | Sin fugas 200 indebidas; 403/404 correctamente |
| Auditoria | Atomica en F2 mock y F4 cross-phase | Comprobar registros de historial en Aiven | CREAR/EDITAR/DESACTIVAR con actor real, mismo commit |
| PWA Netlify/GH | Versiones frontend F4 especificas, no cambia manifests | Cache real y segundo dispositivo | BLT NOW / BLT NOW GH; JS F4 realmente servido |
| Responsive | Chromium desktop 1380, tablet 768, movil 390 con API simulada | Dispositivos de usuarios reales | Sin overflow y con historial/modal accesibles |
| Canary | Codigo F4 con doble confirmacion, no ejecutado | Solo STAGING, bajo aprobacion | Crear + editar + historial + baja, sin filas activas QA |
| Falla controlada y rollback | Instalador --rollback contenido validado | Reversion sobre clon/publicacion de staging | Restaurar F3 sin datos perdidos ni afectar Encuestas |

## Estados permitidos

- **DEV_OK**: 55 tests Node locales pasan. No equivale a validacion externa.
- **PRE_DEPLOY_READY**: instalador + gate staticos pasan en el clon real, sin modificaciones ajenas y con F1 aplicada.
- **STAGING_OK**: SQL y smoke externos pasan, permisos validados y, de ser autorizada, canary ejecutada.
- **PRODUCTION_READY**: publicacion probada en ambos hosts y Azure, permisos/alcances correctos, rollback practicado y aprobacion operativa registrada.

**Estado de esta entrega (15-oct-2026): DEV_OK parcial: tests/visual OK; no existe confirmacion de Aiven/Azure/staging/produccion.** No confundir la generacion del ZIP con deploy real.
