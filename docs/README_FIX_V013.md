# FIX V013 — Historial interno de Cobranza United

## Objetivo
Corregir el flujo de navegación MAIN → Detalle → Back en Gestión de Crédito, Mantenimiento Preventivo y Venta Adicional.

## Corrección
- Abrir un detalle desde la MAIN ahora navega mediante `ManttoRouter.go()` sobre la misma ruta del módulo y guarda el ID del detalle en el payload.
- Por ello, el Back global vuelve primero a la MAIN del mismo módulo en lugar de saltar a otro módulo visitado anteriormente.
- Al pulsar nuevamente el módulo desde el sidebar, la ruta llega sin payload: se limpia el detalle y se renderiza la MAIN.
- Se conserva la navegación cruzada entre Gestión de Crédito, MP y Venta Adicional.

## Archivos modificados
- `modules/cobranza-uni/cobranza-uni.js`

`cobranza-uni.css` se incluye sin cambios para conservar el paquete acumulativo del V012.

## No se modifica
- `index.html`
- `core/router.js`
- sidebar
- permisos
- backend
- Aiven / SQL

## Validación
- Sintaxis JS validada con `node --check`.
- MAIN de cada módulo fuerza estado MAIN cuando se entra desde sidebar sin payload.
