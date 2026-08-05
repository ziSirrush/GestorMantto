# FIX Dashboard Ventas e interacciones V001

## Base revisada

- Archivo recibido: `Revision de interacciones.zip`.
- No se crean tablas ni se modifica SQL.
- El Dashboard continúa consultando las tablas operativas existentes.

## Dashboard Ventas

Las tablas ahora usan las mismas columnas visibles que sus módulos fuente:

- Clientes.
- Cotizaciones.
- Vendidos.
- Perdidos.
- Prospección.
- Asignación a Redes.
- Proyectos activos de Instalaciones.
- Logística no entregada.

Las filas comerciales que tienen una vista de detalle confirmada conservan navegación al detalle correspondiente.

## Proyección

- Se retira el resumen superior de cuatro KPI.
- Se conservan los cinco KPI por etapa.
- En escritorio se muestran cinco KPI en una fila; se reacomodan en tablet y móvil.
- Las tablas por etapa quedan con: Proyecto, Asesor, Cliente, Equipos y Acciones.
- Se conservan Ver e Historial.

## Auditoría de interacciones

Se revisaron los contratos frontend/backend de:

- Clientes: crear, editar y administrar contactos.
- Cotizaciones: crear, editar, cambiar estatus, comentar y adjuntar archivos.
- Prospección: crear visita, cambiar estatus, comentar, adjuntar y abrir/eliminar archivos.
- Asignación a Redes: crear, editar, cambiar estatus, relacionar cotización, comentar y adjuntar evidencias.
- Vendidos, Perdidos y Proyección: usan el detalle de Cotizaciones y heredan sus interacciones.

### Error corregido en comentarios de Prospección

El guard de esquema de Azure se ejecutaba antes de que Multer leyera los archivos y también bloqueaba comentarios de solo texto. Además, el servicio exigía empresa interna aun cuando el comentario no adjuntaba archivos.

Ahora:

1. Multer procesa primero la solicitud.
2. El esquema de almacenamiento se valida solo cuando realmente llegaron archivos.
3. La empresa interna se exige únicamente para una carga física a Azure.
4. Un comentario de solo texto no depende del esquema de archivos.

La misma protección condicional se aplicó a comentarios/archivos opcionales de Cotizaciones y Asignación a Redes.

## Validaciones ejecutadas

- `node --check` en todos los JavaScript modificados.
- `npm run check`: estructura base validada correctamente.
- Verificación estática de rutas frontend/backend para comentarios, estatus, creación y edición.

No se realizó una prueba transaccional contra Aiven ni una carga real a Azure desde este entorno; esas pruebas deben confirmarse después de desplegar el FIX.
