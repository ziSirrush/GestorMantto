# FASE 3 — Comercial · Optimización de llamadas V001

Fecha: 2026-08-28

## Base
Esta fase fue construida sobre el estado efectivo de:
1. `Auditoria Lumbre.zip`
2. `FASE_1_CIERRE_LLAMADAS_POST_LUMBRE_V001`
3. `FASE_2_CALL_CENTER_CARGA_ACOTADA_V001`

Aplicar después de Fase 1 y Fase 2.

## Objetivo
Cerrar el bloque Comercial definido en la auditoría:
- no recalcular KPI al cambiar solamente de página;
- reutilizar catálogos repetidos por usuario/alcance;
- cancelar solicitudes anteriores en filtros/búsquedas de las pantallas comerciales principales.

## Cambios

### 1. KPI separados de la paginación
En:
- `modules/ventas-clientes/ventas-clientes.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-prospeccion/ventas-prospeccion.js`

Se separó el query de filtros del query paginado.

Ahora:
- cambiar filtros/búsqueda => refresca listado + KPI;
- refresco manual/mutación => refresca listado + KPI;
- cambiar solamente de página => consulta únicamente el listado;
- los KPI se conservan mientras no cambie la combinación de filtros.

No se modificó la fórmula ni el significado de ningún KPI.

### 2. Cancelación de solicitudes anteriores
En Clientes, Cotizaciones y Prospección se agregó `AbortController` para listado y KPI.

Al iniciar una nueva búsqueda/filtro:
- se cancela la solicitud anterior del mismo tipo;
- una respuesta vieja no puede sobrescribir la pantalla nueva;
- `AbortError` no se presenta como error funcional al usuario.

Al salir de la ruta se cancelan las solicitudes de listado/KPI que sigan en vuelo.

### 3. Caché compartida de catálogos
Los catálogos comerciales repetidos usan `ManttoHttp.get` con TTL conservador de 5 minutos y clave compartida por endpoint.

`ManttoHttp` ya separa el caché por:
- usuario actor;
- usuario efectivo;
- usuario visualizado.

Además, la Fase 1 limpia el caché ante `mantto:data-mutated`, por lo que una mutación administrativa invalida los catálogos antes del vencimiento del TTL.

Se aplicó a consumidores de catálogos de:
- Clientes;
- Cotizaciones;
- Vendidos;
- Perdidos;
- Proyección;
- Prospección;
- Mapa Prospección;
- formularios/detalles relacionados.

### 4. Cache-busting de scripts
`index.html` actualiza únicamente las versiones de los JS modificados a:
`v=20260828-fase3-comercial-v001`.

## Archivos modificados
- `index.html`
- `modules/ventas-clientes/ventas-clientes.js`
- `modules/ventas-clientes-detalle/ventas-clientes-detalle.js`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
- `modules/ventas-vendidos/ventas-vendidos.js`
- `modules/ventas-perdidos/ventas-perdidos.js`
- `modules/ventas-proyeccion/ventas-proyeccion.js`
- `modules/ventas-prospeccion/ventas-prospeccion.js`
- `modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js`
- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.js`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js`

## No se modificó
- backend;
- SQL/Aiven;
- permisos o Alcance de Información;
- rutas API;
- tablas;
- fórmulas KPI;
- Call Center;
- polling/notificaciones;
- módulos fuera de Comercial.

## Validaciones realizadas
- `node --check` OK en todos los JavaScript modificados.
- Verificación estática de que la paginación de Clientes/Cotizaciones/Prospección llama solo al listado.
- Verificación de claves de caché por endpoint y TTL de 5 minutos.
- Comparación contra la base Fase 1 + Fase 2: solo aparecen los archivos listados arriba.

## Validación runtime recomendada antes de producción
En Network:
1. abrir Clientes, Cotizaciones y Prospección;
2. cambiar de página y confirmar que no se repita el endpoint `/kpis`;
3. cambiar un filtro y confirmar que sí se consulten listado + `/kpis`;
4. escribir rápidamente distintos términos de búsqueda y confirmar que las respuestas antiguas no sustituyan a la última;
5. navegar entre módulos comerciales y confirmar que los catálogos repetidos se reutilizan mientras no exista una mutación que los invalide.
