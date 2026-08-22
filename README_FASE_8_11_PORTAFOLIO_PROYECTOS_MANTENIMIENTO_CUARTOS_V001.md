# FASE 8/11 - Portafolio > Proyectos de Mantenimiento - Cuartos UNITED

## Base revisada
- Repositorio: JIVMBLT/updated_code
- Rama: main
- Commit: 83c87b4787a41a569940cc8d8108a55a583f26a1
- No se modifica la base de datos.

## Problema confirmado en el codigo actual
El modulo Proyectos realizaba antes de su carga principal una consulta generica a `/api/tickets?limit=20000`, cargaba filtros por `/api/proyectos/filtros` y despues consultaba `/api/proyectos`.

Ademas, el backend de Proyectos ya aplicaba alcance por `portafolio.zona_id`, pero seguia usando `portafolio.zona_operativa` para:
- filtro de Zona;
- busqueda por Zona;
- zona mostrada en el listado;
- catalogo de zonas.

Las pruebas previas con Tester 81 demostraron que `portafolio.zona_operativa` puede diferir de `portafolio.zona_id -> z_op.zona`.

## Cambios de Fase 8
1. Nueva primera llamada del modulo:
   - `GET /api/proyectos/inicial`
2. Guard exclusivo para esa primera llamada:
   - dominio: `UNITED`
   - agrupacion: `PORTAFOLIO`
   - permiso: `PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
3. La respuesta inicial entrega en una sola llamada:
   - `alcance.zona_ids`
   - `alcance.zonas`
   - filtros autorizados
   - resumen/KPI
   - listado de proyectos
4. El frontend deja de usar en la carga inicial:
   - `/api/tickets?limit=20000`
   - `/api/proyectos/filtros`
   - `/api/proyectos`
5. Autoridad territorial del listado y filtros:
   - `usuario_zop -> portafolio.zona_id -> z_op.zona`
6. `portafolio.zona_operativa` queda fuera de autorizacion, filtros y zona oficial mostrada.
7. El detalle compartido de Proyecto se conserva, pero su salida de zona se canoniza con `z_op` dentro del alcance ya autorizado.
8. Las rutas compartidas de detalle se mantienen para no romper navegacion contextual desde Operacion/Experimental.
9. La criticidad visual queda como carga secundaria opcional posterior a la primera carga propia de Proyectos; nunca bloquea el modulo ni define su universo.

## Archivos modificados
- `modules/proyectos/proyectos.js`
- `backend/src/modules/proyectos/proyectos-cuartos_uni.service.js`
- `backend/src/modules/proyectos/proyectos.controller.js`
- `backend/src/modules/proyectos/proyectos.routes.js`

## Archivo de prueba
- `PRUEBA_WORKBENCH_FASE_8_TESTER.sql`

## Validaciones locales
- `node --check` en los cuatro archivos JS.
- Verificacion de ausencia de `/api/tickets` en la carga del frontend.
- Verificacion de endpoint `/api/proyectos/inicial`.
- Verificacion de Guard dedicado `PORTAFOLIO`.
- Verificacion de consultas territoriales por `z_op.zona`.

## Runtime
No se ha ejecutado contra Aiven/Azure desde este entorno. La validacion final debe realizarse desplegando la fase y entrando como Tester 81.
