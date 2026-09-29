# ADR — Seguimiento Especial · TICKET · Listado Frontend V001

**Fecha:** 2026-09-29  
**Repositorio:** `ziSirrush/GestorMantto`  
**Rama:** `main`  
**Base verificada:** `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` — `Version 092826.3`

## Contexto

Seguimiento Especial ya cuenta con dos persistencias conceptualmente separadas:

- `portafolio_interes`: Proyecto/Equipo del dominio UNITED Portafolio.
- `seguimiento_especial`: capa general para entidades puntuales; TICKET es su primer consumidor.

Fases previas cerraron:

1. Persistencia/API TICKET.
2. Integración con notificaciones.
3. Control ON/OFF dentro de Detalle Ticket.

Faltaba exponer los Tickets activos dentro de la pantalla existente de Seguimiento Especial.

## Decisión

La pantalla Seguimiento Especial mostrará tres niveles en una sola vista personal:

```text
Seguimiento Especial
├── Proyectos  -> portafolio_interes
├── Equipos    -> portafolio_interes
└── Tickets    -> seguimiento_especial
```

No se fusionan tablas ni reglas de negocio. La unión existe solamente en el snapshot frontend y en la presentación.

## Fuentes backend

El frontend combinará en paralelo:

```http
GET /api/portafolio/seguimiento-especial
GET /api/seguimiento-especial/tickets
```

La primera consulta conserva Proyecto/Equipo. La segunda devuelve exclusivamente suscripciones TICKET activas del usuario dentro de su alcance.

## Contrato de Ticket listado

La pantalla usa los datos vivos devueltos desde la entidad fuente `tickets`, incluyendo cuando estén disponibles:

- `ticket`
- `proyecto` / `proyecto_padre`
- `codigo_equipo` / `equipo`
- `estado_ticket` / `estado`
- `prioridad`
- `responsabilidad`
- `updated_at`

No se copia ni se inventa información adicional en `seguimiento_especial`.

## Acciones

### Abrir

```text
Ticket 254013 -> Detalle Ticket 254013
```

### Quitar

```http
PUT /api/tickets/254013/seguimiento-especial
Content-Type: application/json

{ "activo": false }
```

Quitar un Ticket afecta exclusivamente esa suscripción.

## Indicador visual

El snapshot global incorpora `tickets` y reconstruye `trackedTickets`. Desde Fase 4 el decorador textual puede reconocer también referencias de Ticket, manteniendo `SEGUIMIENTO_ESPECIAL` como código semántico y delegando el símbolo real a `EstadosVisuales_gnral`.

## Compatibilidad

- Proyecto/Equipo mantienen su comportamiento vigente.
- No se cambia `portafolio_interes`.
- No se cambia la tabla `seguimiento_especial`.
- No se agregan endpoints.
- No se agregan eventos de notificación.
- No se cambian permisos.
- El modo Visor continúa sin gestionar estado personal.

La prueba de Fase 3 se actualiza únicamente para retirar aserciones temporales que afirmaban que Fase 4 todavía no existía. Sus contratos funcionales de Detalle Ticket permanecen validados.

## Consecuencia

El terreno general queda listo para que futuras entidades puntuales puedan incorporarse al mismo módulo mediante su propia integración, sin obligar a migrar `portafolio_interes` ni a crear lógica ficticia antes de que exista una necesidad real.
