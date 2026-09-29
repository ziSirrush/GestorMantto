# FASE 3/4 — Seguimiento Especial · TICKET · Detalle Frontend V001

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299`
- Versión base: `Version 092826.3`
- Blob base `modules/seguimiento-especial/seguimiento-especial-global.js`: `484d90b7ec42635c12b306d7ab170fa96483152b`
- Blob base `core/module-loader.js`: `4d860da8a89e194fe14bb1908bb32c8c730d0481`

## Dependencias

Antes de esta fase deben estar aplicadas:

1. `FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001`
2. `FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001`
3. Tabla `seguimiento_especial` ya creada según la decisión arquitectónica cerrada.

## Objetivo

Agregar el tercer target administrable al control existente de Seguimiento Especial:

- Proyecto — comportamiento actual, sin cambios.
- Equipo — comportamiento actual, sin cambios.
- **Ticket — nuevo en Fase 3.**

Esta fase trabaja exclusivamente el control dentro de **Detalle Ticket**. La pestaña/listado de Tickets dentro del módulo Seguimiento Especial corresponde a Fase 4.

## Flujo implementado

### Lectura

Al abrir un detalle con payload:

```text
route = detalle
type  = ticket
id    = 254013
```

el control consulta:

```http
GET /api/tickets/254013/seguimiento-especial
```

La respuesta de Fase 1 determina si el switch aparece activo o inactivo.

### Escritura

Al cambiar el switch:

```http
PUT /api/tickets/254013/seguimiento-especial
Content-Type: application/json

{ "activo": true }
```

O:

```json
{ "activo": false }
```

`setTicket()` actualiza únicamente el estado local de ese Ticket y emite `mantto:seguimiento-especial-actualizado`. No ejecuta una recarga completa de Portafolio.

## Regla de exclusividad

Activar Ticket significa exclusivamente:

```text
TICKET 254013 -> Seguimiento Especial
```

No implica:

```text
Proyecto del Ticket   -> NO
Equipo del Ticket     -> NO
Otros Tickets         -> NO
```

## Indicador visual

El control conserva `SEGUIMIENTO_ESPECIAL` como código visual y continúa delegando el símbolo real a `EstadosVisuales_gnral`.

Fase 3 agrega un estado local `trackedTickets` para que el encabezado del Detalle Ticket pueda mostrar el indicador mientras ese Ticket está activo. No se amplía todavía la decoración textual general a números de Ticket.

## Permisos y Visor

No se crea ni cambia ningún permiso.

La gestión continúa usando:

```text
PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO
```

El modo Visor conserva la regla personal vigente: no puede activar/desactivar Seguimiento Especial de otro usuario.

## Archivos modificados

- `modules/seguimiento-especial/seguimiento-especial-global.js`
- `core/module-loader.js`
- `backend/package.json` — registra la prueba dirigida de Fase 3 en la suite existente.

## Archivo nuevo de validación

- `validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js`

## Documentación nueva

- `docs/ADR_20260929_SEGUIMIENTO_ESPECIAL_TICKET_DETALLE_FRONTEND_V001.md`
- `docs/README_FASE_3_SEGUIMIENTO_ESPECIAL_TICKET_DETALLE_FRONTEND_V001.md`
- `docs/MANIFEST_FASE_3_SEGUIMIENTO_ESPECIAL_TICKET_DETALLE_FRONTEND_V001.txt`
- `docs/CHECKSUMS_FASE_3_SEGUIMIENTO_ESPECIAL_TICKET_DETALLE_FRONTEND_V001_SHA256.txt`

## Qué NO cambia

- `modules/seguimiento-especial/seguimiento-especial.js` — el listado sigue mostrando únicamente Proyecto/Equipo hasta Fase 4.
- `modules/seguimiento-especial/seguimiento-especial.css`.
- `portafolio_interes`.
- tabla `seguimiento_especial`.
- backend de Fase 1.
- resolver/notificaciones de Fase 2.
- SQL.
- permisos.
- eventos de notificación.

## Validaciones ejecutadas

### Sintaxis / estructura

- `node --check modules/seguimiento-especial/seguimiento-especial-global.js` → PASS.
- `node --check core/module-loader.js` → PASS.
- `node --check validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js` → PASS.
- parse JSON de `backend/package.json` → PASS.

### Prueba dirigida Fase 3

```bash
node --test validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js
```

Resultado: **16/16 PASS**.

Incluye prueba de ejecución aislada que confirma:

- `PUT` exacto al endpoint Ticket;
- alta/baja del estado local de la estrella;
- evento `mantto:seguimiento-especial-actualizado`;
- bloqueo antes del backend cuando se usa modo Visor.

### Cadena dirigida Fases 1 + 2 + 3

Se montaron temporalmente los archivos entregados de las tres fases y se ejecutaron juntas sus pruebas específicas:

```text
Fase 1: 11 casos
Fase 2: 13 casos
Fase 3: 16 casos
TOTAL : 40/40 PASS
```

### No ejecutado

- Suite completa del repositorio: no ejecutada porque este entorno no dispone de un checkout completo de `GestorMantto`.
- Navegador/E2E real: no ejecutado.
- Aiven: no consultado ni modificado.
- Azure/Netlify/GitHub: no desplegado ni modificado.

## Instalación

Copiar el contenido del ZIP sobre la raíz del repositorio conservando rutas.

Después, desde la raíz:

```powershell
node --check .\modules\seguimiento-especial\seguimiento-especial-global.js
node --check .\core\module-loader.js
node --test .\validation\seguimiento-especial-ticket-fase3-frontend-detalle.test.js
```

Con el repositorio completo y Fases 1/2 aplicadas también puede ejecutarse:

```powershell
Set-Location .\backend
npm test
```

No aplicar SQL para Fase 3.

## Siguiente fase

**Fase 4/4** incorporará Tickets al contenido del módulo Seguimiento Especial, consumiendo el listado backend ya disponible en Fase 1, sin modificar la persistencia ni el motor de notificaciones.
