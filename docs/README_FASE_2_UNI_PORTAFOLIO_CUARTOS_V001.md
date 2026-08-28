# FASE 2 - UNITED · PORTAFOLIO POR CUARTOS V001

Fecha: 2026-08-20

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `f4e7b56b25d4c34e67ccd17aaceacbe8f0e5687b`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 1`
- Prerrequisito: `FASE_1_UNI_PUERTAS_CUARTOS_V001`

## Regla funcional aplicada

Para informacion UNITED:

1. el permiso funcional determina que accion puede ejecutar el usuario;
2. Panel de Control > Alcance determina que puerta/agrupacion puede abrir;
3. Panel de Control > Usuarios > Zonas Op determina sus cuartos;
4. `usuario_zop` es la autoridad de esos cuartos;
5. `z_op` permanece como catalogo referencial;
6. una consulta Portafolio solo puede devolver filas cuyo `portafolio.zona_id` pertenezca a los cuartos del usuario.

La llave maestra UNITED abre puertas, pero NO elimina el filtro territorial de `usuario_zop`.

## Problema confirmado en la base revisada

El Guard General ya construia `req.informationAccess` con `zona_ids`, pero varias consultas reales de Portafolio no consumian ese contexto:

- `portafolio-comercial_uni.js` construia KPIs, distribuciones y equipos solo con filtros funcionales/manuales;
- filtros y movimientos seguian delegados al controlador legacy;
- `/portafolio` y `/equipos` devolvian la tabla sin filtro territorial;
- el detalle de proyecto validaba que existiera al menos una fila autorizada, pero despues podia reconstruir el proyecto completo;
- los cortes semanales globales se autorizaban por llave maestra, criterio que dejo de ser suficiente despues de la Fase 1.

## Cambios

### 1. Dashboard y tabla de equipos

`backend/src/modules/portafolio/portafolio-comercial_uni.js`

`portafolioFilters_uni()` agrega obligatoriamente el SQL generado por:

`buildPortafolioScopeSql_gnral(req, 'p')`

Por lo tanto, KPIs, conteos de proyectos, distribuciones y tabla de equipos nacen con:

`p.zona_id IN (...)`

segun los cuartos resueltos desde `usuario_zop`.

### 2. Consultas humanas de Portafolio

Se crea:

`backend/src/modules/portafolio/portafolio-consultas_uni.js`

Contiene handlers territoriales para:

- catalogos/filtros de Portafolio;
- movimientos mensuales;
- detalle de movimiento;
- detalle UNITED de equipo;
- detalle de proyecto Portafolio;
- listado base `/portafolio`;
- alias `/equipos`.

Los filtros de Zona, Supervisor y Tipo tambien quedan limitados a los cuartos autorizados; no se exponen opciones provenientes exclusivamente de otras zonas.

### 3. Detalle de equipo

La rama UNITED ya no depende del `SELECT` legacy sin zona. La consulta del equipo incorpora `portafolio.zona_id IN (...)`.

Esto es importante incluso si un codigo de equipo llegara a repetirse: el backend debe resolver la fila dentro de un cuarto autorizado antes de construir el detalle.

La llave compuesta `proyecto|||referencia_sitio` conserva su flujo CORELLIAN existente; no se cambia la separacion de empresas en esta fase.

### 4. Detalle de proyecto

El detalle de proyecto se reconstruye directamente desde equipos de Portafolio ya filtrados por `zona_id`.

Los equipos visibles determinan:

- cabecera del proyecto;
- conteos de equipos;
- distribucion territorial mostrada;
- llamadas y metricas que pueden vincularse a esos equipos;
- graficas y distribuciones de Tickets asociadas a equipos visibles.

Los Tickets sin un equipo visible que permita asignarlos de forma segura al proyecto no se incorporan implicitamente. Es un comportamiento fail-closed hasta la Fase 3 de Tickets.

### 5. Cortes semanales globales

Los snapshots de `portafolio_cortes_semanales` representan todo UNITED y no pueden recortarse parcialmente sin falsear sus totales historicos.

Se agrega `requireAllUnitedZones_gnral`.

Ahora el corte global requiere:

- permiso funcional;
- puerta Portafolio;
- tener asignados TODOS los cuartos activos de `z_op` en `usuario_zop`.

La llave maestra por si sola ya no habilita el snapshot global.

### 6. Repository

`portafolio.repository.js` enruta las consultas territoriales hacia handlers `_uni`.

Se mantienen legacy deliberadamente:

- cortes semanales, protegidos antes por `requireAllUnitedZones_gnral`;
- Tickets por lote, cuyo listado de equipos ya es filtrado por `filterPortafolioEquipmentBodyScope_gnral`;
- `syncPortafolio`, porque es M2M y permanece fuera del alcance humano.

## Archivos modificados/nuevos

- `backend/src/services/information-record-scope-gnral.service.js`
- `backend/src/modules/portafolio/portafolio.routes.js`
- `backend/src/modules/portafolio/portafolio.repository.js`
- `backend/src/modules/portafolio/portafolio-comercial_uni.js`
- `backend/src/modules/portafolio/portafolio-consultas_uni.js` (nuevo)
- `backend/scripts/test-fase-2-portafolio-cuartos-uni.js` (nuevo)
- `ADR_FASE_2_UNI_PORTAFOLIO_CUARTOS_V001.md` (nuevo)

## No modificado

- estructura SQL;
- `usuario_zop`;
- `z_op`;
- Panel de Control frontend;
- permisos funcionales;
- `alcance_cor`;
- `alcance_gnral`;
- Sync/M2M de Portafolio;
- motor definitivo de alcance de Tickets.

## Limite deliberado de esta fase

Portafolio sigue consumiendo algunos atributos derivados de Tickets, por ejemplo ultimo Ticket/estado operativo. La autorizacion territorial propia de `tickets.zona` y la homologacion de todos los endpoints de Tickets pertenecen a la Fase 3.

Esta Fase 2 no asume que `tickets.zona` ya este 100% homologado contra `z_op.zona`.

## Validaciones realizadas

- `node --check` sobre todos los JS entregados: OK.
- prueba aislada `test-fase-2-portafolio-cuartos-uni.js`: OK.
- llave maestra UNITED + cuartos `[1,2]` sigue generando `p.zona_id IN (?, ?)`.
- catalogos de Portafolio: cada consulta incluye filtro por cuartos.
- Dashboard: KPIs/distribuciones incluyen filtro por cuartos.
- detalle UNITED de equipo: consulta principal incluye filtro por cuartos.
- detalle de proyecto: cabecera y equipos incluyen filtro por cuartos.
- snapshots globales: un usuario con subconjunto de cuartos recibe `403 INFORMATION_ALL_ROOMS_REQUIRED`; con todos los cuartos activos pasa el guard.
- Repository conserva `syncPortafolio` en el flujo M2M legacy.

## Validacion runtime requerida

No puedo confirmar esto contra la instancia Aiven real desde este entorno.

Despues de aplicar Fase 1 + Fase 2:

1. asignar a un usuario solamente `CNA-01`, `CNA-02` y `CNA-03` desde Usuarios > Zonas Op;
2. abrir las puertas Operacion y Portafolio;
3. iniciar sesion como ese usuario;
4. verificar Dashboard Portafolio, tabla de equipos, filtros, movimientos y detalles;
5. confirmar que no aparezcan filas/opciones Portafolio de `OCC-*`, `NOR-*`, `CNB-*` u otras zonas no asignadas;
6. comprobar que la llave maestra UNITED no amplie las zonas;
7. confirmar que cortes semanales globales den 403 mientras el usuario no tenga todos los cuartos.

La Fase 3 debe continuar con Tickets y el resto de modulos UNITED.
