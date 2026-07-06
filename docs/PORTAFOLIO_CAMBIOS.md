# Portafolio adaptado a Aiven - correccion Home autorizado

## Correccion aplicada

Esta version parte del `index.html` original del proyecto publicado y conserva intacto el Home autorizado. Los cambios al frontend se limitan a la logica de Portafolio:

- Mapeo de `tipo_equipo_calc` cuando venga desde API.
- Mapeo de `contrato_calc` cuando venga desde API.
- Normalizacion de `inactivo` usando `normalizeBoolAiven()` y valor `x`.
- Carga de `/api/portafolio?limit=50000`.
- Ajuste de filtros de Portafolio para excluir inactivos correctamente.
- Comentarios actualizados para Aiven/Railway.

## Backend

Cambio minimo en `getProyectos()`:

- `MAX(zona)` se corrigio a `MAX(zona_operativa) AS zona`.
- `MAX(supervisor)` se corrigio a `MAX(supervisor_zona) AS supervisor`.

No se modifico la autorizacion del Home, ni la estructura del panel Home, ni el control de visibilidad de botones.

## Importante

No usar el ZIP anterior. Este paquete reemplaza la entrega anterior.
