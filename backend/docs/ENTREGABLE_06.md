# Entregable 06 — Equipos Críticos

## Objetivo

Mover las rutas y la lógica actual de criticidad desde `src/controllers/criticos.controller.js` hacia el módulo independiente:

```text
route → controller → service → repository
```

La migración conserva las URLs, middleware, parámetros, consultas y respuestas actuales.

## Archivos incluidos

```text
backend/
├── docs/
│   └── ENTREGABLE_06.md
└── src/
    ├── modules/
    │   └── criticos/
    │       ├── criticos.controller.js
    │       ├── criticos.repository.js
    │       ├── criticos.routes.js
    │       └── criticos.service.js
    └── routes/
        └── data/
            └── criticos.routes.js
```

## Rutas conservadas

```text
GET /api/indicadores/mtbc/equipos
GET /api/indicadores/mtbc/proyectos
GET /api/callcenter/u365/proyectos
GET /api/callcenter/u365/equipos
GET /api/criticidad-corporativa
GET /api/equipos-criticos
GET /api/equipos-criticos/:codigo/tickets
GET /api/proyectos-criticos
GET /api/proyectos-criticos/:proyecto/tickets
```

## Integración

Copiar la carpeta `backend/` de este entregable sobre la carpeta raíz del proyecto y reemplazar únicamente los archivos coincidentes.

El adaptador `src/routes/data/criticos.routes.js` dejará de apuntar al controlador heredado y cargará el módulo nuevo.

No eliminar todavía `src/controllers/criticos.controller.js`. Debe conservarse como respaldo hasta validar el backend y el frontend.

## Nota arquitectónica

Este entregable es una extracción transicional segura. La lógica validada permanece intacta dentro del Service, mientras que el acceso a MySQL se canaliza mediante el Repository. En una fase posterior se podrán separar las consultas en métodos específicos sin cambiar contratos ni comportamiento.

## Validación recomendada

```powershell
npm run check
npm start
```

Después revisar:

- Equipos Críticos.
- Proyectos Críticos.
- Detalles y tablas de tickets.
- Indicadores MTBC.
- Vistas U365 del Call Center.
