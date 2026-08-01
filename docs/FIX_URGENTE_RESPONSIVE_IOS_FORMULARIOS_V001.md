# FIX URGENTE RESPONSIVE IOS FORMULARIOS V001

## Causa encontrada
En el video se observa el autozoom del navegador móvil al abrir o enfocar campos de formularios y ventanas flotantes. Varias entradas usan tamaños de fuente menores a 16 px; Safari/iOS amplía automáticamente la vista al enfocarlas y conserva esa escala al cambiar de pantalla, obligando al usuario a reajustar manualmente.

## Cambio aplicado
- Se fuerza `font-size: 16px` únicamente en dispositivos de hasta 920 px para `input`, `select`, `textarea` y campos editables.
- Se limita el ancho de los controles al contenedor disponible.
- Se conserva el zoom manual del usuario; no se bloqueó la accesibilidad mediante `maximum-scale` ni `user-scalable=no`.
- Se actualizó la versión de `base.css` en `index.html` para evitar caché.

## Archivos modificados
- `styles/base.css`
- `index.html`

## Validaciones
- Estructura HTML sin alteraciones funcionales.
- Regla limitada a pantallas móviles/tablet.
- No se modificaron módulos en Nevera, backend, rutas ni base de datos.
- No se aplicaron reglas globales de escala o transformaciones.
