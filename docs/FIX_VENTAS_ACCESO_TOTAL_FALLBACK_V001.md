# FIX Ventas - Acceso total temporal con detección de matriz granular

## Causa

El middleware de Cotizaciones exigía permisos granulares aunque la matriz de
Ventas todavía no estuviera cargada. Los registros actuales de
`ACCESO_VISUAL` eran interpretados como si ya existiera una matriz funcional,
por lo que las rutas compartidas devolvían HTTP 403.

## Regla aplicada

1. Se revisan únicamente las asignaciones efectivas del usuario y sus roles en
   la agrupación `VENTAS`.
2. La acción `ACCESO_VISUAL` no cuenta como permiso granular cargado.
3. Si no hay permisos granulares:
   - se conserva el acceso total temporal para usuarios con acceso visual de
     Ventas;
   - también se conserva el acceso total histórico de perfiles directivos o de
     prueba resueltos por `ventas-visibility.service.js`.
4. Cuando existe al menos una asignación granular permitida o denegada para el
   usuario o sus roles, se desactiva el fallback y se evalúa la matriz real.
5. Una denegación personalizada continúa prevaleciendo cuando el modo granular
   ya está activo.

## Archivo modificado

- `backend/src/middleware/ventas-cotizaciones-permissions.middleware.js`

## Validaciones

- Sintaxis validada con `node --check`.
- No se modificaron rutas, controladores, tablas ni frontend.
- `ACCESO_VISUAL` queda separado de los permisos operativos.
- Las denegaciones también cuentan como matriz cargada para impedir que el
  fallback reactive acceso total.
