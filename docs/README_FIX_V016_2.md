# FIX V016.2 — Build version + móvil + perfil

Base acumulativa: `Pre deploy Cobranza Uni.zip` validado.

## Cambios
1. GitHub Pages (actual): workflow genera `core/build-info.generated.js` con el `git commit -m` y SHA del commit realmente desplegado.
2. Netlify (futuro): conserva generación automática mediante `netlify.toml`.
3. Barra contextual: versión técnica visible solo para rol exacto `Programador`.
4. Mi Perfil: al final aparece la misma versión en texto gris para todos los usuarios.
5. Móvil <= 920 px: el launcher del Visor de usuario desaparece del header. El Visor continúa disponible dentro de Panel de Control mediante la pestaña ya existente y sus mismos permisos.

## GitHub Pages — ajuste único requerido
En GitHub: Settings > Pages > Build and deployment > Source = **GitHub Actions**.
Mientras Pages siga en `Deploy from a branch`, el navegador mostrará `DEPLOY · metadata de commit no generada`, porque GitHub no inyecta el mensaje del commit en archivos estáticos publicados directamente desde rama.

## No modifica
- Cobranza United.
- Portafolio.
- Backend / API / Aiven.
- Rutas ni permisos del Visor.
- Lógica de Panel de Control.

## Validaciones
- `node --check` en JS modificados/nuevos.
- Sidebar Cobranza United conserva Gestión de Crédito, Mantenimiento Preventivo y Venta Adicional.
- Ruta/view `cobranza-uni-mp-pro` conservada en el `index.html` base.
- El workflow de Pages y Netlify usan el mismo generador de metadata.
