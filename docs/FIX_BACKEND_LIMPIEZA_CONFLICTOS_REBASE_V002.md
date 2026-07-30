# FIX Backend - Limpieza de conflictos de rebase V002

Este FIX reemplaza con versiones limpias los archivos backend que participaron en el rebase conflictivo:

- `backend/src/routes/index.js`
- `backend/src/modules/ventas-cotizaciones/*`
- `backend/src/modules/ventas-clientes/*`

Objetivo: eliminar cualquier marcador residual de Git (`<<<<<<<`, `=======`, `>>>>>>>`) y recuperar un arranque válido de Node.

## Validación antes del push

Desde la raíz del proyecto:

```powershell
git grep -n -E "<<<<<<<|>>>>>>>"
node --check backend/src/routes/index.js
node --check backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js
cd backend
npm run check
cd ..
```

`git grep` no debe devolver resultados y `npm run check` debe terminar correctamente.
