# FIX Ventas Clientes - Fase 2 Frontend V002

Base acumulativa:
1. `Local Ver 1400 hrs.zip`
2. `FIX_VENTAS_CLIENTES_FASE1_FRONTEND_V001.zip`

## Incluye

- Vista independiente `Ventas > Clientes > Nuevo cliente`.
- Formulario dividido en Empresa, Contacto principal y Gestión comercial.
- Catálogo de Estados desde `catalogo_general`.
- Tipo de cliente y Estatus con cliente desde `catalogo_general`, con respaldo en los catálogos actuales de Clientes.
- Asesor/iniciales desde el alcance visible devuelto por `/api/ventas/clientes/catalogos`.
- Alta real mediante `POST /api/ventas/clientes`.
- Creación del contacto principal mediante `POST /api/ventas/clientes/:id/contactos`.
- Regreso al listado y recarga después de crear.
- Flujo desde Nueva Cotización: regresa y selecciona automáticamente el cliente recién creado.
- No modifica backend ni base de datos.

## Archivos modificados

- `index.html`
- `core/router.js`
- `modules/ventas-clientes/ventas-clientes.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`

## Archivos nuevos

- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.html`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.css`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.js`

## Validaciones

- Nombre de empresa obligatorio.
- Nombre de contacto obligatorio.
- Asesor/iniciales obligatorio.
- Longitudes alineadas con `ventas_clientes`.
- Sintaxis JavaScript validada con `node --check`.

## Nota operativa

La creación del cliente y del contacto son dos solicitudes consecutivas porque el backend actual expone endpoints separados. Si el cliente se crea y el contacto falla, la pantalla informa el resultado parcial y conserva el cliente creado.
