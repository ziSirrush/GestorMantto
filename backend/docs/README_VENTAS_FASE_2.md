# Mantto Gestor - Ventas Cotizaciones - Fase 2

## Alcance

Agrega los endpoints especializados aprobados:

- `GET /api/ventas/cotizaciones/embudo`
- `GET /api/ventas/cotizaciones/vendidos`
- `GET /api/ventas/cotizaciones/perdidos`
- `GET /api/ventas/cotizaciones/proyeccion`

Todos requieren autenticación y el permiso existente:

- `VENTAS_COTIZACIONES_OPERACION.VER`

No se agregan tablas, migraciones SQL ni dependencias npm.

## Clasificación aprobada

### Embudo activo

- Contacto
- En Cotizacion
- Sin Respuesta
- Seguimiento con Probabilidad
- En Espera de Definicion
- Pre Asignado
- Asignado
- En Contrato

### Vendidos

- Vendido

### Perdidos

- Perdido

### Fuera del embudo y de la proyección

- Siguiente Año
- Borrar

### Proyección

- ALTA: Pre Asignado, Asignado, En Contrato
- MEDIA: Seguimiento con Probabilidad, En Espera de Definicion
- TEMPRANA: Contacto, En Cotizacion, Sin Respuesta

La proyección usa cantidades de cotizaciones y equipos. No calcula montos ni probabilidades monetarias porque la tabla entregada no contiene esos campos.

## Archivos que deben reemplazarse

Copiar conservando la estructura:

- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

## Compatibilidad

El FIX parte del ZIP `bend 1113hrs - 2807.zip` y conserva:

- CRUD de Fase 1.
- listado paginado y búsqueda.
- filtros y ordenamiento.
- KPIs básicos.
- catálogos.
- endpoint histórico `/cotizaciones/sync`.
- middleware de permisos existente.

Durante la validación se detectó que el archivo base exportaba `getCatalogos` sin definir la función correspondiente. El archivo `service.js` entregado restaura esa función utilizando `repository.getCatalogos`, evitando el error de carga `ReferenceError: getCatalogos is not defined`.

## Parámetros admitidos

Los endpoints de embudo, vendidos y perdidos reutilizan:

- `page` o `pagina`
- `pageSize`, `page_size` o `limite`
- `buscar`, `search` o `q`
- `sortBy`
- `sortDirection`
- filtros existentes de Fase 1

`proyeccion` reutiliza búsqueda y filtros, pero devuelve un resumen agregado y no una lista paginada.

## Validaciones ejecutadas

- `node --check` en los cuatro archivos.
- `npm run check`.
- carga real del router mediante `require(...)` con variables de entorno temporales.

No fue posible ejecutar consultas reales contra Aiven desde el entorno aislado porque no se utilizaron credenciales de producción.
