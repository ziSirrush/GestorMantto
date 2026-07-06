# Corrección visual Pruebas V1

Este paquete corrige la carga visual observada en navegador:

- Se incluye la carpeta completa `pruebas/` con `styles/`, `core/` y `modules/`.
- Se agrega cache-busting a CSS/JS para evitar que el navegador use versiones viejas.
- Se agrega regla crítica inline para ocultar correctamente `auth-screen` o `app` según sesión.
- La navegación mantiene: módulos no integrados => En construcción / En desarrollo.
- El botón `Cerrar sesión` queda separado del botón de usuario.

Importante: reemplazar la carpeta completa `pruebas`, no solo `index.html`.
