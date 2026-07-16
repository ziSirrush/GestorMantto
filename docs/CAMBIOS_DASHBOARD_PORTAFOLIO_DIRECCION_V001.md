# Dashboard Portafolio - Cambios Direccion V001

## Cambios

- KPI ordenados como: Total Portafolio, En Cobranza, Gratuito/Garantia, Conversiones, Funcionando y Parados.
- Conversiones queda visible con el valor "En desarrollo" hasta que Direccion defina su regla.
- Funcionando y Parados muestran porcentaje y cantidad de equipos.
- Se aplica la regla comercial excluyente:
  1. No en Servicio.
  2. Gratuito/Garantia.
  3. En Cobranza para todo lo demas.
- La suma En Cobranza + Gratuito/Garantia + No en Servicio coincide con Total Portafolio.
- Se retiro la tabla independiente de Equipos parados.
- La tabla principal se renombro a Tabla Portafolio y conserva los filtros ya configurados.
- Proyectos de Mantenimiento no fue modificado.

## Archivos modificados

- `index.html`
- `modules/portafolio/portafolio.html`
- `modules/portafolio/portafolio.css`
- `modules/portafolio/portafolio.js`
- `backend/src/controllers/data.controller.js`

## Validaciones

- Sintaxis de frontend y backend con `node --check`.
- Rutas y nombres de controladores existentes sin cambios.
- HTML sin IDs duplicados.
- Cache busting actualizado en `index.html`.
- Backend inicia y `/api/health` responde; la conexion a Aiven no pudo completarse en el entorno de validacion por `EAI_AGAIN` DNS.
