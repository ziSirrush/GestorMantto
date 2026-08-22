# FASE 5/11 - OPERACION > EQUIPOS CRITICOS - CUARTOS UNITED V001

## Objetivo
Cerrar el alcance territorial del modulo **Operacion > Equipos Criticos** usando exclusivamente la relacion estructurada:

`usuario_zop -> z_op.id_zona -> portafolio.zona_id`

## Base revisada
- Repositorio: `JIVMBLT/updated_code`
- Branch: `main`
- Commit base: `83c87b4787a41a569940cc8d8108a55a583f26a1`

## Hallazgo
El backend ya reducia el universo por `portafolio.zona_id`, pero varias salidas del modulo seguian mostrando o filtrando la zona con valores textuales historicos (`tickets.zona` / `portafolio.zona_operativa`). Las pruebas de Workbench realizadas con Tester demostraron que esos textos pueden contradecir `portafolio.zona_id`.

## Cambios
1. Se agrega `criticos-cuartos-operacion.service.js` para las lecturas propias de Equipos Criticos.
2. `criticos.controller.js` delega a ese servicio:
   - `GET /api/equipos-criticos`
   - `GET /api/equipos-criticos/:codigo/tickets`
   - `GET /api/proyectos-criticos`
   - `GET /api/proyectos-criticos/:proyecto/tickets`
   - `GET /api/criticidad-corporativa`
3. La autorizacion territorial continua usando el alcance ya resuelto por el Guard y `buildPortafolioScopeSqlInline_gnral`.
4. La zona visible y los filtros de zona salen de `z_op.zona`.
5. Las respuestas agregan `zona_oficial`, `zona_id_oficial` cuando aplica y `alcance.zona_ids/zonas`.
6. Los endpoints de Call Center permanecen en `criticos.service.js`; esta fase no adelanta cambios de la siguiente fase.
7. No hay cambios de BD ni migraciones SQL.

## Primera carga
El frontend actual de Equipos Criticos ya consulta endpoints protegidos por `UNITED + OPERACION`. Esta fase evita crear otra ruta inicial innecesaria: la **primera consulta territorial** (`/api/criticidad-corporativa` y las lecturas del modulo) ya ejecuta el filtro por `portafolio.zona_id` antes de devolver filas.

## Tester 81
Con la configuracion verificada previamente, el alcance esperado es:
- zona_id: `4, 5, 6`
- zonas: `CNA-01, CNA-02, CNA-03`

La consulta incluida `PRUEBA_WORKBENCH_FASE_5_TESTER.sql` permite comparar el resultado esperado directamente en Aiven.

## Archivos modificados/nuevos
- `backend/src/modules/criticos/criticos.controller.js` (modificado)
- `backend/src/modules/criticos/criticos-cuartos-operacion.service.js` (nuevo)
- `backend/scripts/test-fase-5-11-operacion-equipos-criticos.js` (nuevo)
- `PRUEBA_WORKBENCH_FASE_5_TESTER.sql` (nuevo, solo lectura)

## Validaciones locales
- `node --check` sobre JS entregado.
- Test estatico de Fase 5.
- Validacion de ZIP y checksums.

## Limitacion
No se ejecuto contra el Aiven/Azure desplegado desde este entorno. El runtime debe validarse despues del deploy con Tester.
