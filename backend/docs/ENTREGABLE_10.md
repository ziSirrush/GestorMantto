# Entregable 10 - Modulo Portafolio

## Objetivo

Migrar el registro de rutas de Portafolio a la arquitectura modular:

```text
routes -> controller -> service -> repository
```

sin modificar las URLs, los metodos HTTP, los parametros ni los contratos JSON utilizados por el frontend.

## Archivos incluidos

```text
backend/
├── docs/
│   └── ENTREGABLE_10.md
└── src/
    ├── modules/
    │   └── portafolio/
    │       ├── portafolio.controller.js
    │       ├── portafolio.repository.js
    │       ├── portafolio.routes.js
    │       └── portafolio.service.js
    └── routes/
        └── data/
            └── portafolio.routes.js
```

## Rutas conservadas

```text
GET  /api/portafolio/filtros
GET  /api/portafolio/dashboard
GET  /api/portafolio/movimientos
GET  /api/portafolio/movimientos-semanales/catalogo
GET  /api/portafolio/movimientos-semanales
GET  /api/portafolio/movimientos/:codigo/detalle
POST /api/portafolio/equipos/tickets-lote
GET  /api/portafolio/equipos/:codigo
GET  /api/portafolio/equipos
GET  /api/portafolio/proyectos/detalle/:proyecto
GET  /api/portafolio
POST /api/portafolio/sync
GET  /api/equipos
```

## Estrategia transicional

Para reducir el riesgo en uno de los dominios mas extensos del backend, el nuevo modulo conserva temporalmente como fuente de verdad los handlers ya validados de `controllers/data.controller.js`.

El detalle de proyecto reutiliza `modules/proyectos/proyectos.controller.js`, que ya fue migrado y validado en el Entregable 04.

Esta etapa modulariza el registro y el flujo de ejecucion sin duplicar todavia las consultas SQL ni las reglas de negocio. La dependencia legacy se retirara en el entregable final de limpieza, despues de validar Portafolio completo y Tickets.

## Validacion recomendada

1. Iniciar el backend.
2. Comprobar `/api/health`.
3. Abrir Dashboard Portafolio y validar filtros y KPIs.
4. Validar la tabla de equipos y el detalle de equipo.
5. Validar detalle de proyecto desde Portafolio.
6. Validar Movimientos Portafolio y movimientos semanales.
7. Validar consulta de tickets por lote.
8. Confirmar que `/api/equipos` mantiene su respuesta actual.
9. No ejecutar `/api/portafolio/sync` en produccion sin un respaldo y una prueba controlada.

## No eliminar todavia

No deben retirarse de `src/controllers/data.controller.js` los handlers de Portafolio ni `getEquipos`. Se conservaran hasta el entregable de limpieza y retiro de codigo legacy.
