# FASE 4/4 — Seguimiento Especial · TICKET · Listado Frontend V001

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299`
- Versión base: `Version 092826.3`
- Blob main `modules/seguimiento-especial/seguimiento-especial.js`: `f9a90b77e8eb71236052180462461b8b6c8ece31`
- Blob main `modules/seguimiento-especial/seguimiento-especial.css`: `9c25043558a33a077b87e9807a2fa9f8e4e5bcf0`
- Blob main `modules/seguimiento-especial/seguimiento-especial-global.js`: `484d90b7ec42635c12b306d7ab170fa96483152b`
- Blob main `core/module-loader.js`: `4d860da8a89e194fe14bb1908bb32c8c730d0481`

## Dependencias

Antes de aplicar esta fase deben estar aplicadas:

1. `FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001`
2. `FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001`
3. `FASE_3_SEGUIMIENTO_ESPECIAL_TICKET_DETALLE_FRONTEND_V001`
4. Tabla `seguimiento_especial` ya creada.

## Objetivo

Cerrar la integración de TICKET incorporándolo a la pantalla existente de Seguimiento Especial sin mezclar persistencias.

Resultado final:

```text
Seguimiento Especial
├── Proyectos
├── Equipos
└── Tickets
```

Persistencia:

```text
Proyecto / Equipo -> portafolio_interes
Ticket            -> seguimiento_especial
```

## Flujo de lectura

`refresh()` consulta en paralelo:

```http
GET /api/portafolio/seguimiento-especial
GET /api/seguimiento-especial/tickets
```

El frontend construye un único snapshot:

```text
proyectos[]
equipos[]
tickets[]
resumen.proyectos
resumen.equipos
resumen.tickets
```

No se altera el contrato backend de Portafolio.

## UI agregada

### KPI

Se agrega el contador **Tickets**.

### Bloque Tickets

Columnas:

- Ticket
- Proyecto
- Equipo
- Estado
- Prioridad
- Responsabilidad
- Último cambio
- Acciones

### Buscar

La búsqueda existente también filtra Tickets usando los campos presentes en cada fila.

### Abrir

Abre:

```text
detalle / ticket / <ticket>
```

### Quitar

Usa `setTicket(ticket, false)`, que persiste exclusivamente la baja lógica de ese Ticket y vuelve a sincronizar el snapshot.

## Indicador visual

Fase 4 completa `trackedTickets` con el listado backend. El indicador `SEGUIMIENTO_ESPECIAL` puede aparecer también sobre referencias de Ticket en las vistas Mantto compatibles.

El símbolo no se hardcodea; sigue resolviéndose mediante `EstadosVisuales_gnral`.

## Archivos modificados

- `modules/seguimiento-especial/seguimiento-especial-global.js`
- `modules/seguimiento-especial/seguimiento-especial.js`
- `modules/seguimiento-especial/seguimiento-especial.css`
- `core/module-loader.js`
- `backend/package.json`
- `validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js` — ajuste de compatibilidad de pruebas; no cambia funcionalidad de Fase 3.

## Archivo nuevo de validación

- `validation/seguimiento-especial-ticket-fase4-listado-frontend.test.js`

## Documentación nueva

- `docs/ADR_20260929_SEGUIMIENTO_ESPECIAL_TICKET_LISTADO_FRONTEND_V001.md`
- `docs/README_FASE_4_SEGUIMIENTO_ESPECIAL_TICKET_LISTADO_FRONTEND_V001.md`
- `docs/MANIFEST_FASE_4_SEGUIMIENTO_ESPECIAL_TICKET_LISTADO_FRONTEND_V001.txt`
- `docs/CHECKSUMS_FASE_4_SEGUIMIENTO_ESPECIAL_TICKET_LISTADO_FRONTEND_V001_SHA256.txt`

## Qué NO cambia

- `portafolio_interes`.
- estructura de `seguimiento_especial`.
- Repository/Service/Controller/Routes de Fase 1.
- resolver/notificaciones de Fase 2.
- eventos de notificación.
- permisos.
- SQL.
- Aiven.
- Azure.
- Netlify.
- GitHub.

## Validaciones ejecutadas

### Sintaxis / estructura

PASS:

```text
node --check modules/seguimiento-especial/seguimiento-especial-global.js
node --check modules/seguimiento-especial/seguimiento-especial.js
node --check core/module-loader.js
node --check validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js
node --check validation/seguimiento-especial-ticket-fase4-listado-frontend.test.js
parse backend/package.json
```

### Prueba dirigida Fase 4

```bash
node --test validation/seguimiento-especial-ticket-fase4-listado-frontend.test.js
```

Resultado: **16/16 PASS**.

Incluye pruebas de ejecución aislada para comprobar:

- consulta simultánea de Portafolio y Tickets;
- fusión en un solo snapshot;
- `trackedTickets` por número de Ticket e `id_ticket`;
- baja exacta del Ticket;
- resincronización posterior al PUT.

### Compatibilidad Fase 3 + Fase 4

Resultado: **32/32 PASS**.

### Cadena dirigida Fases 1 + 2 + 3 + 4

Se montaron temporalmente los archivos entregados de las cuatro fases y se ejecutaron juntas sus pruebas específicas.

```text
Fase 1: 11 casos
Fase 2: 13 casos
Fase 3: 16 casos
Fase 4: 16 casos
TOTAL : 56/56 PASS
```

### No ejecutado

- Suite completa del repositorio: no ejecutada porque este entorno no dispone de un checkout completo de `GestorMantto`.
- E2E navegador real: no ejecutado.
- Aiven: no consultado ni modificado.
- GitHub/Azure/Netlify: no modificados ni desplegados.

## Instalación

Copiar el contenido del ZIP sobre la raíz del repositorio conservando rutas.

Después, desde la raíz:

```powershell
node --check .\modules\seguimiento-especial\seguimiento-especial-global.js
node --check .\modules\seguimiento-especial\seguimiento-especial.js
node --check .\core\module-loader.js
node --test .\validation\seguimiento-especial-ticket-fase3-frontend-detalle.test.js .\validation\seguimiento-especial-ticket-fase4-listado-frontend.test.js
```

Con el repositorio completo y Fases 1–3 aplicadas:

```powershell
Set-Location .\backend
npm test
```

No aplicar SQL para Fase 4.

## Estado del desarrollo

Con esta entrega queda cerrada la secuencia definida:

```text
Fase 1 -> Backend persistencia/API TICKET
Fase 2 -> Backend notificaciones TICKET
Fase 3 -> Frontend control Detalle Ticket
Fase 4 -> Frontend listado Tickets
```
