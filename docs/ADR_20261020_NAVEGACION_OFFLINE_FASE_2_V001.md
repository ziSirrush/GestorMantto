# ADR | 2026-10-20 | BLT NOW Navegación Offline, nueva Fase 2 V001

## Situación

La ruta normal `resumen` carga datos mediante `GET /api/operacion/resumen-dia/inicial`; la nueva Fase 1 de navegación offline permite ver esa ruta si existe copia local válida, pero no alimenta el frontend sin red. Reescribir la interfaz o duplicar los componentes crearía comportamientos divergentes.

## Decisión

Introducir un **adaptador de lectura transitorio y limitado** en `core/offline-resumen-dia.js`. Mantiene la interfaz y la lógica visual originales, sustituyendo localmente **solo** las lecturas GET indicadas cuando Fase 1 confirma modo OFFLINE y el usuario conserva una copia autorizada, firmada e íntegra. Se aplica con un puente restringido al origen de la API configurada y al contexto de navegación Resumen (incluido su detalle inmediato de ticket); cualquier otra solicitud continúa por los servicios existentes. No se permite confirmar mutaciones desde este puente.

La capa de transporte se modifica únicamente en el navegador: el Service Worker continúa impidiendo guardar respuestas API autenticadas en Cache Storage. Se precachean los recursos JS/CSS de la pantalla para abrirla sin haberla visitado en la sesión online.

## Límites

- No existe exportador de interacciones históricas ni de criticidad corporativa en la copia actual. No se fabrican datos ni se presentan ceros como un indicador verificado.
- Sólo se integra el dominio UNITED/Operación/Resumen. CORELLIAN requiere su Fase 3.
- No se interpretan permisos locales como autorización nueva en el backend. La revocación no se puede detectar durante aislamiento.
- La pantalla original necesita una carga completa para sus agregados; no se limita el número de filas, pero pueden existir límites de memoria según el equipo.

## Alternativas descartadas

1. Visor alterno separado de Modo Offline: rechazado por decisión del usuario (navegación normal).
2. Cachear respuestas reales de `/api/`: rechazado por aislamiento de identidad y riesgo de exposiciones.
3. Reescritura total del módulo de Resumen: mayor superficie de regresión en un módulo existente.

## Reversión

Revertir exclusivamente los archivos añadidos/modificados de esta entrega mediante control de versiones local, manteniendo la fase anterior. No se modifican tablas ni endpoints Azure.
