# Backend Ventas Clientes V001

## Rutas

### Sync público, sin API key ni sesión
- `POST /api/ventas/clientes/sync`
- Acepta `{ "registros": [...] }`, `{ "records": [...] }` o un arreglo directo.
- Procesa internamente en bloques de 300 y usa transacciones.
- No requiere `id_cliente_origen`; genera una `clave_sync` interna SHA-256 con empresa, contacto, email y teléfono.
- También reconoce de forma opcional `🔒 Row ID`, `Row ID`, `row_id` o `id_cliente_origen`.

### Consultas autenticadas
- `GET /api/ventas/clientes`
- `GET /api/ventas/clientes/:id`
- `GET /api/ventas/clientes/kpis`
- `GET /api/ventas/clientes/catalogos`

Filtros de listado:
- `search` o `buscar`
- `tipo_cliente`
- `estatus_cliente`
- `ciudad`
- `estado`
- `iniciales`
- `page`, `page_size`, `sort_by`, `sort_direction`

### CRUD autenticado
- `POST /api/ventas/clientes`
- `PUT/PATCH /api/ventas/clientes/:id`
- `DELETE /api/ventas/clientes/:id` (borrado lógico)

## Visibilidad
Reutiliza `ventas-visibility.service.js`:
- Acceso total: ve todos los clientes activos.
- Acceso restringido: ve clientes relacionados por nombre con las cotizaciones visibles del usuario y clientes creados por él.

## Encabezados reconocidos del Sheet
- Nombre de la Empresa
- Razon Social / Razón Social
- Ciudad
- Estado
- Ubicacion / Ubicación
- Nombre del Contacto
- Email
- Telefono / Teléfono
- Tipo de Cliente
- Estatus con Cliente
- Proyecto Vendido
- Iniciales
- Visualiza
- Comentarios
- `🔒 Row ID` opcional

El encabezado `Creado` no se importa; la auditoría usa `created_at`, `created_by`, `updated_at`, `updated_by`.
