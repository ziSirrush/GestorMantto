# FIX 01.2 - Restaurar Tabla Portafolio congelada

## Objetivo
Corregir exclusivamente el alcance involuntario introducido por FIX 01.1 sobre la Tabla Portafolio.

## Cambio aplicado
- `getPortafolioDashboard` conserva la lógica comercial de FIX 01.1 basada en `estatus_cobranza`.
- `getPortafolioEquipos` vuelve exactamente al handler validado/anterior:
  `legacyController.getPortafolioEquipos`.

## No se modifica
- Frontend de la Tabla Portafolio.
- CSS de Portafolio.
- Filtros existentes.
- Detalle Proyecto.
- Detalle Equipo.
- Tickets.
- Aiven / estructura de BD.
- Apps Script / sincronización.
- Otros módulos o elementos en Nevera.

## Regla comercial que permanece vigente en Dashboard
- `estatus_servicio = No en Servicio` -> No en Servicio.
- En otro caso, `estatus_cobranza = En Cobranza` -> En Cobranza.
- En otro caso, `estatus_cobranza = Gratuito` -> Gratuito / Garantía.
- `estatus_cobranza` NULL/vacío -> no cuenta en KPI comercial.

## Archivo modificado
- `backend/src/modules/portafolio/portafolio.repository.js`

## Validaciones
- Diferencia respecto a FIX 01.1: una sola asignación de handler.
- `node --check backend/src/modules/portafolio/portafolio.repository.js`: OK.
- GitHub `main` verificado antes de generar: `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`.

## Aplicación
Aplicar después de FIX 01.1. Este paquete solo corrige el handler de la Tabla Portafolio y no sustituye los archivos comerciales de FIX 01.1.
