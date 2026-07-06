# Panel lateral V0.1

## Objetivo
Ajustar el panel lateral al orden y nombres autorizados para la etapa actual de Mantto Gestor.

## Archivos modificados
- `pruebas/index.html`
- `pruebas/core/router.js`

## Cambios
- Se retiraron del panel lateral los accesos que no corresponden a la lista actual autorizada.
- Se respetó el orden solicitado:
  1. Resumen del día
  2. Equipos Críticos
  3. Dashboard Call Center
  4. Dashboard Operativo
  5. Dashboard Portafolio
  6. Movimientos Portafolio
  7. Proyectos
  8. Usuarios
  9. Panel de Control
- `Dashboard Portafolio` queda ligado al módulo real `portafolio`.
- `Proyectos` queda ligado al módulo real `proyectos`.
- Los módulos pendientes permanecen como placeholder de construcción mediante el router.
- Se agregaron rutas visibles para `operativo` y `movimientos` en el router.

## No modificado
- Home
- Resumen del Día
- Equipos Críticos
- Portafolio
- Proyectos
- Backend
- CSS global
