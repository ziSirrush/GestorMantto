# FIX Compatibilidad Visor + Sync silenciosa + Guardado selectivo V008

## Base y objetivo

Este paquete se aplica sobre `FIX_VISOR_USUARIOS_COMPLETO_FASES_1_2_3_V007`.
Integra sin sobrescribir el Visor:

1. `FIX_SYNC_SILENCIOSA_SIN_REINICIAR_VISTA_V001`.
2. `FIX_PANEL_CONTROL_GUARDADO_SELECTIVO_ESTADO_V006`.

## Problema corregido

La Fase completa del Visor incluía una versión anterior de `core/data-sync.js`. Al publicarla, se perdía la protección que evita que las sincronizaciones automáticas llamen funciones generales como `refresh`, `reload`, `load` o `init`, las cuales pueden reconstruir la pantalla y perder el contexto visual.

No era seguro publicar directamente el ZIP de Sync silenciosa porque su `index.html` pertenece a una base anterior y habría revertido cambios posteriores, incluyendo referencias actuales del Visor, Asignación a Redes y otros módulos.

## Cambios incluidos

### Sincronización silenciosa

- Restaura el contrato explícito de sincronización en segundo plano.
- No utiliza automáticamente `refresh`, `reload`, `load` ni `init`.
- Conserva polling, revalidación y actualización posterior a mutaciones sin reconstruir la vista.
- Dashboard Ventas y Vendidos recuperan sus adaptadores silenciosos.

### Panel de Control

Al guardar permisos de un usuario o rol:

- envía únicamente las casillas modificadas;
- relee únicamente el usuario o rol seleccionado;
- confirma uno por uno los valores devueltos por Aiven;
- actualiza solamente las casillas, contadores y registro seleccionado;
- conserva pestaña, filtros, búsquedas, agrupaciones, foco y scroll;
- no ejecuta `window.location.reload()` ni reinicia toda la pantalla.

La barra debajo de Guardar muestra el avance real del proceso: preparación, envío, verificación, actualización local y confirmación.

### Visor de Usuarios

Se conserva íntegra la Fase 1, 2 y 3 del Visor. Este paquete no reemplaza:

- `core/auth.js`;
- `core/user-viewer.js`;
- `core/viewer-readonly.js`;
- rutas, controlador, servicios o middleware del Visor.

## Archivos modificados

- `index.html`
- `core/data-sync.js`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-vendidos/ventas-vendidos.js`
- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Despliegue

Solo frontend. No requiere SQL ni backend.

Publicar este paquete después de V007. No publicar encima el ZIP original de Sync silenciosa.
