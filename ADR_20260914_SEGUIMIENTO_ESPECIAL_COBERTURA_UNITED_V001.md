# ADR 2026-09-14 · Seguimiento Especial como suscripción transversal UNITED · Fase 2

## Estado

Implementado en el paquete `FASE_2_SEGUIMIENTO_ESPECIAL_COBERTURA_UNITED_V001`.

## Contexto

El usuario que marca un Proyecto/Equipo en Seguimiento Especial ya fue autorizado por alcance UNITED y por el permiso de gestión de Seguimiento. La matriz del evento nativo no debe volver a convertir esa suscripción explícita en `SIN_ROL_ASOCIADO`.

FASE 1 corrigió la decisión del emisor. Quedaban dos necesidades:

1. cerrar la cobertura de productores UNITED actuales;
2. evitar que Campana/Push re-filtraran después una notificación ya creada para un follower.

## Decisión

- El evento nativo sigue siendo la verdad del negocio.
- Seguimiento Especial es una capa de destinatario, no un código de evento paralelo.
- `SEGUIMIENTO_ESPECIAL` se persiste como metadata semántica para followers autorizados.
- Campana y Push reconocen esa metadata y no vuelven a exigir rol nativo.
- El emoji no se hardcodea; el catálogo `estados_visuales` continúa siendo la fuente de presentación.
- Ticket Cerrado se detecta únicamente al entrar a estado Cerrado y muestra Estatus Final del Equipo.
- `estatus_servicio` de Portafolio mantiene `PORTAFOLIO_EQUIPO_CAMBIO`; las transiciones En Servicio/No en Servicio reciben presentación explícita.
- Comentarios y Vo.Bo. mantienen sus eventos nativos y contexto de Seguimiento.
- Deduplicación, rutas, criticidad y exclusión nativa del actor permanecen.

## Consecuencia

Un follower autorizado puede recibir el evento UNITED aunque no tenga relación Evento-Rol nativa. Un destinatario normal continúa exactamente sujeto a la matriz normal.

Si el mismo usuario llega por ambos caminos se conserva una sola notificación y se marca con `SEGUIMIENTO_ESPECIAL`.

## Límite

Los eventos UNITED futuros deben proporcionar `contextoSeguimiento` con suficiente identidad de Proyecto/Equipo/Zona para participar en esta capa. No se infieren relaciones de negocio ambiguas desde una ruta o texto libre.
