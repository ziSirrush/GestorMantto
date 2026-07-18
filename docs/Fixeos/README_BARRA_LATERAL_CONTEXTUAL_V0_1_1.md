# Correccion Barra Lateral Contextual V0.1.1

## Correcciones

- Los submenus cerrados ahora permanecen realmente ocultos.
- Solo un grupo puede estar expandido al mismo tiempo.
- Al cambiar de modulo se abre unicamente el grupo que contiene la ruta activa.
- Al entrar a Inicio, Usuarios o Panel de Control se cierran todos los grupos.
- Se sincroniza `aria-expanded` con el estado visual de cada grupo.

## Archivos modificados

- `styles/base.css`
- `core/app.js`
- `core/router.js`
