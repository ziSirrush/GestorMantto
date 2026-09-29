# ADR · EQUIPO_SALE_DE_CRITICO · FASE 2 V001

**Fecha:** 2026-09-29  
**Repositorio base:** `ziSirrush/GestorMantto`  
**Rama:** `main`  
**Commit base:** `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` (`Version 092826.3`)

## Contexto
Fase 1 detecta `EQUIPO_SALE_DE_CRITICO` cuando un cambio sincronizado de Tickets provoca la transición real del equipo:

`>= 3 fallas BLT U35` → `< 3 fallas BLT U35`.

Faltaba cubrir el caso donde nadie modifica Tickets, pero el avance del calendario expulsa una falla de la ventana de 35 días.

## Decisión
Agregar un job backend diario que reconstruye dos estados usando las mismas fuentes actuales:

- estado anclado al día anterior;
- estado anclado al día actual.

Para cada equipo operativo de Portafolio se cuentan fallas BLT con la misma frontera temporal usada por el motor vigente. Solo se genera evento cuando:

- ayer: `>= 3`;
- hoy: `< 3`.

No se crea tabla de snapshots ni estado histórico nuevo.

## Programación
Valores por defecto:

- zona horaria: `America/Mexico_City`;
- hora: `00:10`;
- revisión interna: cada 60 segundos;
- recuperación: si el backend inicia después de la hora programada, procesa el último día vencido pendiente en ese proceso;
- reintento tras error: 5 minutos.

Variables:

- `CRITICOS_SALIDA_U35_ENABLED`
- `CRITICOS_SALIDA_U35_TZ`
- `CRITICOS_SALIDA_U35_HOUR`
- `CRITICOS_SALIDA_U35_MINUTE`
- `CRITICOS_SALIDA_U35_INTERVAL_MS`

## Deduplícación
Cada transición automática utiliza identidad lógica:

`critical-exit-u35:<equipo>:date:<fecha>:from:<antes>:to:<después>`

La unicidad persistente del motor de Notificaciones evita duplicar una interacción por usuario incluso ante reinicio o múltiples instancias.

## Destino
La salida automática no tiene un Ticket causante. Por ello:

- acción emitida: `ABRIR_MODULO`;
- ruta: `criticos`;
- alcance: ZOP del equipo;
- contexto Seguimiento Especial: `UNITED / EQUIPO`.

Fase 1 conserva su destino explícito `ABRIR_TICKET` porque sí existe un Ticket que provoca el cambio.

## Catálogo
Fase 2 NO crea un segundo evento. Reutiliza `EQUIPO_SALE_DE_CRITICO` creado en Fase 1 y solo amplía su descripción/default de navegación para reflejar ambas causas:

1. cambio de Tickets;
2. vencimiento automático U35.

No se crean ni modifican relaciones Evento → Rol.

## Fronteras
Esta fase:

- no modifica `ticket-critical-notifications_uni.service.js`;
- no cambia `NUEVO_EQUIPO_CRITICO`;
- no cambia la regla 3/35;
- no crea tablas;
- no agrega frontend;
- no hardcodea Roles;
- no convierte el evento en follow-only.

## Limitación explícita de recuperación
La recuperación reconstruye ayer/hoy a partir de los valores actuales de `tickets`. Si durante una caída prolongada del backend otra vía modifica retroactivamente responsabilidad, equipo o fecha de un Ticket antes de ejecutar la recuperación, no existe snapshot histórico para reconstruir el valor anterior. Se acepta esta frontera para evitar una tabla nueva; el flujo normal del Gestor reduce este riesgo porque las mutaciones de Tickets pasan por el backend/sync.
