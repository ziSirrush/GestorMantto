# Entregable 04 corregido — Módulo Proyectos

## Cómo copiar

El ZIP conserva la ruta raíz `backend/`. Copia la carpeta `backend` sobre la copia de trabajo del proyecto y permite reemplazar únicamente los archivos coincidentes.

## Estructura incluida

```text
backend/
├── docs/
│   └── ENTREGABLE_04_CORREGIDO.md
└── src/
    ├── modules/
    │   └── proyectos/
    │       ├── proyectos.controller.js
    │       ├── proyectos.repository.js
    │       ├── proyectos.routes.js
    │       └── proyectos.service.js
    └── routes/
        └── data/
            ├── portafolio.routes.js
            └── proyectos.routes.js
```

## Corrección aplicada

La ruta:

```text
GET /api/portafolio/proyectos/detalle/:proyecto
```

ahora utiliza `src/modules/proyectos/proyectos.controller.js` y ya no depende de `data.controller.js` para ese detalle.

Las rutas principales de Proyectos continúan registradas mediante el adaptador temporal:

```text
src/routes/data/proyectos.routes.js
```

## Archivos que no deben borrarse todavía

Conserva:

```text
src/routes/data.routes.js
src/controllers/data.controller.js
```

Los demás módulos siguen dependiendo de ellos durante la migración.

## Validación recomendada

```powershell
npm run check
npm start
```

Después prueba:

```text
/api/proyectos
/api/proyectos/filtros
/api/proyectos/detalle?proyecto=PROYECTO_REAL
/api/portafolio/proyectos/detalle/PROYECTO_REAL
```
