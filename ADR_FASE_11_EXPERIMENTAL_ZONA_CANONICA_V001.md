# ADR — Fase 11 · Zona canónica en Experimental

## Contexto
Las pruebas en Aiven mostraron que los textos `tickets.zona` y `portafolio.zona_operativa` pueden diferir de `portafolio.zona_id -> z_op.zona`.

Experimental ya tenía Guards por agrupación y builders de alcance por `usuario_zop`, pero algunas vistas seguían filtrando, catalogando o mostrando esos textos legacy.

## Decisión
La zona territorial canónica de UNITED es la zona estructurada de Portafolio:

- Equipo: `portafolio.zona_id -> z_op.zona`.
- Ticket con código: `tickets.codigo_equipo -> portafolio.numero_equipo -> portafolio.zona_id -> z_op.zona`.
- Ticket sin código: `proyecto/proyecto_padre -> Portafolio`, únicamente cuando todas las filas activas relacionadas resuelven a una única `zona_id`.

Los campos de zona legacy se conservan solo para trazabilidad.

## Consecuencias
- Un texto legacy incorrecto no amplía acceso ni cambia la zona mostrada.
- Los filtros de Experimental se mantienen dentro de los cuartos del usuario.
- Un ticket sin relación territorial inequívoca no obtiene una zona canónica.
- Equipos/Proyectos Críticos Experimental reutilizan el servicio general corregido anteriormente, evitando duplicación.
