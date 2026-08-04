# Entregable 04 — Módulo Proyectos

## Objetivo

Extraer las rutas y la lógica de Proyectos desde `data.controller.js` hacia un módulo independiente, conservando los contratos HTTP y las consultas actuales.

## Archivos incluidos

```text
src/modules/proyectos/
├── proyectos.routes.js
├── proyectos.controller.js
├── proyectos.service.js
└── proyectos.repository.js

src/routes/data/proyectos.routes.js
```

## Rutas conservadas

```text
GET /api/proyectos/filtros
GET /api/proyectos/detalle
GET /api/proyectos/detalle/:proyecto
GET /api/proyectos/:proyecto
GET /api/proyectos
```

## Aplicación

Copiar el contenido del ZIP sobre la carpeta `backend`, permitiendo reemplazar `src/routes/data/proyectos.routes.js`.

No eliminar todavía `data.controller.js`. Después de validar este entregable, únicamente pueden retirarse de ese controlador las funciones y auxiliares exclusivos de Proyectos.

## Validación mínima

```powershell
npm run check
npm start
```

Después validar el frontend y, como mínimo:

```text
/api/proyectos
/api/proyectos/filtros
/api/proyectos/detalle?proyecto=<PROYECTO_REAL>
```

## Nota técnica

Para reducir el riesgo durante la migración, el servicio conserva temporalmente los handlers y contratos HTTP originales. El repositorio centraliza el acceso al pool de MySQL. La separación más fina de consultas y respuestas HTTP puede hacerse después de comprobar equivalencia funcional.
