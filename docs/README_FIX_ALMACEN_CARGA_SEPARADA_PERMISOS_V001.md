# FIX Almacén - Carga de Información separada + permiso independiente V001

Fecha: 2026-08-30
Base: integración Almacén V002 / `main` vigente al momento de generación.

## Objetivo
Separar la carga Excel/CSV de la pantalla **Inventario** y convertirla en un séptimo módulo de Almacén:

- Dashboard
- Inventario
- Stock
- Préstamos
- Resguardos
- Auditoría
- **Carga de Información**

## Seguridad
El nuevo módulo usa el permiso independiente:

`ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

El SQL NO asigna este permiso a ningún rol ni usuario. Por lo tanto, el módulo queda cerrado por defecto. Los accesos deben concederse de forma explícita desde Panel de Control.

La autorización de carga deja de depender de una lista fija de roles Programador/Programador Corellian: el backend exige el permiso `ALMACEN_CARGA...` para GET/POST del nuevo módulo. Esto permite autorizar solamente a las personas necesarias sin abrir Inventario.

## Archivos incluidos

- `index.html` (modificado completo)
- `core/module-loader.js` (modificado completo)
- `core/router.js` (modificado completo)
- `backend/src/modules/almacen/almacen.routes.js` (modificado completo)
- `modules/almacen-carga/almacen-carga.js` (nuevo)
- `modules/almacen-carga/almacen-carga.css` (nuevo)
- `sql/ALMACEN_CARGA_PERMISO_V001.sql`
- `MANIFEST_SHA256.txt`

## Flujo nuevo

`Almacén > Carga de Información` -> validar -> importar y activar -> `almacen_fuente_excel`.

El módulo Inventario conserva `/api/almacen/importaciones/capabilities` únicamente como compatibilidad de lectura de la fuente activa y devuelve `canImport:false`, por lo que deja de mostrar el bloque de importación.

Los endpoints de escritura son ahora:

- `GET /api/almacen/carga/capabilities`
- `POST /api/almacen/carga/validar`
- `POST /api/almacen/carga/importar`

Todos requieren `ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

## Orden recomendado

1. Respaldar los archivos actuales del repo.
2. Sustituir/agregar los archivos incluidos respetando sus rutas.
3. Ejecutar manualmente `sql/ALMACEN_CARGA_PERMISO_V001.sql` en Aiven.
4. En Panel de Control, asignar **Carga de Información** solo a los roles/usuarios autorizados.
5. Reiniciar/redeploy del backend.
6. Publicar frontend y hacer recarga forzada para evitar caché de `router.js`/`module-loader.js`.

## Resultado esperado

Un usuario con Inventario pero sin Carga de Información:
- ve Inventario;
- no ve el botón Carga de Información;
- no puede ejecutar los endpoints `/api/almacen/carga/*` (403).

Un usuario con el permiso Carga de Información:
- ve el séptimo botón;
- puede validar el archivo;
- puede importar y activar un nuevo lote.
