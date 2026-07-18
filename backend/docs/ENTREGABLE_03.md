# Entregable 03 - Extracción del módulo Catálogos

## Objetivo
Separar del controlador monolítico las rutas de consulta:

- GET /api/estados-visuales
- GET /api/permisos
- GET /api/roles
- GET /api/zonas
- GET /api/usuario-zop

## Archivos agregados

- src/modules/catalogos/catalogos.routes.js
- src/modules/catalogos/catalogos.controller.js
- src/modules/catalogos/catalogos.service.js
- src/modules/catalogos/catalogos.repository.js

## Archivo sustituido

- src/routes/data/catalogos.routes.js

Este archivo queda como adaptador de compatibilidad, por lo que no es necesario modificar `src/routes/data.routes.js`.

## Compatibilidad

Se conservan exactamente:

- URLs públicas.
- Métodos HTTP.
- Consultas SQL.
- Ordenamiento.
- Códigos HTTP.
- Estructura y mensajes de las respuestas JSON.

## Decisión de seguridad

En este entregable no se eliminan todavía las funciones equivalentes de
`src/controllers/data.controller.js`. Quedan temporalmente como código sin uso.
Se retirarán después de validar el módulo localmente para facilitar una reversión inmediata.

## Validación

```powershell
npm run check
npm start
```

Probar:

```text
http://localhost:3001/api/estados-visuales
http://localhost:3001/api/permisos
http://localhost:3001/api/roles
http://localhost:3001/api/zonas
http://localhost:3001/api/usuario-zop
```

Después validar el frontend completo en `http://127.0.0.1:5500`.
