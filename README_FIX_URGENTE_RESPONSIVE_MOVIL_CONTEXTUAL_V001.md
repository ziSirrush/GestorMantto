# FIX URGENTE RESPONSIVE MOVIL CONTEXTUAL V001

## Base revisada
- Repositorio: `ziSirrush/GestorMantto`
- Commit: `8c1bf05419aac8a03f8456ccfe530f598eb4c130`
- Fecha de revision: 20/08/2026

## Causa localizada
En responsive, `#app-context-nav` cambia a una rejilla de dos columnas pero mantiene un tercer bloque `.daily-phrase-stack`. Ese bloque contiene tambien `#app-build-version`. En pantallas estrechas puede ampliar la columna automatica y dejar casi sin ancho a `.app-context-title-wrap`; el titulo/subtitulo se parte verticalmente y la barra contextual crece cientos de pixeles. Como el `body` trabaja con `overflow:hidden`, la vista real queda empujada fuera del area visible y en iPhone aparenta una pantalla blanca sin desplazamiento util.

## Cambio aplicado
Solo se modifica `styles/device-permissions.css`, que actualmente se carga al final de las hojas de estilo del `<head>` y permite aplicar el override responsive sin tocar modulos congelados.

Para `max-width: 920px`:
- Barra contextual fija en 56 px.
- Solo se muestran el boton Back y `#app-context-title`.
- `#app-context-subtitle` se oculta.
- `.daily-phrase-stack` se oculta completa: fecha, hora, frase y version global dejan de ocupar espacio.
- El titulo queda en una sola linea con ellipsis si es demasiado largo.
- Se conserva el scroll interno de `.view.active` y `-webkit-overflow-scrolling: touch` para iOS.

Ejemplo esperado:
`[ <- Proyectos ]   Detalle Proyecto`

## Version de la aplicacion
No se elimina la version del sistema. El modulo Usuarios / Mi perfil ya la muestra mediante `window.ManttoBuildInfo.getProfileLabel()` dentro de `#usr-app-version`; por eso no se modifica `modules/usuarios/usuarios.js`.

## No modificado
- Backend
- Base de datos
- Router
- Logica del boton Back
- Titulos definidos por cada vista
- Sidebar
- Modulos funcionales
- Nori

## Validaciones estaticas
- Bloques `{}` CSS balanceados.
- Override limitado a `max-width:920px`.
- No se modifica ningun selector funcional de permisos.
- La regla de scroll de la vista activa permanece disponible.
