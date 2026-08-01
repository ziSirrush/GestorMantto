# FIX URGENTE RESPONSIVE PANTALLA FIJA V002

## Causa encontrada
El FIX V001 evitaba el autozoom de iOS al enfocar formularios, pero mantenía habilitado el zoom manual. Durante el desplazamiento horizontal de tablas era posible activar accidentalmente un gesto de ampliación y alterar la escala de toda la aplicación.

## Cambios aplicados
- Se conserva el ajuste de 16 px en controles móviles del FIX V001.
- Se fija la escala del viewport en 1.0.
- Se deshabilita el zoom manual mediante gesto o doble toque.
- Se mantiene habilitado el desplazamiento horizontal y vertical para tablas y contenedores.
- Se agrega `viewport-fit=cover` para aprovechar correctamente la pantalla en dispositivos iOS.
- Se actualiza la versión de `base.css` para evitar caché.

## Archivos incluidos
- `index.html`
- `styles/base.css`

## Validaciones realizadas
- La etiqueta viewport conserva `width=device-width`.
- La escala mínima y máxima quedan fijadas en 1.0.
- El scroll horizontal y vertical permanece habilitado mediante `touch-action: pan-x pan-y`.
- Se conserva la prevención del autozoom de formularios del FIX V001.
- No se modificaron módulos, backend, rutas ni base de datos.

## Consideración
Este cambio bloquea intencionalmente la ampliación manual de la interfaz en dispositivos móviles, conforme a la solicitud aprobada.
