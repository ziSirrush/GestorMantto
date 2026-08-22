# FIX FRONTEND ALCANCE DE INFORMACION PANEL CONTROL V002

## Objetivo
Corregir la semantica del bloque **Acceso general** en la pestaña Alcance de informacion.

## Cambio aplicado
- `Ver toda la informacion de United` y `Ver toda la informacion de Corellian` pasan a mostrarse como **opcionales**.
- Ambos dominios pueden permanecer apagados.
- Cuando ambos estan apagados, el alcance restringido puede componerse con:
  - Ver su propia informacion.
  - `usuarios.reporta_a`.
  - `usuarios_rel_admin`.
  - Usuarios adicionales.
- Se aclara que marcar acceso completo a un dominio no habilita modulos nuevos; los permisos funcionales existentes siguen controlando a que modulos puede entrar el usuario.

## Archivos modificados
- `modules/panel-control/panel-control.js`
- `index.html` (solo cache-bust del JS de Panel de Control a V002)

## No modificado
- Backend.
- Tabla `usuarios_alcance_informacion`.
- Rutas GET/PUT de alcance.
- Filtros de Ventas o Instalaciones.
- CSS del Panel de Control.

## Validaciones
- Se verifico que V001 no contenia validacion JavaScript que obligara a seleccionar UNITED o CORELLIAN; la correccion necesaria era visual/semantica.
- `node --check modules/panel-control/panel-control.js` correcto.
