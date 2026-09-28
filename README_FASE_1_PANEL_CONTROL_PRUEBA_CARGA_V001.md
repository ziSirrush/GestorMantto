# FASE 1 - PANEL DE CONTROL / PRUEBA DE CARGA V001

**Fecha:** 28/09/2026  
**Base exacta revisada:** `ziSirrush/GestorMantto` · `main` · `37780b376465b8906823bc46fed571f3210eff4a` (`Version 092826.1`)

> **Integracion con cambios locales posteriores:** esta entrega se preparo desde una version anterior a la Auditoria semanal de cambios, que aun no estaba en un commit. Al aplicar esta fase o las siguientes, no sustituir `modules/panel-control/panel-control.js`, su CSS, `core/module-loader.js` ni `index.html` por los archivos completos de esta entrega. Fusionar Prueba de Carga con la Auditoria local vigente. El codigo exacto de Auditoria a conservar esta en `implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md`; llevarlo junto con cada fase que parta del commit antiguo. La correccion pendiente del bootstrap esta en `implementacion/MODULO_PANEL_CONTROL_PRUEBA_CARGA_V001.md`, seccion «Decisiones vigentes para las fases siguientes».

## Objetivo

Crear la base del nuevo **tab `Prueba de Carga` dentro de Panel de Control**. No se crea un módulo en el panel lateral.

Fase 1 deja preparado:

- tab interno y submódulo frontend desacoplado;
- namespace backend `/api/panel-control/prueba-carga`;
- endpoint de capacidades;
- permisos `ACCESO_VISUAL`, `EJECUTAR` y `DETENER`;
- máximo operativo de VUs configurable;
- diseño sin límite duro fijo de 200 usuarios;
- cero persistencia de resultados de pruebas.

## Regla de capacidad

La meta inicial de validación será **200 usuarios concurrentes**, pero 200 **NO** es el límite final del módulo.

Configuración inicial recomendada:

```text
LOAD_TEST_MIN_VUS=10
LOAD_TEST_VUS_STEP=10
LOAD_TEST_MAX_VUS=200
```

Para una futura prueba de 1,000 VUs bastará elevar `LOAD_TEST_MAX_VUS=1000` si la infraestructura está autorizada para ello. `hard_max_vus` se reporta como `null`.

## Archivos modificados completos

- `core/module-loader.js`
- `modules/panel-control/panel-control.js`
- `backend/src/routes/panel-control.routes.js`
- `backend/.env.example`

## Archivos nuevos

- `modules/panel-control-prueba-carga/panel-control-prueba-carga.js`
- `modules/panel-control-prueba-carga/panel-control-prueba-carga.css`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.routes.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants.js`
- `backend/src/modules/panel-control-prueba-carga/README.md`
- `backend/src/modules/panel-control-prueba-carga/CHANGELOG.md`
- `sql/20260928_FASE_1_PANEL_CONTROL_PRUEBA_CARGA_PERMISOS_V001.sql`
- `sql/20260928_ROLLBACK_FASE_1_PANEL_CONTROL_PRUEBA_CARGA_PERMISOS_V001.sql`

## Base de datos

No se crean tablas, columnas ni índices. El SQL únicamente reutiliza el catálogo vigente de permisos y asignaciones de roles.

El SQL de permisos debe ejecutarse antes de validar visualmente el nuevo tab.

## Validación de Fase 1

1. Aplicar los archivos respetando la estructura de carpetas.
2. Ejecutar el SQL de permisos.
3. Reiniciar backend.
4. Abrir `Panel de Control`.
5. Confirmar el nuevo tab `Prueba de Carga` antes de `Auditoría`.
6. Confirmar que muestra `FASE 1 · BASE INSTALADA`.
7. Confirmar que el máximo operativo inicial es 200 y que el límite duro muestra `NINGUNO`.
8. Confirmar que todavía NO existe un botón funcional que genere carga.

## Estado de validación de esta entrega

- Revisión de `main`: realizada.
- Validación estática JS (`node --check`): realizada sobre los JS entregados.
- Comparación de archivos base contra blobs GitHub: realizada para los archivos existentes modificados.
- Smoke test de configuración: `LOAD_TEST_MAX_VUS=200 -> 1000` sin cambio de código, PASS.
- Verificación de ausencia de DDL estructural (`CREATE/ALTER TABLE`, índices): PASS.
- Verificación del submódulo nuevo sin `localStorage`, `sessionStorage` ni IndexedDB: PASS.
- Prueba local con navegador: NO ejecutada.
- Prueba contra Aiven: NO ejecutada.
- SQL aplicado en Aiven: NO.
- Despliegue Azure: NO.
- GitHub Pages: NO desplegado por esta entrega.
- Netlify: NO modificado.
- GitHub: NO modificado.
- E2E: NO ejecutado.

## Reversión

1. Revertir solo los cambios de Prueba de Carga en los archivos compartidos; no restaurarlos completos a `main` base `37780b3`, porque se eliminaria la Auditoria semanal local.
2. Eliminar los nuevos archivos del submódulo.
3. Ejecutar `sql/20260928_ROLLBACK_FASE_1_PANEL_CONTROL_PRUEBA_CARGA_PERMISOS_V001.sql` si el SQL de permisos fue aplicado.

## Nota de Fase

Esta fase **no ejecuta pruebas de carga**. La sesión temporal, telemetría, runner k6, monitoreo y reporte pertenecen a fases posteriores.
