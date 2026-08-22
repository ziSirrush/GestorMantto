# FASE 7/11 — PORTAFOLIO > Dashboard Portafolio > Cuartos UNITED

Base revisada: `JIVMBLT/updated_code` / `main` / `83c87b4787a41a569940cc8d8108a55a583f26a1`.

## Objetivo

Cerrar el alcance territorial del módulo **Dashboard Portafolio** desde su primera carga y mantener la misma puerta PORTAFOLIO en paginación, filtros y ordenamiento posteriores.

Flujo de autoridad territorial:

`sesión -> permiso funcional -> puerta PORTAFOLIO -> usuario_zop -> portafolio.zona_id -> z_op.zona`.

`portafolio.zona_operativa` queda como dato legacy y no decide autorización, filtro, ordenamiento ni zona mostrada.

## Archivos modificados

- `backend/src/modules/portafolio/portafolio.routes.js`
- `backend/src/modules/portafolio/portafolio.controller.js`
- `backend/src/modules/portafolio/portafolio.repository.js`
- `backend/src/modules/portafolio/portafolio-comercial_uni.js`
- `modules/portafolio/portafolio.js`

## Cambios

1. Primera llamada propia del módulo: `GET /api/portafolio/dashboard/inicial`.
2. Paginación/filtros posteriores: `GET /api/portafolio/dashboard/equipos`.
3. Ambos endpoints usan Guard dedicado `UNITED + PORTAFOLIO` con el permiso real de lectura de la tabla Dashboard Portafolio.
4. Se conserva la cadena `route -> controller -> service -> repository -> handler _uni`.
5. La respuesta inicial entrega en una sola llamada:
   - alcance territorial;
   - filtros permitidos;
   - KPI/distribuciones;
   - primera página de equipos.
6. Zona oficial de Dashboard, filtros, distribución y ordenamiento: `z_op.zona` por `portafolio.zona_id`.
7. Se elimina de la primera carga el fetch genérico/global de `/api/tickets?limit=20000`.
8. La criticidad, al ser información cruzada de OPERACION, se consulta después de completar la carga propia de Portafolio y conserva su permiso independiente.
9. No se modifica BD ni estructura SQL.
10. No se modifican Proyectos de Mantenimiento ni Movimientos Portafolio; corresponden a fases posteriores.

## Prueba esperada con Tester

Con el usuario de prueba configurado en `PRUEBA_WORKBENCH_FASE_7_TESTER.sql`, los registros solo pueden salir de los `zona_id` asignados en `usuario_zop` y la zona visible debe coincidir con `z_op.zona`.

## Validaciones locales

- `node --check` sobre los JavaScript modificados.
- Ruta inicial y ruta de paginación con `groupingCode: 'PORTAFOLIO'`.
- Frontend sin fallback inicial a `/api/tickets?limit=20000` ni paginación por `/api/portafolio/equipos`.
- `z_op.zona` como zona oficial en Dashboard Portafolio.
- Integridad del ZIP y checksums.

## Pendiente de runtime

No puedo confirmar el comportamiento real contra Aiven/Azure/GitHub Pages hasta desplegar y probar con una sesión autenticada.
