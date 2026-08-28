# FIX_NOTIFICACIONES_POPOVER_WRAP_FECHA_V001

Base verificada: `ziSirrush/GestorMantto` commit `42b3ccbda44f93e62018152a830ac7744f5a6980`.

## Archivo modificado
- `styles/home.css`

## Cambio
- El popover de la campana deja de heredar `white-space: nowrap` desde `.hdr-right`.
- Título y mensaje envuelven dentro de la tarjeta.
- Se elimina el desbordamiento horizontal del listado.
- La fecha conserva una sola línea y no se trunca ni cambia su formato.
- No se modifica JavaScript, backend, BD, rutas, lógica ni datos de notificaciones.

## Validación estática
- La columna de contenido usa `minmax(0,1fr)`.
- Título/mensaje usan wrap seguro.
- Fecha usa `white-space: nowrap`.
- El listado usa `overflow-x: hidden`.

## Despliegue
Este paquete no realiza commit ni despliegue. Reemplazar `styles/home.css` y validar visualmente antes de publicar.

## Verificación de integridad de base
El contenido anterior al bloque del FIX reproduce exactamente el blob de `styles/home.css` del commit base:
`9698c4a4363b684327f933ab512b958fd57534e3`.
