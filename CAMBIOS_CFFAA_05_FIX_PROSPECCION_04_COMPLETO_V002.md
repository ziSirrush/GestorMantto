# CFFAA-05 FIX Prospeccion 04 Completo V002

## Motivo

El validador CFFAA-04 ya estaba presente, pero el servicio local de Prospeccion no correspondia a la version aprobada de CFFAA-04 y no exportaba `presentProspectionFile`.

## Archivos restaurados

- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.service.js`
- `backend/scripts/validate-cffaa-04.js`
- `modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js`
- `modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.css`

## Alcance

Restaura exclusivamente los archivos propios de Prospeccion aprobados en CFFAA-04. No reemplaza `index.html`, `storage-schema.service.js`, Cotizaciones, Home, Soporte ni archivos acumulativos de CFFAA-05.

El validador ahora informa de forma explicita cuando el servicio instalado no exporta `presentProspectionFile`, en lugar de terminar con un `TypeError` poco descriptivo.

## Validacion

Desde `backend`:

```powershell
npm run check
node scripts/validate-cffaa-04.js
node scripts/validate-cffaa-05.js
```
